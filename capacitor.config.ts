// JOBS 네이티브 셸 (Capacitor) — 원격 URL 모드: 운영 서버의 /jobs/ 를 그대로 로드한다.
// 사용법: docs/JOBS_CAPACITOR.md. vite 빌드에는 포함되지 않는다(네이티브 빌드 PC에서만 사용).
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'kr.frameplus.jobs',
  appName: 'JOBS',
  webDir: 'public/static/jobs', // 원격 모드에서는 쓰이지 않지만 cap sync 가 디렉터리를 요구한다
  server: {
    // [확인 필요] 운영 도메인 확정 후 교체. 개발 중에는 'http://<PC IP>:3000/jobs/' + cleartext: true
    url: 'https://frameplus-erp.pages.dev/jobs/',
    cleartext: false,
  },
  android: { allowMixedContent: false },
  ios: { contentInset: 'automatic' },
}

export default config
