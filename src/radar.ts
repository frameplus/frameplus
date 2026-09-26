// ===== 인사이트 피드(PART A) · 공고 레이더(PART B) =====
// 설계서 v1.2(2026-09-26)를 현 스택(Hono + Cloudflare Pages + D1)에 맞춰 구현.
// - 스케줄: Pages는 Cron Trigger가 없으므로 .github/workflows/radar-cron.yml이 /api/cron/radar/* 를 호출한다.
// - D1/Workers 호출 한도 때문에 한 번의 크론 실행이 처리하는 소스 수를 제한하고(가장 오래된 순), 나머지는 다음 회차로 넘긴다.
import { Hono } from 'hono'

type Env = {
  DB: D1Database
  ANTHROPIC_API_KEY?: string
  GITHUB_TOKEN?: string
  G2B_API_KEY?: string
  NAVER_CLIENT_ID?: string
  NAVER_CLIENT_SECRET?: string
  GOOGLE_CSE_KEY?: string
  GOOGLE_CSE_CX?: string
}
type RadarApp = { Bindings: Env; Variables: { role: string; userId: string } }

const HAIKU = 'claude-haiku-4-5-20251001'
const UA = 'FramePlusInsight/1.0 (+https://www.frameplus.kr)'
const TOPICS = ['arch_ai', 'ai_news', 'ai_apps', 'mcp', 'api', 'github'] as const
const NEWS_MIN_SCORE = 60
const NEWS_SOURCES_PER_RUN = 6
const NEWS_ITEMS_PER_SOURCE = 20
const CRAWL_SOURCES_PER_RUN = 10
const DISCOVERY_QUERIES_PER_RUN = 8
const DISCOVERY_PAGES_PER_RUN = 12

// 공고 1차 키워드 필터 (B-5)
const BID_INCLUDE = ['인테리어', '실내건축', '리모델링', '사무환경', '사무실', '환경개선', '수장', '마감', '협력업체', '협력사', '파트너사', '등록', '모집']
const BID_EXCLUDE = ['채용', '구인', '인턴', '매각', '임대']
// 발견 엔진에서 건너뛸 도메인(나라장터는 API로 수집, 채용·부동산은 노이즈)
const DISCOVERY_SKIP_DOMAINS = ['g2b.go.kr', 'saramin.co.kr', 'jobkorea.co.kr', 'incruit.com', 'albamon.com', 'wanted.co.kr', 'zigbang.com', 'dabangapp.com', 'land.naver.com', 'blog.naver.com', 'tistory.com', 'youtube.com']

// ===================================================================
// 스키마 (migrations/0005_news_bids.sql 과 동일 — D1 exec는 줄 단위라 한 줄씩 유지)
// ===================================================================
const RADAR_DDL = [
  `CREATE TABLE IF NOT EXISTS news_sources (id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('rss','reddit','hn','github_atom','github_search','page_diff','email','youtube','threads')), topic_hint TEXT, url TEXT NOT NULL UNIQUE, interval_min INTEGER DEFAULT 60, enabled INTEGER DEFAULT 1, last_fetch_at TEXT, last_error TEXT, fail_count INTEGER DEFAULT 0, last_hash TEXT)`,
  `CREATE TABLE IF NOT EXISTS news_items (id INTEGER PRIMARY KEY, source_id INTEGER REFERENCES news_sources(id), topic TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, url_hash TEXT NOT NULL UNIQUE, author TEXT, published_at TEXT, raw_excerpt TEXT, summary_ko TEXT, why_relevant TEXT, score INTEGER, tags TEXT, bookmarked INTEGER DEFAULT 0, read_at TEXT, memo_id INTEGER, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_news_topic_pub ON news_items(topic, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_news_created ON news_items(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS memos (id INTEGER PRIMARY KEY, title TEXT NOT NULL, url TEXT, body TEXT, source TEXT, pid TEXT DEFAULT '', created_by TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE TABLE IF NOT EXISTS bid_sources (id INTEGER PRIMARY KEY, org TEXT NOT NULL, tier TEXT CHECK(tier IN ('T1','T2','T3','T4','T5','T6','T7')), group_name TEXT, branch_level TEXT DEFAULT 'hq' CHECK(branch_level IN ('hq','branch')), url TEXT NOT NULL UNIQUE, method TEXT CHECK(method IN ('api','crawl','chrome','discovery')), needs_login INTEGER DEFAULT 0, selector_json TEXT, interval_hours INTEGER DEFAULT 24, status TEXT DEFAULT 'approved' CHECK(status IN ('candidate','approved','rejected')), expected_month INTEGER, last_notice_at TEXT, discovered_from TEXT, enabled INTEGER DEFAULT 1, last_fetch_at TEXT, last_error TEXT)`,
  `CREATE TABLE IF NOT EXISTS org_dictionary (name TEXT PRIMARY KEY, tier TEXT, group_name TEXT, domain TEXT, source_list TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_orgdict_domain ON org_dictionary(domain)`,
  `CREATE TABLE IF NOT EXISTS search_queries (id INTEGER PRIMARY KEY, query TEXT NOT NULL, channel TEXT CHECK(channel IN ('google_alerts','google_cse','naver','kakao')), enabled INTEGER DEFAULT 1, last_run_at TEXT, hits_30d INTEGER DEFAULT 0, UNIQUE(query, channel))`,
  `CREATE TABLE IF NOT EXISTS bid_notices (id INTEGER PRIMARY KEY, source_id INTEGER REFERENCES bid_sources(id), origin TEXT DEFAULT 'crawl' CHECK(origin IN ('api','crawl','chrome','discovery')), org TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, url_hash TEXT UNIQUE, kind TEXT CHECK(kind IN ('vendor_reg','interior_bid','maintenance_rate','other')), posted_at TEXT, deadline TEXT, budget_krw INTEGER, region TEXT, requirements_json TEXT, fit_score INTEGER, fit_verdict TEXT CHECK(fit_verdict IN ('충족','부분','미달','판정불가')), fit_reason TEXT, summary_ko TEXT, body_text TEXT, status TEXT DEFAULT '검토' CHECK(status IN ('검토','참여','불참','제출','결과')), pipeline_id TEXT, memo TEXT, notified_at TEXT, created_at TEXT DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_bids_deadline ON bid_notices(deadline)`,
  `CREATE INDEX IF NOT EXISTS idx_bids_created ON bid_notices(created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS company_profile (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS radar_logs (id INTEGER PRIMARY KEY, job TEXT NOT NULL, detail TEXT, created_at TEXT DEFAULT (datetime('now')))`,
]

// A-3 소스 시드. 첫 검증(verify-all)에서 실패하면 enabled=0 + last_error.
// [name, type, topic_hint, url, enabled]
const NEWS_SEED: [string, string, string, string, number][] = [
  ['ArchDaily', 'rss', 'arch_ai', 'https://www.archdaily.com/feed', 1],
  ['Dezeen', 'rss', 'arch_ai', 'https://www.dezeen.com/feed/', 1],
  ['designboom', 'rss', 'arch_ai', 'https://www.designboom.com/feed/', 1],
  ['Archinect', 'rss', 'arch_ai', 'https://archinect.com/news.xml', 1],
  ['Parametric Architecture', 'rss', 'arch_ai', 'https://parametric-architecture.com/feed/', 1],
  ['월간 SPACE', 'rss', 'arch_ai', 'https://vmspace.com/rss/rss.xml', 1],
  ['r/architecture', 'reddit', 'arch_ai', 'https://www.reddit.com/r/architecture/.rss', 1],
  ['r/InteriorDesign', 'reddit', 'arch_ai', 'https://www.reddit.com/r/InteriorDesign/.rss', 1],
  ['r/archviz', 'reddit', 'arch_ai', 'https://www.reddit.com/r/archviz/.rss', 1],
  ['TechCrunch AI', 'rss', 'ai_news', 'https://techcrunch.com/category/artificial-intelligence/feed/', 1],
  ['The Verge AI', 'rss', 'ai_news', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', 1],
  ['MIT Technology Review', 'rss', 'ai_news', 'https://www.technologyreview.com/feed/', 1],
  ['OpenAI News', 'rss', 'ai_news', 'https://openai.com/news/rss.xml', 1],
  ['Google DeepMind Blog', 'rss', 'ai_news', 'https://deepmind.google/blog/rss.xml', 1],
  ['AI타임스', 'rss', 'ai_news', 'https://www.aitimes.com/rss/allArticle.xml', 1],
  ['HN AI (50+ points)', 'hn', 'ai_news', 'https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&numericFilters=points>50', 1],
  ['Product Hunt', 'rss', 'ai_apps', 'https://www.producthunt.com/feed', 1],
  ['Hugging Face Blog', 'rss', 'ai_apps', 'https://huggingface.co/blog/feed.xml', 1],
  ['r/ClaudeAI', 'reddit', 'ai_apps', 'https://www.reddit.com/r/ClaudeAI/.rss', 1],
  ['r/artificial', 'reddit', 'ai_apps', 'https://www.reddit.com/r/artificial/.rss', 1],
  ['MCP spec releases', 'github_atom', 'mcp', 'https://github.com/modelcontextprotocol/modelcontextprotocol/releases.atom', 1],
  ['MCP servers commits', 'github_atom', 'mcp', 'https://github.com/modelcontextprotocol/servers/commits/main.atom', 1],
  ['r/mcp', 'reddit', 'mcp', 'https://www.reddit.com/r/mcp/.rss', 1],
  ['HN MCP (7일)', 'hn', 'mcp', 'https://hn.algolia.com/api/v1/search_by_date?query=MCP&tags=story&numericFilters=created_at_i>{ts7}', 1],
  ['Claude 릴리스 노트', 'page_diff', 'api', 'https://docs.claude.com/en/release-notes/overview', 1],
  ['OpenAI changelog', 'page_diff', 'api', 'https://platform.openai.com/docs/changelog', 1],
  ['Anthropic SDK Python', 'github_atom', 'api', 'https://github.com/anthropics/anthropic-sdk-python/releases.atom', 1],
  ['Anthropic SDK TypeScript', 'github_atom', 'api', 'https://github.com/anthropics/anthropic-sdk-typescript/releases.atom', 1],
  ['OpenAI SDK Python', 'github_atom', 'api', 'https://github.com/openai/openai-python/releases.atom', 1],
  ['OpenAI SDK Node', 'github_atom', 'api', 'https://github.com/openai/openai-node/releases.atom', 1],
  ['GitHub: MCP 신규 저장소(7일)', 'github_search', 'github', 'https://api.github.com/search/repositories?q=mcp+created:>{d7}&sort=stars&order=desc&per_page=15', 1],
  ['GitHub: interior design ai(30일)', 'github_search', 'github', 'https://api.github.com/search/repositories?q=interior+design+ai+created:>{d30}&sort=stars&order=desc&per_page=10', 1],
  ['GitHub: architecture ai(30일)', 'github_search', 'github', 'https://api.github.com/search/repositories?q=architecture+ai+created:>{d30}&sort=stars&order=desc&per_page=10', 1],
  // 1단계 미지원(수집기 없음) — 목록에만 두고 꺼 둔다
  ['Gmail 라벨: 뉴스레터', 'email', 'ai_apps', 'gmail:label/뉴스레터', 0],
]

// B-3b 발견 엔진 검색어 시드
const QUERY_SEED = [
  '"사무실 인테리어" 입찰공고', '"사무환경 개선" 공사 입찰', '"인테리어 공사" 업체 선정 공고', '"실내건축" 입찰 제안요청서',
  '"지점 인테리어" 입찰', '"협력업체 모집" 인테리어', '"협력업체 등록" 실내건축', '리모델링 공사 입찰 공고 -채용 -구인',
]

const PROFILE_SEED: [string, string][] = [
  ['license', '실내건축공사업'],     // [확인 필요] 보유 면허를 쉼표로
  ['sales_3y', ''],                 // 최근 3년 합산 매출(원)
  ['max_single_perf', ''],          // 최대 단일 공사 실적(원)
  ['credit_grade', ''],             // 기업신용등급 (예: BB+)
  ['years', ''],                    // 업력(년)
  ['certs', ''],                    // 인증(쉼표)
  ['region', '서울,경기,인천'],
]

let _radarReady = false
export async function ensureRadarTables(db: D1Database) {
  if (_radarReady) return
  for (const sql of RADAR_DDL) { try { await db.prepare(sql).run() } catch (_) { /* exists */ } }
  const seeded = await db.prepare(`SELECT COUNT(*) AS n FROM news_sources`).first<any>().catch(() => null)
  if (!seeded || seeded.n === 0) {
    await db.batch(NEWS_SEED.map(([name, type, topic, url, enabled]) =>
      db.prepare(`INSERT OR IGNORE INTO news_sources (name, type, topic_hint, url, enabled) VALUES (?,?,?,?,?)`).bind(name, type, topic, url, enabled)))
    const qs: D1PreparedStatement[] = []
    for (const q of QUERY_SEED) for (const ch of ['naver', 'google_cse'])
      qs.push(db.prepare(`INSERT OR IGNORE INTO search_queries (query, channel) VALUES (?,?)`).bind(q, ch))
    qs.push(...PROFILE_SEED.map(([k, v]) => db.prepare(`INSERT OR IGNORE INTO company_profile (key, value) VALUES (?,?)`).bind(k, v)))
    qs.push(db.prepare(`INSERT OR IGNORE INTO bid_sources (org, tier, group_name, url, method, interval_hours) VALUES ('나라장터(조달청)', 'T1', '공공', 'g2b:api/getBidPblancListInfoCnstwk', 'api', 12)`))
    await db.batch(qs)
  }
  _radarReady = true
}

// ===================================================================
// 공통 유틸
// ===================================================================
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim())
    u.hash = ''
    u.hostname = u.hostname.toLowerCase()
    for (const k of [...u.searchParams.keys()]) if (/^utm_|^fbclid$|^gclid$|^ref$/i.test(k)) u.searchParams.delete(k)
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '')
    const s = u.toString()
    return u.pathname === '/' && !u.search ? s.replace(/\/$/, '') : s
  } catch { return raw.trim() }
}
export async function sha1(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}
export const urlHash = (u: string) => sha1(normalizeUrl(u))

function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp|#39);/gi, (m, e) => {
    const k = e.toLowerCase()
    if (k === 'amp') return '&'; if (k === 'lt') return '<'; if (k === 'gt') return '>'
    if (k === 'quot') return '"'; if (k === 'apos' || k === '#39') return "'"; if (k === 'nbsp') return ' '
    if (k.startsWith('#x')) return String.fromCodePoint(parseInt(k.slice(2), 16))
    if (k.startsWith('#')) return String.fromCodePoint(parseInt(k.slice(1), 10))
    return m
  })
}
export function stripHtml(s: string): string {
  const strip = (x: string) => x
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
  // RSS description은 HTML이 엔티티로 한 번 더 감싸져 오는 경우가 많아 decode 후 한 번 더 제거
  return strip(decodeEntities(strip(String(s || '')))).replace(/\s+/g, ' ').trim()
}
const nowIso = () => new Date().toISOString()
export function kstDate(offsetDays = 0): string {
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10)
}
function hostOf(u: string): string { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' } }
async function log(db: D1Database, job: string, detail: any) {
  try { await db.prepare(`INSERT INTO radar_logs (job, detail) VALUES (?, ?)`).bind(job, JSON.stringify(detail).slice(0, 4000)).run() } catch (_) {}
}

async function fetchText(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<{ text: string; status: number; contentType: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8', ...(init.headers || {}) } })
    const contentType = res.headers.get('content-type') || ''
    const buf = await res.arrayBuffer()
    let charset = (contentType.match(/charset=([\w-]+)/i) || [])[1] || ''
    let text = new TextDecoder('utf-8').decode(buf)
    if (!charset) charset = (text.slice(0, 2048).match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || 'utf-8'
    if (!/utf-?8/i.test(charset)) { try { text = new TextDecoder(charset.toLowerCase()).decode(buf) } catch (_) { /* 미지원 인코딩 → utf-8 유지 */ } }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return { text, status: res.status, contentType }
  } finally { clearTimeout(t) }
}

// ===================================================================
// 피드 파서 (RSS 2.0 · Atom · RDF) — Workers에는 DOMParser가 없어 정규식 기반
// ===================================================================
export type FeedItem = { title: string; url: string; author?: string; published_at?: string; excerpt?: string }
function tag(block: string, name: string): string {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'))
  return m ? m[1] : ''
}
function toIso(d: string): string | undefined {
  if (!d) return undefined
  const t = Date.parse(d.trim())
  return isNaN(t) ? undefined : new Date(t).toISOString()
}
export function parseFeed(xml: string): FeedItem[] {
  const out: FeedItem[] = []
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []
  for (const b of blocks) {
    const title = stripHtml(tag(b, 'title'))
    let url = ''
    const alt = b.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || b.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)
    const plain = stripHtml(tag(b, 'link'))
    url = plain && /^https?:/.test(plain) ? plain : (alt ? decodeEntities(alt[1]) : '')
    if (!url) { const g = stripHtml(tag(b, 'guid')); if (/^https?:/.test(g)) url = g }
    if (!title || !url) continue
    const author = stripHtml(tag(b, 'dc:creator') || tag(tag(b, 'author'), 'name') || tag(b, 'author'))
    const published_at = toIso(stripHtml(tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')))
    const excerpt = stripHtml(tag(b, 'content:encoded') || tag(b, 'description') || tag(b, 'summary') || tag(b, 'content') || tag(b, 'media:description')).slice(0, 1500)
    out.push({ title: title.slice(0, 300), url, author: author.slice(0, 120) || undefined, published_at, excerpt })
  }
  return out
}

// ===================================================================
// Claude 호출 (재시도·JSON 검증)
// ===================================================================
async function callClaude(env: Env, system: string, user: string, opts: { maxTokens?: number; tools?: any[]; model?: string } = {}): Promise<string> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 미설정')
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: opts.model || HAIKU, max_tokens: opts.maxTokens || 4096, system, messages: [{ role: 'user', content: user }], ...(opts.tools ? { tools: opts.tools } : {}) }),
  })
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data: any = await res.json()
  return (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
}
function extractJsonArray(text: string): any[] {
  const s = text.indexOf('['), e = text.lastIndexOf(']')
  if (s < 0 || e <= s) throw new Error('JSON 배열 없음')
  const arr = JSON.parse(text.slice(s, e + 1))
  if (!Array.isArray(arr)) throw new Error('배열 아님')
  return arr
}
// 배치 호출 → 실패 시 개별 1회 재시도 → 그래도 실패하면 해당 항목은 결과에서 빠진다(폐기)
async function classifyBatch<T extends { id: number }>(env: Env, system: string, items: T[], toInput: (x: T) => any, batchSize = 10): Promise<Map<number, any>> {
  const out = new Map<number, any>()
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize)
    try {
      const arr = extractJsonArray(await callClaude(env, system, JSON.stringify(chunk.map(toInput))))
      for (const r of arr) if (r && typeof r.id === 'number') out.set(r.id, r)
    } catch (_) {
      for (const it of chunk) {
        try {
          const arr = extractJsonArray(await callClaude(env, system, JSON.stringify([toInput(it)])))
          if (arr[0]) out.set(it.id, { ...arr[0], id: it.id })
        } catch (_) { /* 폐기 */ }
      }
    }
  }
  return out
}

// ===================================================================
// PART A. 인사이트 수집
// ===================================================================
const NEWS_SYSTEM = `너는 프레임플러스(사무공간 인테리어 설계·시공, 10인 미만, 자체 ERP·AI 도구 개발) 대표의 리서치 비서다.
입력: 뉴스 항목 배열 [{id, title, url, excerpt, source_hint}].
출력: JSON 배열만. 각 항목 {id, topic, summary_ko(3줄, 각 40자 이내, 줄바꿈 \\n 구분), why_relevant(1줄, 회사에 왜 중요한지), score(0~100), tags(3개 이하 문자열 배열)}.
topic은 arch_ai|ai_news|ai_apps|mcp|api|github 중 하나.
score 기준: 사무공간 인테리어·시공 실무에 바로 쓸 수 있음 90+, 자체 ERP/AI 도구 개발에 유용 75+, 일반 교양 50, 무관 20.
설명·서문 금지, JSON 외 출력 금지.`

function fillTemplate(url: string): string {
  const d = (n: number) => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10)
  return url.replace('{d7}', d(7)).replace('{d30}', d(30)).replace('{ts7}', String(Math.floor(Date.now() / 1000) - 7 * 86400))
}

export async function fetchNewsSource(env: Env, src: any): Promise<{ items: FeedItem[]; newHash?: string }> {
  const url = fillTemplate(src.url)
  switch (src.type) {
    case 'rss': case 'reddit': case 'github_atom': case 'youtube': {
      const { text } = await fetchText(url, { headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*' } })
      const items = parseFeed(text)
      if (!items.length) throw new Error('피드 항목 0건(파싱 실패 또는 빈 피드)')
      return { items }
    }
    case 'hn': {
      const { text } = await fetchText(url)
      const hits = (JSON.parse(text).hits || []) as any[]
      return { items: hits.filter(h => h.title).map(h => ({ title: h.title, url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`, author: h.author, published_at: h.created_at, excerpt: `HN ${h.points || 0} points · ${h.num_comments || 0} comments` })) }
    }
    case 'github_search': {
      const headers: Record<string, string> = { Accept: 'application/vnd.github+json' }
      if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
      const { text } = await fetchText(url, { headers })
      const repos = (JSON.parse(text).items || []) as any[]
      return { items: repos.map(r => ({ title: `${r.full_name} ★${r.stargazers_count}`, url: r.html_url, author: r.owner?.login, published_at: r.created_at, excerpt: `${r.description || ''} · stars ${r.stargazers_count} · ${r.language || ''}`.slice(0, 1500) })) }
    }
    case 'page_diff': {
      const { text } = await fetchText(url)
      const body = stripHtml(text)
      const h = await sha1(body)
      if (src.last_hash && src.last_hash === h) return { items: [], newHash: h }
      if (!src.last_hash) return { items: [], newHash: h } // 최초 1회는 기준점만 저장
      const stamp = new Date().toISOString().slice(0, 16)
      return { items: [{ title: `${src.name} 변경 감지 (${stamp.slice(0, 10)})`, url: `${url}#fp-diff-${stamp}`, published_at: nowIso(), excerpt: body.slice(0, 1500) }], newHash: h }
    }
    default:
      throw new Error(`수집기 미지원 유형: ${src.type} (2단계)`)
  }
}

async function recordSourceResult(db: D1Database, src: any, err: string | null, newHash?: string) {
  if (err) {
    const fails = (src.fail_count || 0) + 1
    await db.prepare(`UPDATE news_sources SET last_fetch_at=?, last_error=?, fail_count=?, enabled=CASE WHEN ?>=5 THEN 0 ELSE enabled END WHERE id=?`)
      .bind(nowIso(), err.slice(0, 500), fails, fails, src.id).run()
  } else {
    await db.prepare(`UPDATE news_sources SET last_fetch_at=?, last_error=NULL, fail_count=0, last_hash=COALESCE(?, last_hash) WHERE id=?`)
      .bind(nowIso(), newHash ?? null, src.id).run()
  }
}

async function filterNew<T extends { url: string }>(db: D1Database, table: 'news_items' | 'bid_notices', items: T[]): Promise<(T & { hash: string })[]> {
  const withHash = await Promise.all(items.map(async it => ({ ...it, hash: await urlHash(it.url) })))
  const seen = new Set<string>()
  const uniq = withHash.filter(x => !seen.has(x.hash) && !!seen.add(x.hash)) // 같은 URL은 첫 항목 유지
  if (!uniq.length) return []
  const existing = new Set<string>()
  for (let i = 0; i < uniq.length; i += 50) {
    const part = uniq.slice(i, i + 50)
    const { results } = await db.prepare(`SELECT url_hash FROM ${table} WHERE url_hash IN (${part.map(() => '?').join(',')})`).bind(...part.map(x => x.hash)).all<any>()
    for (const r of results || []) existing.add(r.url_hash)
  }
  return uniq.filter(x => !existing.has(x.hash))
}

export async function insertNewsItems(env: Env, sourceId: number | null, topicHint: string, items: FeedItem[]): Promise<{ fresh: number; kept: number }> {
  const db = env.DB
  const fresh = (await filterNew(db, 'news_items', items.slice(0, NEWS_ITEMS_PER_SOURCE))).map((x, i) => ({ ...x, id: i }))
  if (!fresh.length) return { fresh: 0, kept: 0 }
  const res = await classifyBatch(env, NEWS_SYSTEM, fresh, x => ({ id: x.id, title: x.title, url: x.url, excerpt: (x.excerpt || '').slice(0, 1500), source_hint: topicHint }))
  const stmts: D1PreparedStatement[] = []
  for (const it of fresh) {
    const r = res.get(it.id)
    const score = Number(r?.score)
    if (!r || !isFinite(score) || score < NEWS_MIN_SCORE) continue
    const topic = (TOPICS as readonly string[]).includes(r.topic) ? r.topic : (topicHint || 'ai_news')
    const summary = Array.isArray(r.summary_ko) ? r.summary_ko.join('\n') : String(r.summary_ko || '')
    const tags = Array.isArray(r.tags) ? r.tags.slice(0, 3).join(',') : String(r.tags || '')
    stmts.push(db.prepare(`INSERT OR IGNORE INTO news_items (source_id, topic, title, url, url_hash, author, published_at, raw_excerpt, summary_ko, why_relevant, score, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(sourceId, topic, it.title, it.url, it.hash, it.author || null, it.published_at || nowIso(), (it.excerpt || '').slice(0, 1500), summary.slice(0, 500), String(r.why_relevant || '').slice(0, 300), Math.round(score), tags))
  }
  if (stmts.length) await db.batch(stmts)
  return { fresh: fresh.length, kept: stmts.length }
}

export async function runNewsCron(env: Env, opts: { sourceId?: number; limit?: number } = {}) {
  const db = env.DB
  const q = opts.sourceId
    ? db.prepare(`SELECT * FROM news_sources WHERE id=?`).bind(opts.sourceId)
    : db.prepare(`SELECT * FROM news_sources WHERE enabled=1 AND (last_fetch_at IS NULL OR datetime(last_fetch_at, '+' || COALESCE(interval_min,60) || ' minutes') <= datetime('now', '+5 minutes')) ORDER BY COALESCE(last_fetch_at,'') ASC LIMIT ?`).bind(opts.limit || NEWS_SOURCES_PER_RUN)
  const { results: sources } = await q.all<any>()
  const summary: any[] = []
  for (const src of sources || []) {
    try {
      const { items, newHash } = await fetchNewsSource(env, src)
      let r = { fresh: 0, kept: 0 }
      if (src.topic_hint === 'bid_discovery') r = await discoveryFromItems(env, items.map(i => ({ url: i.url, title: i.title, snippet: i.excerpt || '' })))
      else if (items.length) r = await insertNewsItems(env, src.id, src.topic_hint, items)
      await recordSourceResult(db, src, null, newHash)
      summary.push({ id: src.id, name: src.name, fetched: items.length, ...r })
    } catch (e: any) {
      await recordSourceResult(db, src, e?.message || String(e))
      summary.push({ id: src.id, name: src.name, error: e?.message || String(e) })
    }
  }
  await log(db, 'news', summary)
  return { sources: summary.length, summary }
}

// 시드 검증(완료 기준 A-10-1): 전부 fetch → 성공은 enabled=1, 실패는 enabled=0 + 사유
export async function verifyNewsSources(env: Env) {
  const db = env.DB
  const { results } = await db.prepare(`SELECT * FROM news_sources WHERE type NOT IN ('email','threads')`).all<any>()
  const report: any[] = []
  for (const src of results || []) {
    try {
      const { items } = await fetchNewsSource(env, { ...src, last_hash: null })
      await db.prepare(`UPDATE news_sources SET enabled=1, last_error=NULL, fail_count=0 WHERE id=?`).bind(src.id).run()
      report.push({ id: src.id, name: src.name, type: src.type, url: src.url, ok: true, count: items.length })
    } catch (e: any) {
      await db.prepare(`UPDATE news_sources SET enabled=0, last_error=? WHERE id=?`).bind(String(e?.message || e).slice(0, 500), src.id).run()
      report.push({ id: src.id, name: src.name, type: src.type, url: src.url, ok: false, error: e?.message || String(e) })
    }
  }
  await log(db, 'verify-news', report)
  return { ok: report.filter(r => r.ok).length, failed: report.filter(r => !r.ok).length, report }
}

// 일요일 07:00 주간 리서치 (web_search 도구)
export async function runWeeklyResearch(env: Env) {
  const text = await callClaude(env,
    '너는 프레임플러스(사무공간 인테리어 설계·시공) 대표의 리서치 비서다. 한국어로 답한다.',
    '이번 주(최근 7일) 건축·인테리어 분야 AI 동향을 웹 검색으로 조사해 핵심 5가지를 정리하라. 각 항목: 제목 · 2줄 요약 · 출처 URL. 마지막 줄에 "사무공간 인테리어 회사가 지금 할 일" 1줄. 서문 금지.',
    { maxTokens: 2500, tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }] })
  const date = kstDate()
  const url = `https://www.frameplus.kr/insights#weekly-${date}`
  const h = await urlHash(url)
  await env.DB.prepare(`INSERT OR IGNORE INTO news_items (source_id, topic, title, url, url_hash, author, published_at, raw_excerpt, summary_ko, why_relevant, score, tags) VALUES (NULL,'arch_ai',?,?,?,'weekly_research',?,?,?,?,85,'weekly_research')`)
    .bind(`[주간 리서치] 건축·인테리어 AI 동향 ${date}`, url, h, nowIso(), text.slice(0, 6000), text.split('\n').filter(Boolean).slice(0, 3).join('\n').slice(0, 500), '이번 주 업계 AI 동향 요약 — 콘텐츠 소재')
    .run()
  return { ok: true, date }
}

// ===================================================================
// PART B. 공고 레이더
// ===================================================================
export function bidKeywordPass(title: string): boolean {
  const t = title || ''
  if (BID_EXCLUDE.some(k => t.includes(k))) return false
  return BID_INCLUDE.some(k => t.includes(k))
}

const BID_SYSTEM = `너는 프레임플러스(사무공간 인테리어 설계·시공, 실내건축공사업) 영업 비서다.
입력: 공고 배열 [{id, org, title, url, body}].
출력: JSON 배열만. 각 항목 {id, kind, deadline, budget_krw, region, requirements, summary_ko}.
- kind: vendor_reg(협력업체·협력사 등록/모집) | interior_bid(인테리어·실내건축·리모델링 공사 입찰) | maintenance_rate(단가계약·유지보수) | other
- deadline: 마감일 YYYY-MM-DD, 없으면 null. budget_krw: 추정가격·예산(원, 정수) 없으면 null. region: 시/도 또는 null.
- requirements: {license:[면허명], sales_3y_min:원|null, single_perf_min:원|null, credit_grade:문자열|null, certs:[]} — 본문에 없으면 null/빈 배열.
- summary_ko: 2줄 이내 요약.
JSON 외 출력 금지.`

const GRADE_ORDER = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D']
const gradeRank = (g: string) => { const i = GRADE_ORDER.indexOf(String(g || '').toUpperCase().replace(/\s/g, '')); return i < 0 ? null : i }

// B-6 판정 — 배지용. 어떤 결과도 목록·알림에서 공고를 제외하지 않는다.
export function judgeFit(req: any, profile: Record<string, string>): { verdict: '충족' | '부분' | '미달' | '판정불가'; score: number; reason: string; checks: any[] } {
  const checks: { item: string; required: any; company: any; ok: boolean | null }[] = []
  const r = req || {}
  const has = (v: any) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)
  if (!has(r.license) && !has(r.sales_3y_min) && !has(r.single_perf_min) && !has(r.credit_grade) && !has(r.certs))
    return { verdict: '부분', score: 60, reason: '요구사항 미기재 — 현장설명회·공고문 확인 후 판정', checks }
  const myLic = (profile.license || '').split(',').map(s => s.trim()).filter(Boolean)
  const num = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.]/g, '')); return isFinite(n) && n > 0 ? n : null }
  if (has(r.license)) for (const l of r.license as string[]) {
    const ok = myLic.some(m => l.includes(m) || m.includes(l))
    checks.push({ item: '면허', required: l, company: myLic.join(', ') || '미입력', ok })
  }
  if (has(r.sales_3y_min)) { const mine = num(profile.sales_3y); checks.push({ item: '3년 합산 매출', required: num(r.sales_3y_min), company: mine, ok: mine === null ? null : mine >= num(r.sales_3y_min)! }) }
  if (has(r.single_perf_min)) { const mine = num(profile.max_single_perf); checks.push({ item: '단일 실적', required: num(r.single_perf_min), company: mine, ok: mine === null ? null : mine >= num(r.single_perf_min)! }) }
  if (has(r.credit_grade)) {
    const need = gradeRank(r.credit_grade), mine = gradeRank(profile.credit_grade)
    checks.push({ item: '신용등급', required: r.credit_grade, company: profile.credit_grade || '미상', ok: mine === null || need === null ? null : mine <= need })
  }
  if (has(r.certs)) {
    const myCerts = (profile.certs || '').split(',').map(s => s.trim()).filter(Boolean)
    for (const c of r.certs as string[]) checks.push({ item: '인증', required: c, company: myCerts.join(', ') || '미입력', ok: myCerts.some(m => c.includes(m) || m.includes(c)) })
  }
  const fails = checks.filter(c => c.ok === false)
  const unknown = checks.filter(c => c.ok === null)
  if (fails.length) return { verdict: '미달', score: 20, reason: fails.map(f => `${f.item} 미달(요구 ${f.required})`).join(' · '), checks }
  if (unknown.length) return { verdict: '판정불가', score: 50, reason: unknown.map(u => `${u.item} 회사값 미상`).join(' · ') + ' — 회사 자격 프로필 입력 필요', checks }
  return { verdict: '충족', score: 90, reason: '요구 조건 전부 충족', checks }
}

export async function getProfile(db: D1Database): Promise<Record<string, string>> {
  const { results } = await db.prepare(`SELECT key, value FROM company_profile`).all<any>()
  return Object.fromEntries((results || []).map((r: any) => [r.key, r.value || '']))
}

type RawBid = { org: string; title: string; url: string; posted_at?: string; deadline?: string; body_text?: string; budget_krw?: number; region?: string }

// 신규 공고 공통 처리: dedupe → Haiku 추출 → 판정(배지) → INSERT → 알림
export async function ingestBids(env: Env, rows: RawBid[], origin: 'api' | 'crawl' | 'chrome' | 'discovery', sourceId: number | null = null, preClassified?: Map<string, any>) {
  const db = env.DB
  const valid = rows.filter(r => r && r.title && r.url && /^https?:/.test(r.url))
  const fresh = (await filterNew(db, 'bid_notices', valid)).map((x, i) => ({ ...x, id: i }))
  if (!fresh.length) return { fresh: 0, inserted: 0 }
  let cls = new Map<number, any>()
  if (env.ANTHROPIC_API_KEY) {
    try { cls = await classifyBatch(env, BID_SYSTEM, fresh, x => ({ id: x.id, org: x.org, title: x.title, url: x.url, body: (x.body_text || '').slice(0, 1500) })) } catch (_) {}
  }
  const profile = await getProfile(db)
  const stmts: D1PreparedStatement[] = []
  const notifyRows: any[] = []
  for (const it of fresh) {
    const c = cls.get(it.id) || preClassified?.get(it.hash) || {}
    const kind = ['vendor_reg', 'interior_bid', 'maintenance_rate', 'other'].includes(c.kind) ? c.kind : guessKind(it.title)
    const deadline = normDate(c.deadline) || normDate(it.deadline) || null
    const fit = judgeFit(c.requirements, profile)
    const budget = Number(c.budget_krw) > 0 ? Math.round(Number(c.budget_krw)) : (it.budget_krw || null)
    stmts.push(db.prepare(`INSERT OR IGNORE INTO bid_notices (source_id, origin, org, title, url, url_hash, kind, posted_at, deadline, budget_krw, region, requirements_json, fit_score, fit_verdict, fit_reason, summary_ko, body_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(sourceId, origin, (it.org || '미상').slice(0, 120), it.title.slice(0, 300), it.url, it.hash, kind, normDate(it.posted_at) || kstDate(), deadline, budget, c.region || it.region || null,
        JSON.stringify({ ...(c.requirements || {}), _checks: fit.checks }), fit.score, fit.verdict, fit.reason, String(c.summary_ko || '').slice(0, 400), (it.body_text || '').slice(0, 2000)))
    if (kind === 'vendor_reg' || kind === 'interior_bid') notifyRows.push({ ...it, kind, deadline, verdict: fit.verdict })
  }
  if (stmts.length) await db.batch(stmts)
  // 소스별 반복 월 학습(협력업체 등록 공고)
  if (sourceId && notifyRows.some(r => r.kind === 'vendor_reg'))
    await db.prepare(`UPDATE bid_sources SET expected_month=?, last_notice_at=? WHERE id=?`).bind(Number(kstDate().slice(5, 7)), nowIso(), sourceId).run()
  else if (sourceId && stmts.length) await db.prepare(`UPDATE bid_sources SET last_notice_at=? WHERE id=?`).bind(nowIso(), sourceId).run()
  await notifyUrgentBids(db, notifyRows)
  return { fresh: fresh.length, inserted: stmts.length }
}

function guessKind(title: string): string {
  if (/협력(업체|사)|파트너|등록|모집/.test(title)) return 'vendor_reg'
  if (/인테리어|실내건축|리모델링|사무환경|환경개선|수장/.test(title)) return 'interior_bid'
  if (/단가|유지보수/.test(title)) return 'maintenance_rate'
  return 'other'
}
function normDate(v: any): string | null {
  if (!v) return null
  const s = String(v)
  let m = s.match(/(20\d{2})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(20\d{2})(\d{2})(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}
export function dday(deadline: string | null): number | null {
  if (!deadline) return null
  return Math.round((Date.parse(deadline) - Date.parse(kstDate())) / 86400e3)
}
const VERDICT_TXT = (v: string) => v || '판정불가'

// 마감 7일 이내 = 즉시 알림(알림 센터). 그 외는 09:00 묶음(buildRadarDigest)
async function notifyUrgentBids(db: D1Database, rows: any[]) {
  const stmts: D1PreparedStatement[] = []
  for (const r of rows) {
    const d = dday(r.deadline)
    if (d === null || d < 0 || d > 7) continue
    stmts.push(db.prepare(`INSERT INTO notifications (id, type, title, message, related_type, related_id, priority, action_url) VALUES (?, 'bid', ?, ?, 'bid', ?, 'high', '/bids')`)
      .bind(crypto.randomUUID(), `[공고] ${r.org} · 마감 D-${d}`, `[프레임플러스] 공고 · ${r.org} · ${r.title} · 마감 D-${d} · ${VERDICT_TXT(r.verdict)}`, r.hash))
    stmts.push(db.prepare(`UPDATE bid_notices SET notified_at=? WHERE url_hash=?`).bind(nowIso(), r.hash))
  }
  if (stmts.length) try { await db.batch(stmts) } catch (_) {}
}

// ① 나라장터 OpenAPI — 조달청_나라장터 입찰공고정보서비스 · 공사 목록 [확인 필요: 활용신청 후 엔드포인트/필드명]
export async function runG2B(env: Env, days = 2) {
  if (!env.G2B_API_KEY) return { error: 'G2B_API_KEY 미설정' }
  const fmt = (d: Date) => new Date(d.getTime() + 9 * 3600e3).toISOString().replace(/[-:T]/g, '').slice(0, 12)
  const end = new Date(), start = new Date(Date.now() - days * 86400e3)
  const rows: RawBid[] = []
  for (let page = 1; page <= 5; page++) {
    const u = `https://apis.data.go.kr/1230000/ad/BidPublicInfoService/getBidPblancListInfoCnstwk?serviceKey=${encodeURIComponent(env.G2B_API_KEY)}&pageNo=${page}&numOfRows=100&inqryDiv=1&inqryBgnDt=${fmt(start)}&inqryEndDt=${fmt(end)}&type=json`
    const { text } = await fetchText(u, {}, 20000)
    const body = JSON.parse(text)?.response?.body
    const items: any[] = Array.isArray(body?.items) ? body.items : (body?.items?.item ? [].concat(body.items.item) : [])
    for (const it of items) {
      const title = it.bidNtceNm || ''
      const industry = `${it.mainCnsttyNm || ''} ${it.cnsttyNm || ''} ${it.indstrytyNm || ''}`
      if (!bidKeywordPass(title) && !/실내건축/.test(industry)) continue
      rows.push({
        org: it.ntceInsttNm || it.dminsttNm || '공공기관', title,
        url: it.bidNtceDtlUrl || it.bidNtceUrl || `https://www.g2b.go.kr/link/PNPE027_01/single/?bidPbancNo=${it.bidNtceNo}&bidPbancOrd=${it.bidNtceOrd || '000'}`,
        posted_at: it.bidNtceDt, deadline: it.bidClseDt,
        budget_krw: Number(it.presmptPrce || it.asignBdgtAmt || 0) || undefined,
        region: (it.cnstrtsiteRgnNm || '').split(' ')[0] || undefined,
        body_text: `${title}\n업종: ${industry}\n수요기관: ${it.dminsttNm || ''}\n추정가격: ${it.presmptPrce || ''}\n입찰마감: ${it.bidClseDt || ''}`,
      })
    }
    if (!body || items.length < 100) break
  }
  const src = await env.DB.prepare(`SELECT id FROM bid_sources WHERE method='api' LIMIT 1`).first<any>()
  const r = await ingestBids(env, rows, 'api', src?.id ?? null)
  if (src) await env.DB.prepare(`UPDATE bid_sources SET last_fetch_at=?, last_error=NULL WHERE id=?`).bind(nowIso(), src.id).run()
  await log(env.DB, 'g2b', { matched: rows.length, ...r })
  return { matched: rows.length, ...r }
}

// ② 민간 공개 게시판 크롤 — selector_json: {"link_pattern":"정규식", "item_pattern":"(선택) 행 블록 정규식", "keyword_filter": true}
export function extractLinks(html: string, baseUrl: string, sel: any = {}): { title: string; url: string; posted_at?: string }[] {
  const out: { title: string; url: string; posted_at?: string }[] = []
  const linkRe = sel.link_pattern ? new RegExp(sel.link_pattern, 'i') : null
  const blocks = sel.item_pattern ? (html.match(new RegExp(sel.item_pattern, 'gi')) || []) : [html]
  for (const block of blocks) {
    const re = /<a\b[^>]*href\s*=\s*["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(block))) {
      const title = stripHtml(m[2])
      if (title.length < 6) continue
      let url: string
      try { url = new URL(decodeEntities(m[1]), baseUrl).toString() } catch { continue }
      if (!/^https?:/.test(url) || (linkRe && !linkRe.test(url))) continue
      const tail = block.slice(m.index + m[0].length, m.index + m[0].length + 400)
      out.push({ title: title.slice(0, 300), url, posted_at: normDate(sel.item_pattern ? stripHtml(block) : stripHtml(tail)) || undefined })
    }
  }
  return out
}

export async function crawlSource(env: Env, src: any, dryRun = false) {
  const sel = (() => { try { return JSON.parse(src.selector_json || '{}') } catch { return {} } })()
  const { text } = await fetchText(src.url)
  let links = extractLinks(text, src.url, sel)
  if (sel.keyword_filter !== false) links = links.filter(l => bidKeywordPass(l.title))
  if (dryRun) return { links: links.slice(0, 10) }
  const r = await ingestBids(env, links.map(l => ({ org: src.group_name && src.branch_level === 'branch' ? `${src.group_name} · ${src.org}` : src.org, title: l.title, url: l.url, posted_at: l.posted_at, body_text: l.title })), 'crawl', src.id)
  return { links: links.length, ...r }
}

export async function runCrawlCron(env: Env, limit = CRAWL_SOURCES_PER_RUN) {
  const db = env.DB
  const { results } = await db.prepare(`SELECT * FROM bid_sources WHERE status='approved' AND enabled=1 AND method='crawl' AND (last_fetch_at IS NULL OR datetime(last_fetch_at, '+' || COALESCE(interval_hours,24) || ' hours') <= datetime('now', '+30 minutes')) ORDER BY COALESCE(last_fetch_at,'') ASC LIMIT ?`).bind(limit).all<any>()
  const summary: any[] = []
  for (const src of results || []) {
    try {
      const r = await crawlSource(env, src)
      await db.prepare(`UPDATE bid_sources SET last_fetch_at=?, last_error=NULL WHERE id=?`).bind(nowIso(), src.id).run()
      summary.push({ id: src.id, org: src.org, ...r })
    } catch (e: any) {
      await db.prepare(`UPDATE bid_sources SET last_fetch_at=?, last_error=? WHERE id=?`).bind(nowIso(), String(e?.message || e).slice(0, 500), src.id).run()
      summary.push({ id: src.id, org: src.org, error: e?.message || String(e) })
    }
    await new Promise(r => setTimeout(r, 3000)) // 사이트 간 3초 간격(크롤 예의)
  }
  await log(db, 'crawl', summary)
  return { sources: summary.length, summary }
}

// ③ 발견 엔진 (B-3b)
const DISCOVERY_SYSTEM = `너는 공고 판별기다. 입력: 웹페이지 배열 [{id, url, title, text}].
출력: JSON 배열만. 각 항목 {id, is_notice, org, kind, deadline, board_url}.
- is_notice: 기관·기업이 낸 인테리어/실내건축/리모델링 공사 입찰 또는 협력업체 등록·모집 공고면 true. 채용·부동산 매물·블로그·뉴스 기사·광고는 false.
- org: 발주 기관명. kind: vendor_reg|interior_bid|maintenance_rate|other. deadline: YYYY-MM-DD|null.
- board_url: 이 공고가 올라온 게시판 목록 페이지 URL 추정(모르면 null).
JSON 외 출력 금지.`

async function searchNaver(env: Env, q: string): Promise<{ url: string; title: string; snippet: string }[]> {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) return []
  const out: any[] = []
  for (const kind of ['webkr', 'news']) {
    const { text } = await fetchText(`https://openapi.naver.com/v1/search/${kind}.json?query=${encodeURIComponent(q)}&display=20&sort=${kind === 'news' ? 'date' : 'sim'}`,
      { headers: { 'X-Naver-Client-Id': env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': env.NAVER_CLIENT_SECRET } })
    for (const it of JSON.parse(text).items || []) out.push({ url: it.originallink || it.link, title: stripHtml(it.title), snippet: stripHtml(it.description) })
  }
  return out
}
async function searchGoogle(env: Env, q: string): Promise<{ url: string; title: string; snippet: string }[]> {
  if (!env.GOOGLE_CSE_KEY || !env.GOOGLE_CSE_CX) return []
  const excl = ' -site:g2b.go.kr -site:saramin.co.kr -site:jobkorea.co.kr'
  const { text } = await fetchText(`https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_CSE_KEY}&cx=${env.GOOGLE_CSE_CX}&dateRestrict=d3&num=10&q=${encodeURIComponent(q + excl)}`)
  return (JSON.parse(text).items || []).map((it: any) => ({ url: it.link, title: it.title, snippet: it.snippet || '' }))
}

async function knownDomains(db: D1Database): Promise<Set<string>> {
  const { results } = await db.prepare(`SELECT url FROM bid_sources`).all<any>()
  return new Set((results || []).map((r: any) => hostOf(r.url)).filter(Boolean))
}
async function tierFor(db: D1Database, org: string, domain: string): Promise<{ tier: string; group_name: string | null }> {
  const r = await db.prepare(`SELECT tier, group_name FROM org_dictionary WHERE name=? OR (domain != '' AND domain=?) LIMIT 1`).bind(org, domain).first<any>()
  return r ? { tier: r.tier || 'T7', group_name: r.group_name || null } : { tier: 'T7', group_name: null }
}

export async function discoveryFromItems(env: Env, results: { url: string; title: string; snippet: string }[]) {
  const db = env.DB
  const known = await knownDomains(db)
  const cand = results.filter(r => {
    const h = hostOf(r.url)
    return h && !known.has(h) && !DISCOVERY_SKIP_DOMAINS.some(d => h.endsWith(d))
  })
  const fresh = (await filterNew(db, 'bid_notices', cand)).slice(0, DISCOVERY_PAGES_PER_RUN).map((x, i) => ({ ...x, id: i, text: '' }))
  if (!fresh.length || !env.ANTHROPIC_API_KEY) return { fresh: 0, kept: 0 }
  for (const f of fresh) { try { f.text = stripHtml((await fetchText(f.url, {}, 10000)).text).slice(0, 1500) } catch { f.text = f.snippet } }
  const cls = await classifyBatch(env, DISCOVERY_SYSTEM, fresh, x => ({ id: x.id, url: x.url, title: x.title, text: x.text }))
  const notices: RawBid[] = []
  const pre = new Map<string, any>()
  let candidates = 0
  for (const f of fresh) {
    const c = cls.get(f.id)
    if (!c?.is_notice) continue
    const org = String(c.org || hostOf(f.url)).slice(0, 120)
    notices.push({ org, title: f.title, url: f.url, deadline: c.deadline, body_text: f.text })
    pre.set(f.hash, { kind: c.kind, deadline: c.deadline })
    const domain = hostOf(f.url)
    if (!known.has(domain)) {
      const { tier, group_name } = await tierFor(db, org, domain)
      const board = c.board_url && /^https?:/.test(c.board_url) ? c.board_url : `${new URL(f.url).origin}/`
      const r = await db.prepare(`INSERT OR IGNORE INTO bid_sources (org, tier, group_name, url, method, status, discovered_from) VALUES (?,?,?,?, 'crawl', 'candidate', ?)`).bind(org, tier, group_name, board, f.url).run()
      if (r.meta?.changes) candidates++
      known.add(domain)
    }
  }
  const r = await ingestBids(env, notices, 'discovery', null, pre)
  return { fresh: fresh.length, kept: r.inserted, candidates }
}

export async function runDiscovery(env: Env) {
  const db = env.DB
  const { results: qs } = await db.prepare(`SELECT * FROM search_queries WHERE enabled=1 AND channel IN ('naver','google_cse') ORDER BY COALESCE(last_run_at,'') ASC LIMIT ?`).bind(DISCOVERY_QUERIES_PER_RUN).all<any>()
  const all: { url: string; title: string; snippet: string }[] = []
  const perQuery: any[] = []
  for (const q of qs || []) {
    try {
      const rs = q.channel === 'naver' ? await searchNaver(env, q.query) : await searchGoogle(env, q.query)
      all.push(...rs)
      await db.prepare(`UPDATE search_queries SET last_run_at=?, hits_30d=? WHERE id=?`).bind(nowIso(), rs.length, q.id).run()
      perQuery.push({ id: q.id, channel: q.channel, hits: rs.length })
    } catch (e: any) { perQuery.push({ id: q.id, error: e?.message }) }
  }
  const r = await discoveryFromItems(env, all)
  await log(db, 'discovery', { perQuery, ...r })
  return { queries: perQuery.length, results: all.length, ...r }
}

// 매월 1일: "작년 이맘때 협력업체 등록 공고" 사전 알림
export async function runMonthlyReminder(env: Env) {
  const m = Number(kstDate().slice(5, 7))
  const { results } = await env.DB.prepare(`SELECT id, org, url FROM bid_sources WHERE status='approved' AND expected_month=?`).bind(m).all<any>()
  const stmts = (results || []).map((s: any) => env.DB.prepare(`INSERT INTO notifications (id, type, title, message, related_type, related_id, priority, action_url) VALUES (?, 'bid', ?, ?, 'bid_source', ?, 'normal', '/bids')`)
    .bind(crypto.randomUUID(), `[등록 캘린더] ${s.org}`, `작년 이맘때 ${s.org} 협력업체 등록 공고가 있었습니다. 게시판 확인: ${s.url}`, String(s.id)))
  if (stmts.length) await env.DB.batch(stmts)
  return { month: m, reminded: stmts.length }
}

// 09:00 통합 리포트용: 인사이트 상위 3건 + 공고 묶음 + D-3 미결정 재알림
export async function buildRadarDigest(env: Env, markSent = true): Promise<{ html: string; text: string; insights: any[]; bids: any[]; d3: any[] }> {
  const db = env.DB
  let insights: any[] = [], bids: any[] = [], d3: any[] = []
  try {
    insights = (await db.prepare(`SELECT id, topic, title, url, why_relevant, score FROM news_items WHERE created_at >= datetime('now','-1 day') ORDER BY score DESC, created_at DESC LIMIT 3`).all<any>()).results || []
    bids = (await db.prepare(`SELECT id, org, title, url, deadline, fit_verdict, kind FROM bid_notices WHERE notified_at IS NULL AND kind IN ('vendor_reg','interior_bid') ORDER BY COALESCE(deadline,'9999') ASC LIMIT 30`).all<any>()).results || []
    d3 = (await db.prepare(`SELECT id, org, title, url, deadline, fit_verdict FROM bid_notices WHERE status='검토' AND deadline IS NOT NULL AND deadline BETWEEN ? AND ? ORDER BY deadline ASC`).bind(kstDate(), kstDate(3)).all<any>()).results || []
  } catch (_) { /* 테이블 없음 */ }
  if (markSent && bids.length) await db.batch(bids.map(b => db.prepare(`UPDATE bid_notices SET notified_at=? WHERE id=?`).bind(nowIso(), b.id)))
  const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!))
  const dd = (d: string) => { const n = dday(d); return n === null ? '마감 미상' : `D-${n}` }
  const li = (href: string, main: string, sub: string) => `<li style="margin:0 0 8px 0"><a href="${esc(href)}" style="color:#111827;font-weight:600;text-decoration:none">${main}</a><div style="color:#6B7280;font-size:12px">${sub}</div></li>`
  let html = ''
  if (insights.length) html += `<h3 style="margin:24px 0 8px 0;font-size:15px">💡 인사이트 ${insights.length}건</h3><ul style="padding-left:18px;font-size:13px">${insights.map(i => li(i.url, `[${esc(i.topic)}] ${esc(i.title)}`, `${esc(i.why_relevant)} · ${i.score}점`)).join('')}</ul>`
  if (bids.length) html += `<h3 style="margin:24px 0 8px 0;font-size:15px">📢 신규 공고 ${bids.length}건</h3><ul style="padding-left:18px;font-size:13px">${bids.map(b => li(b.url, `${esc(b.org)} · ${esc(b.title)}`, `마감 ${dd(b.deadline)} · ${esc(b.fit_verdict || '판정불가')}`)).join('')}</ul>`
  if (d3.length) html += `<h3 style="margin:24px 0 8px 0;font-size:15px;color:#DC2626">⏰ 마감 임박·미결정 ${d3.length}건</h3><ul style="padding-left:18px;font-size:13px">${d3.map(b => li(b.url, `${esc(b.org)} · ${esc(b.title)}`, `마감 ${dd(b.deadline)} · 상태 검토 · ${esc(b.fit_verdict || '판정불가')}`)).join('')}</ul>`
  const text = [
    insights.length ? `인사이트 ${insights.length}건: ${insights.map(i => i.title).join(' / ').slice(0, 120)}` : '',
    bids.length ? `신규 공고 ${bids.length}건` : '',
    d3.length ? `마감 D-3 미결정 ${d3.length}건` : '',
  ].filter(Boolean).join('\n')
  // 이메일 미설정이어도 09:00 묶음이 알림 센터에 남도록 요약 1건
  if (markSent && bids.length) {
    await db.prepare(`INSERT INTO notifications (id, type, title, message, related_type, priority, action_url) VALUES (?, 'bid', ?, ?, 'bid_digest', 'normal', '/bids')`)
      .bind(crypto.randomUUID(), `[09:00] 신규 공고 ${bids.length}건`, bids.slice(0, 5).map(b => `${b.org} · ${b.title} · 마감 ${dd(b.deadline)} · ${b.fit_verdict || '판정불가'}`).join('\n')).run()
  }
  if (markSent && d3.length) {
    await db.batch(d3.map(b => db.prepare(`INSERT INTO notifications (id, type, title, message, related_type, related_id, priority, action_url) VALUES (?, 'bid', ?, ?, 'bid', ?, 'high', '/bids')`)
      .bind(crypto.randomUUID(), `[공고 마감 ${dd(b.deadline)}] ${b.org}`, `[프레임플러스] 공고 · ${b.org} · ${b.title} · 마감 ${dd(b.deadline)} · ${b.fit_verdict || '판정불가'} — 참여 여부 미결정`, String(b.id))))
  }
  return { html, text, insights, bids, d3 }
}

// ===================================================================
// API 라우터
// ===================================================================
const adminOnly = (c: any) => c.get('role') === 'admin' ? null : c.json({ error: '관리자(대표)만 가능합니다' }, 403)
const intParam = (v: string | undefined, d: number) => { const n = parseInt(v || '', 10); return isFinite(n) ? n : d }

export function newsRouter() {
  const r = new Hono<RadarApp>()
  r.use('*', async (c, next) => { await ensureRadarTables(c.env.DB); await next() })

  // --- 소스 관리 (대표만) — '/:id'보다 먼저 등록 ---
  r.get('/sources', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT * FROM news_sources ORDER BY enabled DESC, topic_hint, name`).all()
    return c.json(results || [])
  })
  r.post('/sources', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>()
    if (!b.name || !b.type || !b.url) return c.json({ error: 'name, type, url 필수' }, 400)
    const res = await c.env.DB.prepare(`INSERT INTO news_sources (name, type, topic_hint, url, interval_min, enabled) VALUES (?,?,?,?,?,?)`)
      .bind(b.name, b.type, b.topic_hint || null, b.url, intParam(b.interval_min, 60), b.enabled === 0 ? 0 : 1).run()
    return c.json({ success: true, id: res.meta?.last_row_id })
  })
  r.patch('/sources/:id', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>()
    const allowed = ['name', 'type', 'topic_hint', 'url', 'interval_min', 'enabled']
    const keys = Object.keys(b).filter(k => allowed.includes(k))
    if (!keys.length) return c.json({ error: '변경 항목 없음' }, 400)
    const extra = b.enabled === 1 ? ', fail_count=0, last_error=NULL' : ''
    await c.env.DB.prepare(`UPDATE news_sources SET ${keys.map(k => `${k}=?`).join(', ')}${extra} WHERE id=?`).bind(...keys.map(k => b[k]), c.req.param('id')).run()
    return c.json({ success: true })
  })
  r.delete('/sources/:id', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    await c.env.DB.prepare(`DELETE FROM news_sources WHERE id=?`).bind(c.req.param('id')).run()
    return c.json({ success: true })
  })
  r.post('/sources/:id/test', async (c) => {
    const src = await c.env.DB.prepare(`SELECT * FROM news_sources WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!src) return c.json({ error: 'Not found' }, 404)
    try {
      const { items } = await fetchNewsSource(c.env, { ...src, last_hash: src.type === 'page_diff' ? null : src.last_hash })
      await c.env.DB.prepare(`UPDATE news_sources SET last_error=NULL WHERE id=?`).bind(src.id).run()
      return c.json({ ok: true, count: items.length, sample: items.slice(0, 3) })
    } catch (e: any) {
      await c.env.DB.prepare(`UPDATE news_sources SET last_error=? WHERE id=?`).bind(String(e?.message || e).slice(0, 500), src.id).run()
      return c.json({ ok: false, error: e?.message || String(e) })
    }
  })
  // 시드 검증(완료 기준 A-10-1): 전부 fetch → 실패는 enabled=0 + 사유
  r.post('/sources/verify-all', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    return c.json(await verifyNewsSources(c.env))
  })
  r.post('/collect', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>().catch(() => ({}))
    return c.json(await runNewsCron(c.env, { sourceId: b.source_id, limit: b.limit }))
  })

  r.get('/digest', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT id, topic, title, url, why_relevant, score, created_at FROM news_items WHERE date(created_at, '+9 hours') >= date(?, '-1 day') AND date(created_at, '+9 hours') <= ? ORDER BY score DESC LIMIT 3`)
      .bind(c.req.query('date') || kstDate(), c.req.query('date') || kstDate()).all()
    return c.json(results || [])
  })

  // --- 목록 ---
  r.get('/', async (c) => {
    const q = c.req.query()
    const where: string[] = ['1=1'], binds: any[] = []
    if (q.topic && q.topic !== 'all') { where.push('topic=?'); binds.push(q.topic) }
    const days = intParam(q.days, 7)
    if (days > 0) { where.push(`created_at >= datetime('now', ?)`); binds.push(`-${days} days`) }
    where.push('COALESCE(score,0) >= ?'); binds.push(intParam(q.min_score, NEWS_MIN_SCORE))
    if (q.bookmarked === '1') where.push('bookmarked=1')
    if (q.q) { where.push('(title LIKE ? OR summary_ko LIKE ? OR tags LIKE ?)'); binds.push(`%${q.q}%`, `%${q.q}%`, `%${q.q}%`) }
    const page = Math.max(1, intParam(q.page, 1)), size = 30
    const w = where.join(' AND ')
    const { results } = await c.env.DB.prepare(`SELECT n.*, s.name AS source_name FROM news_items n LEFT JOIN news_sources s ON s.id=n.source_id WHERE ${w.replace(/\b(topic|created_at|score|bookmarked|title|summary_ko|tags)\b/g, 'n.$1')} ORDER BY n.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`).bind(...binds).all()
    const cnt = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM news_items WHERE ${w}`).bind(...binds).first<any>()
    c.header('X-Total-Count', String(cnt?.n || 0))
    return c.json(results || [])
  })
  r.get('/:id', async (c) => {
    const row = await c.env.DB.prepare(`SELECT n.*, s.name AS source_name FROM news_items n LEFT JOIN news_sources s ON s.id=n.source_id WHERE n.id=?`).bind(c.req.param('id')).first()
    return row ? c.json(row) : c.json({ error: 'Not found' }, 404)
  })
  // 북마크 토글: 1이면 메모장에 링크 메모 생성(현장 연결 없음) → memo_id
  r.post('/:id/bookmark', async (c) => {
    const db = c.env.DB
    const it = await db.prepare(`SELECT * FROM news_items WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!it) return c.json({ error: 'Not found' }, 404)
    if (it.bookmarked) {
      await db.prepare(`UPDATE news_items SET bookmarked=0 WHERE id=?`).bind(it.id).run()
      return c.json({ bookmarked: 0, memo_id: it.memo_id })
    }
    let memoId = it.memo_id
    if (!memoId) {
      const res = await db.prepare(`INSERT INTO memos (title, url, body, source, pid, created_by) VALUES (?,?,?,'insight','',?)`)
        .bind(it.title, it.url, [it.summary_ko, it.why_relevant ? `→ ${it.why_relevant}` : ''].filter(Boolean).join('\n'), c.get('userId') || '').run()
      memoId = res.meta?.last_row_id
    }
    await db.prepare(`UPDATE news_items SET bookmarked=1, memo_id=? WHERE id=?`).bind(memoId, it.id).run()
    return c.json({ bookmarked: 1, memo_id: memoId })
  })
  r.post('/:id/read', async (c) => {
    await c.env.DB.prepare(`UPDATE news_items SET read_at=COALESCE(read_at, ?) WHERE id=?`).bind(nowIso(), c.req.param('id')).run()
    return c.json({ success: true })
  })
  return r
}

export function memosRouter() {
  const r = new Hono<RadarApp>()
  r.use('*', async (c, next) => { await ensureRadarTables(c.env.DB); await next() })
  r.get('/', async (c) => {
    const src = c.req.query('source')
    const { results } = src
      ? await c.env.DB.prepare(`SELECT * FROM memos WHERE source=? ORDER BY created_at DESC LIMIT 200`).bind(src).all()
      : await c.env.DB.prepare(`SELECT * FROM memos ORDER BY created_at DESC LIMIT 200`).all()
    return c.json(results || [])
  })
  r.post('/', async (c) => {
    const b = await c.req.json<any>()
    if (!b.title) return c.json({ error: 'title 필수' }, 400)
    const res = await c.env.DB.prepare(`INSERT INTO memos (title, url, body, source, pid, created_by) VALUES (?,?,?,?,?,?)`).bind(b.title, b.url || null, b.body || '', b.source || 'manual', b.pid || '', c.get('userId') || '').run()
    return c.json({ success: true, id: res.meta?.last_row_id })
  })
  r.delete('/:id', async (c) => {
    await c.env.DB.prepare(`DELETE FROM memos WHERE id=?`).bind(c.req.param('id')).run()
    await c.env.DB.prepare(`UPDATE news_items SET memo_id=NULL WHERE memo_id=?`).bind(c.req.param('id')).run()
    return c.json({ success: true })
  })
  return r
}

export function bidsRouter() {
  const r = new Hono<RadarApp>()
  r.use('*', async (c, next) => { await ensureRadarTables(c.env.DB); await next() })

  // --- 소스 관리 ---
  r.get('/sources', async (c) => {
    const q = c.req.query()
    const where: string[] = ['1=1'], binds: any[] = []
    if (q.tier) { where.push('tier=?'); binds.push(q.tier) }
    if (q.status) { where.push('status=?'); binds.push(q.status) }
    const { results } = await c.env.DB.prepare(`SELECT * FROM bid_sources WHERE ${where.join(' AND ')} ORDER BY status='candidate' DESC, tier, group_name, org`).bind(...binds).all()
    return c.json(results || [])
  })
  r.post('/sources', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>()
    if (!b.org || !b.url) return c.json({ error: 'org, url 필수' }, 400)
    const res = await c.env.DB.prepare(`INSERT INTO bid_sources (org, tier, group_name, branch_level, url, method, needs_login, selector_json, interval_hours, status, expected_month) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
      .bind(b.org, b.tier || 'T7', b.group_name || null, b.branch_level === 'branch' ? 'branch' : 'hq', b.url, b.method || 'crawl', b.needs_login ? 1 : 0, b.selector_json || null, intParam(b.interval_hours, 24), b.status || 'approved', b.expected_month || null).run()
    return c.json({ success: true, id: res.meta?.last_row_id })
  })
  // 일괄 등록: [{org, tier, group_name, branch_level, url, method, needs_login}] — 금융 2단(본점+지점) 묶음 등록용
  r.post('/sources/bulk', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const rows = await c.req.json<any[]>()
    if (!Array.isArray(rows)) return c.json({ error: '배열 필요' }, 400)
    const db = c.env.DB
    const stmts = rows.filter(b => b?.org && b?.url).map(b => db.prepare(`INSERT OR IGNORE INTO bid_sources (org, tier, group_name, branch_level, url, method, needs_login, selector_json, interval_hours, status) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .bind(b.org, b.tier || 'T7', b.group_name || null, b.branch_level === 'branch' ? 'branch' : 'hq', b.url, b.method || 'crawl', b.needs_login ? 1 : 0, b.selector_json || null, intParam(b.interval_hours, 24), b.status || 'approved'))
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
    return c.json({ success: true, count: stmts.length })
  })
  r.patch('/sources/:id', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>()
    const allowed = ['org', 'tier', 'group_name', 'branch_level', 'url', 'method', 'needs_login', 'selector_json', 'interval_hours', 'status', 'expected_month', 'enabled']
    const keys = Object.keys(b).filter(k => allowed.includes(k))
    if (!keys.length) return c.json({ error: '변경 항목 없음' }, 400)
    await c.env.DB.prepare(`UPDATE bid_sources SET ${keys.map(k => `${k}=?`).join(', ')} WHERE id=?`).bind(...keys.map(k => b[k]), c.req.param('id')).run()
    return c.json({ success: true })
  })
  r.delete('/sources/:id', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    await c.env.DB.prepare(`DELETE FROM bid_sources WHERE id=? AND id NOT IN (SELECT DISTINCT source_id FROM bid_notices WHERE source_id IS NOT NULL)`).bind(c.req.param('id')).run()
    return c.json({ success: true })
  })
  r.post('/sources/:id/test', async (c) => {
    const src = await c.env.DB.prepare(`SELECT * FROM bid_sources WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!src) return c.json({ error: 'Not found' }, 404)
    if (src.method === 'api') return c.json(await runG2B(c.env, 7))
    if (src.method !== 'crawl') return c.json({ ok: false, error: `${src.method} 소스는 즉시 테스트 불가(Chrome 쇼트컷/발견 엔진 경유)` })
    try { return c.json({ ok: true, ...(await crawlSource(c.env, src, true)) }) }
    catch (e: any) { return c.json({ ok: false, error: e?.message || String(e) }) }
  })

  // --- 검색어 ---
  r.get('/queries', async (c) => c.json((await c.env.DB.prepare(`SELECT * FROM search_queries ORDER BY channel, id`).all()).results || []))
  r.post('/queries', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>()
    if (!b.query) return c.json({ error: 'query 필수' }, 400)
    const chs = b.channel ? [b.channel] : ['naver', 'google_cse']
    await c.env.DB.batch(chs.map((ch: string) => c.env.DB.prepare(`INSERT OR IGNORE INTO search_queries (query, channel) VALUES (?,?)`).bind(b.query, ch)))
    return c.json({ success: true })
  })
  r.patch('/queries/:id', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<any>()
    await c.env.DB.prepare(`UPDATE search_queries SET enabled=? WHERE id=?`).bind(b.enabled ? 1 : 0, c.req.param('id')).run()
    return c.json({ success: true })
  })
  r.delete('/queries/:id', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    await c.env.DB.prepare(`DELETE FROM search_queries WHERE id=?`).bind(c.req.param('id')).run()
    return c.json({ success: true })
  })

  // --- 회사 자격 프로필 ---
  r.get('/company-profile', async (c) => c.json(await getProfile(c.env.DB)))
  r.patch('/company-profile', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const b = await c.req.json<Record<string, any>>()
    await c.env.DB.batch(Object.entries(b).map(([k, v]) => c.env.DB.prepare(`INSERT INTO company_profile (key, value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k, String(v ?? ''))))
    return c.json({ success: true })
  })
  // 프로필 변경 후 기존 공고 판정 재계산(배지만 갱신)
  r.post('/rejudge', async (c) => {
    const db = c.env.DB
    const profile = await getProfile(db)
    const { results } = await db.prepare(`SELECT id, requirements_json FROM bid_notices`).all<any>()
    const stmts = (results || []).map((row: any) => {
      let req: any = {}; try { req = JSON.parse(row.requirements_json || '{}') } catch {}
      const { _checks, ...rq } = req
      const fit = judgeFit(Object.keys(rq).length ? rq : null, profile)
      return db.prepare(`UPDATE bid_notices SET fit_score=?, fit_verdict=?, fit_reason=?, requirements_json=? WHERE id=?`).bind(fit.score, fit.verdict, fit.reason, JSON.stringify({ ...rq, _checks: fit.checks }), row.id)
    })
    for (let i = 0; i < stmts.length; i += 50) await db.batch(stmts.slice(i, i + 50))
    return c.json({ success: true, count: stmts.length })
  })

  // --- 기관명 사전 적재: [{name, tier, group_name, domain, source_list}] ---
  r.post('/org-dictionary', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const rows = await c.req.json<any[]>()
    if (!Array.isArray(rows)) return c.json({ error: '배열 필요' }, 400)
    const db = c.env.DB
    const stmts = rows.filter(r => r?.name).map(r => db.prepare(`INSERT OR REPLACE INTO org_dictionary (name, tier, group_name, domain, source_list) VALUES (?,?,?,?,?)`)
      .bind(String(r.name).trim(), r.tier || null, r.group_name || null, (r.domain || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').toLowerCase(), r.source_list || null))
    for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100))
    return c.json({ success: true, count: stmts.length })
  })
  r.get('/org-dictionary/stats', async (c) => c.json((await c.env.DB.prepare(`SELECT source_list, tier, COUNT(*) AS n FROM org_dictionary GROUP BY source_list, tier ORDER BY source_list, tier`).all()).results || []))

  // --- Chrome 쇼트컷 가져오기 [{org,title,url,posted_at,deadline,body_text}] ---
  r.post('/import', async (c) => {
    const body = await c.req.json<any>().catch(() => null)
    const rows = Array.isArray(body) ? body : (Array.isArray(body?.items) ? body.items : null)
    if (!rows) return c.json({ error: 'JSON 배열 필요' }, 400)
    const db = c.env.DB
    // org가 등록된 chrome 소스와 일치하면 source_id 연결
    const { results: srcs } = await db.prepare(`SELECT id, org FROM bid_sources WHERE method='chrome'`).all<any>()
    const byOrg = new Map((srcs || []).map((s: any) => [s.org, s.id]))
    const groups = new Map<number | null, RawBid[]>()
    for (const row of rows) { const sid = byOrg.get(row?.org) ?? null; groups.set(sid, [...(groups.get(sid) || []), row]) }
    let fresh = 0, inserted = 0
    for (const [sid, list] of groups) { const r = await ingestBids(c.env, list, 'chrome', sid); fresh += r.fresh; inserted += r.inserted }
    await log(db, 'import', { received: rows.length, fresh, inserted })
    return c.json({ received: rows.length, fresh, inserted, duplicates: rows.length - fresh })
  })

  // --- 수동 실행(대표) ---
  r.post('/run/:job', async (c) => {
    const deny = adminOnly(c); if (deny) return deny
    const job = c.req.param('job')
    if (job === 'g2b') return c.json(await runG2B(c.env, 7))
    if (job === 'crawl') return c.json(await runCrawlCron(c.env, 5))
    if (job === 'discovery') return c.json(await runDiscovery(c.env))
    return c.json({ error: 'unknown job' }, 400)
  })

  r.get('/calendar', async (c) => {
    const { results } = await c.env.DB.prepare(`SELECT id, org, tier, group_name, expected_month, url FROM bid_sources WHERE expected_month IS NOT NULL AND status='approved' ORDER BY expected_month, org`).all()
    return c.json(results || [])
  })

  // --- 목록 ---
  r.get('/', async (c) => {
    const q = c.req.query()
    const where: string[] = ['1=1'], binds: any[] = []
    if (q.kind) { if (q.kind === 'public') where.push(`b.origin='api'`); else { where.push('b.kind=?'); binds.push(q.kind) } }
    if (q.verdict) { where.push('b.fit_verdict=?'); binds.push(q.verdict) }
    if (q.status) { where.push('b.status=?'); binds.push(q.status) }
    if (q.deadline_within) { where.push('b.deadline BETWEEN ? AND ?'); binds.push(kstDate(), kstDate(intParam(q.deadline_within, 7))) }
    if (q.finance === '1') where.push(`(s.tier='T3' OR b.org LIKE '%은행%' OR b.org LIKE '%금고%' OR b.org LIKE '%신협%' OR b.org LIKE '%농협%' OR b.org LIKE '%수협%' OR b.org LIKE '%보험%' OR b.org LIKE '%증권%' OR b.org LIKE '%캐피탈%' OR b.org LIKE '%카드%')`)
    if (q.active !== '0') { where.push('(b.deadline IS NULL OR b.deadline >= ?)'); binds.push(kstDate(-1)) }
    if (q.q) { where.push('(b.title LIKE ? OR b.org LIKE ?)'); binds.push(`%${q.q}%`, `%${q.q}%`) }
    const { results } = await c.env.DB.prepare(`SELECT b.id, b.source_id, b.origin, b.org, b.title, b.url, b.kind, b.posted_at, b.deadline, b.budget_krw, b.region, b.fit_score, b.fit_verdict, b.fit_reason, b.summary_ko, b.status, b.pipeline_id, b.created_at, s.group_name, s.branch_level, s.tier
      FROM bid_notices b LEFT JOIN bid_sources s ON s.id=b.source_id WHERE ${where.join(' AND ')} ORDER BY CASE WHEN b.deadline IS NULL THEN 1 ELSE 0 END, b.deadline ASC, b.created_at DESC LIMIT 300`).bind(...binds).all()
    return c.json(results || [])
  })
  r.get('/:id', async (c) => {
    const row = await c.env.DB.prepare(`SELECT b.*, s.group_name, s.branch_level, s.tier FROM bid_notices b LEFT JOIN bid_sources s ON s.id=b.source_id WHERE b.id=?`).bind(c.req.param('id')).first<any>()
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json({ ...row, company_profile: await getProfile(c.env.DB) })
  })
  // status 변경. '참여' → 영업 파이프라인(상담 관리) 리드 자동 생성
  r.patch('/:id', async (c) => {
    const db = c.env.DB
    const b = await c.req.json<any>()
    const row = await db.prepare(`SELECT * FROM bid_notices WHERE id=?`).bind(c.req.param('id')).first<any>()
    if (!row) return c.json({ error: 'Not found' }, 404)
    const sets: string[] = [], vals: any[] = []
    if (b.status) { if (!['검토', '참여', '불참', '제출', '결과'].includes(b.status)) return c.json({ error: 'invalid status' }, 400); sets.push('status=?'); vals.push(b.status) }
    if (b.memo !== undefined) { sets.push('memo=?'); vals.push(String(b.memo)) }
    let pipelineId = row.pipeline_id
    if (b.status === '참여' && !pipelineId) {
      pipelineId = `cs_bid_${row.id}_${Date.now().toString(36)}`
      await db.prepare(`INSERT INTO consultations (id, client_name, source, project_type, budget, location, date, status, notes, next_action, next_date, priority, pipeline_stage, expected_amount, expected_close_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .bind(pipelineId, row.org, '공고레이더', row.kind === 'vendor_reg' ? '협력업체 등록' : '입찰', row.budget_krw ? String(row.budget_krw) : '', row.region || '', kstDate(), '신규',
          `${row.title}\n${row.url}\n판정: ${row.fit_verdict || '-'} (${row.fit_reason || ''})\n${row.summary_ko || ''}`, row.kind === 'vendor_reg' ? '협력업체 등록 서류 제출' : '입찰 서류 준비', row.deadline || '', '높음', '제안준비', Number(row.budget_krw) || 0, row.deadline || '').run()
      sets.push('pipeline_id=?'); vals.push(pipelineId)
    }
    if (sets.length) await db.prepare(`UPDATE bid_notices SET ${sets.join(', ')} WHERE id=?`).bind(...vals, row.id).run()
    return c.json({ success: true, pipeline_id: pipelineId })
  })
  return r
}

// 크론 엔드포인트 핸들러 (index.tsx에서 토큰 인증 후 호출)
export async function runRadarJob(env: Env, job: string): Promise<any> {
  await ensureRadarTables(env.DB)
  switch (job) {
    case 'news': return runNewsCron(env)
    case 'weekly': return runWeeklyResearch(env)
    case 'g2b': return runG2B(env)
    case 'crawl': return runCrawlCron(env)
    case 'discovery': return runDiscovery(env)
    case 'monthly': return runMonthlyReminder(env)
    case 'verify': return verifyNewsSources(env)
    default: return { error: `unknown job: ${job}` }
  }
}
