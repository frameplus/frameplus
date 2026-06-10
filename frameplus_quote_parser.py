# -*- coding: utf-8 -*-
"""
프레임플러스 견적서 일괄 파싱 스크립트 v1.0
============================================
사용법:
  1) pip install openpyxl
  2) python frameplus_quote_parser.py "견적서폴더경로"
     예) python frameplus_quote_parser.py "G:/내 드라이브/프로젝트"

동작:
  - 폴더(하위폴더 포함)의 모든 .xlsx 중 파일명에 '견적'이 포함된 파일을 스캔
  - '품명 + 자재비/노무비' 헤더가 있는 내역 시트를 자동 탐지
  - 공종코드(1-0 등), [대괄호] 섹션, 품명/규격/단위/수량/자재·노무·경비·합계 단가를 추출
  - 결과 3종 CSV 출력 (UTF-8 BOM, 엑셀에서 바로 열림):
      1) quote_items_raw.csv      : 품목 전수 데이터 (한 줄 = 견적서 한 품목)
      2) quote_master_candidate.csv: 품목 마스터 후보 (정규화 품명 기준 단가 밴드)
      3) quote_parse_log.csv      : 파일별 처리 결과/오류 로그
"""

import csv
import os
import re
import statistics
import sys
from datetime import datetime

try:
    from openpyxl import load_workbook
except ImportError:
    sys.exit("openpyxl이 필요합니다. 먼저 실행하세요:  pip install openpyxl")

# ---------------------------------------------------------------- 설정
FILE_KEYWORD = "견적"          # 파일명 필터 (모든 xlsx를 보려면 "" 로 변경)
SKIP_NAME_KEYWORDS = ("~$",)   # 엑셀 임시파일 제외
MAX_HEADER_SCAN_ROWS = 40      # 헤더 탐색 범위
PYEONG_TO_M2 = 3.3058

SKIP_ITEM_NAMES = {
    "소계", "합계", "직접공사비-계", "간접공사비-계", "단수정리", "잔액",
}
INDIRECT_NAMES = {"기업이윤", "안전관리비", "식대및운송비등", "식대및운송비"}

UNIT_NORMALIZE = {
    "m2": "M2", "M2": "M2", "㎡": "M2", "m²": "M2",
    "평": "평", "자": "자", "자평": "자평",
    "ea": "EA", "EA": "EA", "Ea": "EA",
    "식": "식", "인": "인", "m": "M", "M": "M",
    "set": "SET", "SET": "SET", "대": "대", "조": "조",
}


def norm(s):
    """셀 텍스트 정규화(비교용): 공백/특수문자 제거"""
    if s is None:
        return ""
    s = str(s)
    return re.sub(r"[\s,，./\\+\-_()\[\]{}*~·'\"`:;|]", "", s)


def cell_str(v):
    if v is None:
        return ""
    return str(v).strip()


def to_num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(",", "").replace(" ", "").replace('"', "")
    if s in ("", "-", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def find_header(ws):
    """
    내역 시트 헤더 탐지.
    반환: dict(콜럼맵) 또는 None
    구조: r행 = NO/품명/규격/단위/수량 + 자재비/노무비/경비/합계(그룹, 병합)
         r+1행 = 단가/금액 (각 그룹 아래)
    """
    for r in range(1, min(MAX_HEADER_SCAN_ROWS, ws.max_row) + 1):
        row_vals = {}
        for c in range(1, min(ws.max_column, 60) + 1):
            n = norm(ws.cell(r, c).value)
            if n:
                row_vals[c] = n
        if "품명" not in row_vals.values():
            continue
        # 기본 컬럼
        cols = {}
        groups = {}
        for c, n in row_vals.items():
            if n == "NO" or n == "no" or n == "번호":
                cols.setdefault("no", c)
            elif n == "품명":
                cols["name"] = c
            elif n == "규격":
                cols["spec"] = c
            elif n == "단위":
                cols["unit"] = c
            elif n == "수량":
                cols["qty"] = c
            elif n == "비고":
                cols["remark"] = c
            elif n == "자재비":
                groups["mat"] = c
            elif n == "노무비":
                groups["lab"] = c
            elif n == "경비":
                groups["exp"] = c
            elif n == "합계":
                groups["tot"] = c
        if "name" not in cols or "mat" not in groups or "lab" not in groups:
            continue
        # 서브헤더 (단가/금액) → 그룹에 귀속
        sub = []  # (col, '단가'|'금액')
        for c in range(1, min(ws.max_column, 60) + 1):
            n = norm(ws.cell(r + 1, c).value)
            if n in ("단가", "금액"):
                sub.append((c, n))
        if not sub:
            continue
        gsorted = sorted(groups.items(), key=lambda kv: kv[1])
        for c, kind in sub:
            owner = None
            for gname, gcol in gsorted:
                if c >= gcol:
                    owner = gname
                else:
                    break
            if owner:
                key = owner + ("_up" if kind == "단가" else "_amt")
                cols.setdefault(key, c)
        cols["header_row"] = r
        cols["groups"] = groups
        return cols
    return None


def get_project_meta(wb):
    """공사명/견적일 추출 (표지 계열 시트에서)"""
    project, date = "", ""
    for ws in wb.worksheets:
        for r in range(1, min(15, ws.max_row) + 1):
            for c in range(1, min(20, ws.max_column) + 1):
                v = cell_str(ws.cell(r, c).value)
                if not v:
                    continue
                if "공사명" in v and not project:
                    for cc in range(c + 1, min(c + 8, ws.max_column) + 1):
                        nv = cell_str(ws.cell(r, cc).value)
                        if nv:
                            project = nv
                            break
                if "DATE" in v.upper() and not date:
                    for cc in range(c + 1, min(c + 6, ws.max_column) + 1):
                        nv = ws.cell(r, cc).value
                        if nv:
                            date = str(nv)[:10]
                            break
            if project and date:
                break
        if project and date:
            break
    return project, date


GONGJONG_CODE_RE = re.compile(r"^\d+\s*-\s*\d+$")
SECTION_RE = re.compile(r"^\[(.+)\]$")


def parse_sheet(ws, cols, file_name, project, qdate):
    items = []
    indirect = []
    cur_code, cur_gongjong, cur_section = "", "", ""
    c_no = cols.get("no")
    c_name = cols["name"]
    start = cols["header_row"] + 2  # 헤더 2행 다음부터

    for r in range(start, ws.max_row + 1):
        no_v = cell_str(ws.cell(r, c_no).value) if c_no else ""
        name_v = cell_str(ws.cell(r, c_name).value)

        # 공종 헤더 행 (예: 1-0 | 기초 공사)
        if GONGJONG_CODE_RE.match(no_v.replace(" ", "")):
            cur_code = no_v.replace(" ", "")
            cur_gongjong = name_v
            cur_section = ""
            continue
        if not name_v:
            continue
        nn = norm(name_v)
        # 섹션 [목공사]
        m = SECTION_RE.match(name_v.strip())
        if m:
            cur_section = m.group(1).strip()
            continue
        # 집계/스킵 행
        if nn in SKIP_ITEM_NAMES or nn.startswith("소계") or nn.startswith("합계"):
            continue
        if nn in INDIRECT_NAMES:
            rate = to_num(ws.cell(r, cols.get("qty", 0)).value) if cols.get("qty") else None
            amt = to_num(ws.cell(r, cols.get("tot_amt", 0)).value) if cols.get("tot_amt") else None
            indirect.append({"파일": file_name, "시트": ws.title, "항목": name_v,
                             "비율%": rate, "금액": amt})
            continue
        # 주석성 행 (예: " - 미장 별도", "* 견적 외 사항")
        if name_v.lstrip().startswith(("-", "*", "·", ".")):
            continue

        spec = cell_str(ws.cell(r, cols["spec"]).value) if cols.get("spec") else ""
        unit_raw = cell_str(ws.cell(r, cols["unit"]).value) if cols.get("unit") else ""
        qty = to_num(ws.cell(r, cols["qty"]).value) if cols.get("qty") else None
        mat_up = to_num(ws.cell(r, cols["mat_up"]).value) if cols.get("mat_up") else None
        lab_up = to_num(ws.cell(r, cols["lab_up"]).value) if cols.get("lab_up") else None
        exp_up = to_num(ws.cell(r, cols["exp_up"]).value) if cols.get("exp_up") else None
        tot_up = to_num(ws.cell(r, cols["tot_up"]).value) if cols.get("tot_up") else None
        tot_amt = to_num(ws.cell(r, cols["tot_amt"]).value) if cols.get("tot_amt") else None

        # 단가도 금액도 없는 행은 메모로 간주
        if all(v is None for v in (mat_up, lab_up, exp_up, tot_up, tot_amt, qty)):
            continue

        unit = UNIT_NORMALIZE.get(unit_raw, UNIT_NORMALIZE.get(unit_raw.lower(), unit_raw))
        if tot_up is None and (mat_up or lab_up or exp_up):
            tot_up = (mat_up or 0) + (lab_up or 0) + (exp_up or 0)

        # 평 → M2 환산 단가 (비교용)
        tot_up_m2 = None
        if tot_up is not None:
            if unit == "M2":
                tot_up_m2 = tot_up
            elif unit == "평":
                tot_up_m2 = round(tot_up / PYEONG_TO_M2)

        items.append({
            "파일": file_name, "프로젝트": project, "견적일": qdate, "시트": ws.title,
            "공종코드": cur_code, "공종명": cur_gongjong, "섹션": cur_section,
            "위치메모": no_v if not GONGJONG_CODE_RE.match(no_v.replace(" ", "")) else "",
            "품명": name_v, "품명_정규화": nn, "규격": spec,
            "단위": unit, "단위_원본": unit_raw, "수량": qty,
            "자재단가": mat_up, "노무단가": lab_up, "경비단가": exp_up,
            "합계단가": tot_up, "합계단가_M2환산": tot_up_m2, "합계금액": tot_amt,
        })
    return items, indirect


def main(root):
    all_items, all_indirect, logs = [], [], []
    targets = []
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if not f.lower().endswith(".xlsx"):
                continue
            if any(k in f for k in SKIP_NAME_KEYWORDS):
                continue
            if FILE_KEYWORD and FILE_KEYWORD not in f:
                continue
            targets.append(os.path.join(dirpath, f))
    print(f"대상 파일: {len(targets)}건")

    for i, path in enumerate(targets, 1):
        fname = os.path.basename(path)
        try:
            wb = load_workbook(path, data_only=True, read_only=True)
        except Exception as e:
            logs.append({"파일": fname, "상태": "열기실패", "내역시트수": 0, "품목수": 0, "비고": str(e)[:120]})
            continue
        try:
            project, qdate = get_project_meta(wb)
            n_sheets, n_items = 0, 0
            for ws in wb.worksheets:
                cols = find_header(ws)
                if not cols:
                    continue
                items, indirect = parse_sheet(ws, cols, fname, project, qdate)
                if items:
                    n_sheets += 1
                    n_items += len(items)
                    all_items.extend(items)
                    all_indirect.extend(indirect)
            logs.append({"파일": fname, "상태": "OK" if n_items else "내역없음",
                         "내역시트수": n_sheets, "품목수": n_items, "비고": project})
        except Exception as e:
            logs.append({"파일": fname, "상태": "파싱오류", "내역시트수": 0, "품목수": 0, "비고": str(e)[:120]})
        finally:
            wb.close()
        if i % 20 == 0:
            print(f"  ...{i}/{len(targets)} 처리")

    # ---------- 마스터 후보 집계 (정규화품명 + 규격 + 단위 기준)
    master = {}
    for it in all_items:
        if it["합계단가"] is None:
            continue
        key = (it["품명_정규화"], norm(it["규격"]), it["단위"])
        master.setdefault(key, {"표기들": set(), "단가들": [], "자재": [], "노무": []})
        m = master[key]
        m["표기들"].add(it["품명"])
        m["단가들"].append(it["합계단가"])
        if it["자재단가"] is not None:
            m["자재"].append(it["자재단가"])
        if it["노무단가"] is not None:
            m["노무"].append(it["노무단가"])

    master_rows = []
    for (pname, spec, unit), m in sorted(master.items(), key=lambda kv: -len(kv[1]["단가들"])):
        ups = m["단가들"]
        master_rows.append({
            "품명_정규화": pname, "규격_정규화": spec, "단위": unit,
            "출현횟수": len(ups),
            "표기변형수": len(m["표기들"]),
            "표기예시": " | ".join(sorted(m["표기들"])[:3]),
            "합계단가_최저": min(ups), "합계단가_중앙값": round(statistics.median(ups)),
            "합계단가_최고": max(ups),
            "자재단가_중앙값": round(statistics.median(m["자재"])) if m["자재"] else "",
            "노무단가_중앙값": round(statistics.median(m["노무"])) if m["노무"] else "",
        })

    # ---------- CSV 출력
    out_dir = os.getcwd()
    def write_csv(name, rows, field_order=None):
        if not rows:
            print(f"{name}: 데이터 없음")
            return
        path = os.path.join(out_dir, name)
        fields = field_order or list(rows[0].keys())
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=fields)
            w.writeheader()
            w.writerows(rows)
        print(f"저장: {path} ({len(rows)}행)")

    write_csv("quote_items_raw.csv", all_items)
    write_csv("quote_master_candidate.csv", master_rows)
    write_csv("quote_indirect_costs.csv", all_indirect)
    write_csv("quote_parse_log.csv", logs)

    ok = sum(1 for l in logs if l["상태"] == "OK")
    print(f"\n완료: 파일 {len(targets)}건 중 정상 파싱 {ok}건 / 품목 {len(all_items)}행 / 고유품목 {len(master_rows)}개")
    print("→ 생성된 CSV 4개를 Claude 대화에 업로드해 주세요.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit('사용법: python frameplus_quote_parser.py "견적서폴더경로"')
    root = sys.argv[1]
    if not os.path.isdir(root):
        sys.exit(f"폴더를 찾을 수 없습니다: {root}")
    main(root)
