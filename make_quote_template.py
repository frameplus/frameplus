# -*- coding: utf-8 -*-
"""
프레임플러스 견적서 표준 양식(.xlsx) 생성기
============================================
- frameplus_quote_parser.py 가 그대로 읽을 수 있는 포맷의 빈 견적서 양식을 만듭니다.
- 사용법:  python make_quote_template.py
           → '견적서_양식.xlsx' 생성. 프로젝트마다 복사해서 채워 쓰세요.
"""

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

# ---- 스타일
THIN = Side(style="thin", color="BBBBBB")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
CENTER = Alignment(horizontal="center", vertical="center", wrap_text=True)
RIGHT = Alignment(horizontal="right", vertical="center")
LEFT = Alignment(horizontal="left", vertical="center")
HEAD_FILL = PatternFill("solid", fgColor="2F3A4B")
HEAD_FONT = Font(bold=True, color="FFFFFF", size=10)
SUB_FILL = PatternFill("solid", fgColor="E8ECF1")
CODE_FILL = PatternFill("solid", fgColor="DCE6F1")
SUBTOTAL_FILL = PatternFill("solid", fgColor="F4F6F8")
TITLE_FONT = Font(bold=True, size=20)
WON = '#,##0'

# 공종(섹션) 예시 — 필요한 만큼 추가/삭제하세요
SECTIONS = [
    "철거 공사", "목공·경량 공사", "전기·통신 공사",
    "페인트·벽지 공사", "바닥 공사", "제작가구",
]
ROWS_PER_SECTION = 6   # 공종별 빈 입력 행 수

# 컬럼: A~M
# A NO  B 품명  C 규격  D 단위  E 수량
# F 자재단가 G 자재금액  H 노무단가 I 노무금액  J 경비단가 K 경비금액  L 합계단가 M 합계금액
COL = dict(no=1, nm=2, spec=3, unit=4, qty=5,
           mu=6, ma=7, lu=8, la=9, eu=10, ea=11, tu=12, ta=13)
LAST = 13


def main():
    wb = Workbook()
    ws = wb.active
    ws.title = "견적내역서"

    # 컬럼 너비
    widths = [6, 26, 16, 6, 8, 11, 12, 11, 12, 11, 12, 11, 13]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    r = 1
    # ---- 제목
    ws.merge_cells(start_row=r, start_column=1, end_row=r, end_column=LAST)
    c = ws.cell(r, 1, "공 사 견 적 서")
    c.font = TITLE_FONT
    c.alignment = CENTER
    ws.row_dimensions[r].height = 34
    r += 2

    # ---- 표지 메타 (파서가 공사명/DATE 를 읽음)
    def meta(row, label1, val1, label2, val2):
        ws.cell(row, 1, label1).font = Font(bold=True)
        ws.cell(row, 1).alignment = LEFT
        ws.merge_cells(start_row=row, start_column=2, end_row=row, end_column=5)
        ws.cell(row, 2, val1).alignment = LEFT
        ws.cell(row, 6, label2).font = Font(bold=True)
        ws.merge_cells(start_row=row, start_column=7, end_row=row, end_column=LAST)
        ws.cell(row, 7, val2).alignment = LEFT

    meta(r, "공사명", "", "DATE", "")
    meta(r + 1, "고객사", "", "견적담당", "")
    meta(r + 2, "현장위치", "", "면적(평)", "")
    r += 4

    # ---- 2단 헤더
    hr = r
    headers = ["NO", "품명", "규격", "단위", "수량"]
    for i, h in enumerate(headers, 1):
        ws.merge_cells(start_row=hr, start_column=i, end_row=hr + 1, end_column=i)
        cell = ws.cell(hr, i, h)
        cell.fill = HEAD_FILL; cell.font = HEAD_FONT; cell.alignment = CENTER
        ws.cell(hr + 1, i).fill = HEAD_FILL
    groups = [("자재비", COL["mu"]), ("노무비", COL["lu"]),
              ("경비", COL["eu"]), ("합계", COL["tu"])]
    for name, col in groups:
        ws.merge_cells(start_row=hr, start_column=col, end_row=hr, end_column=col + 1)
        cell = ws.cell(hr, col, name)
        cell.fill = HEAD_FILL; cell.font = HEAD_FONT; cell.alignment = CENTER
        ws.cell(hr, col + 1).fill = HEAD_FILL
        for j, sub in enumerate(("단가", "금액")):
            sc = ws.cell(hr + 1, col + j, sub)
            sc.fill = SUB_FILL; sc.font = Font(bold=True, size=9); sc.alignment = CENTER
    for col in range(1, LAST + 1):
        ws.cell(hr, col).border = BORDER
        ws.cell(hr + 1, col).border = BORDER
    ws.row_dimensions[hr].height = 20
    r = hr + 2

    # ---- 공종별 섹션
    code_idx = 0
    section_subtotal_rows = []
    for sec in SECTIONS:
        code_idx += 1
        # 공종 코드 행 (파서가 NO=숫자-숫자 패턴으로 인식)
        ws.cell(r, COL["no"], f"{code_idx}-0").alignment = CENTER
        ws.cell(r, COL["nm"], sec).font = Font(bold=True)
        for col in range(1, LAST + 1):
            ws.cell(r, col).fill = CODE_FILL
            ws.cell(r, col).border = BORDER
        r += 1
        first = r
        for _ in range(ROWS_PER_SECTION):
            qty = f"{get_column_letter(COL['qty'])}{r}"
            mu = f"{get_column_letter(COL['mu'])}{r}"
            lu = f"{get_column_letter(COL['lu'])}{r}"
            eu = f"{get_column_letter(COL['eu'])}{r}"
            # 금액 = 수량 × 단가, 합계단가 = 단가합, 합계금액 = 수량 × 합계단가
            ws.cell(r, COL["ma"]).value = f"=IF(AND({qty}<>\"\",{mu}<>\"\"),{qty}*{mu},\"\")"
            ws.cell(r, COL["la"]).value = f"=IF(AND({qty}<>\"\",{lu}<>\"\"),{qty}*{lu},\"\")"
            ws.cell(r, COL["ea"]).value = f"=IF(AND({qty}<>\"\",{eu}<>\"\"),{qty}*{eu},\"\")"
            ws.cell(r, COL["tu"]).value = f"=N({mu})+N({lu})+N({eu})"
            ws.cell(r, COL["ta"]).value = f"=IF({qty}<>\"\",{qty}*{get_column_letter(COL['tu'])}{r},\"\")"
            for col in range(1, LAST + 1):
                cell = ws.cell(r, col)
                cell.border = BORDER
                if col in (COL["mu"], COL["ma"], COL["lu"], COL["la"],
                           COL["eu"], COL["ea"], COL["tu"], COL["ta"]):
                    cell.number_format = WON
                    cell.alignment = RIGHT
                elif col == COL["qty"]:
                    cell.alignment = CENTER
                elif col in (COL["unit"],):
                    cell.alignment = CENTER
            r += 1
        last = r - 1
        # 소계
        ws.cell(r, COL["nm"], "소계").font = Font(bold=True)
        for key in ("ma", "la", "ea", "ta"):
            cl = get_column_letter(COL[key])
            ws.cell(r, COL[key]).value = f"=SUM({cl}{first}:{cl}{last})"
            ws.cell(r, COL[key]).number_format = WON
            ws.cell(r, COL[key]).alignment = RIGHT
            ws.cell(r, COL[key]).font = Font(bold=True)
        for col in range(1, LAST + 1):
            ws.cell(r, col).fill = SUBTOTAL_FILL
            ws.cell(r, col).border = BORDER
        section_subtotal_rows.append(r)
        r += 1

    # ---- 직접공사비 계
    ta = get_column_letter(COL["ta"])
    direct_row = r
    ws.cell(r, COL["nm"], "직접공사비 계").font = Font(bold=True)
    sum_expr = "+".join(f"{ta}{sr}" for sr in section_subtotal_rows)
    ws.cell(r, COL["ta"]).value = f"={sum_expr}" if sum_expr else 0
    ws.cell(r, COL["ta"]).number_format = WON
    ws.cell(r, COL["ta"]).alignment = RIGHT
    ws.cell(r, COL["ta"]).font = Font(bold=True)
    for col in range(1, LAST + 1):
        ws.cell(r, col).fill = SUBTOTAL_FILL
        ws.cell(r, col).border = BORDER
    r += 1

    # ---- 간접비 (비율은 수량열, 금액은 합계금액열 → 파서 INDIRECT 인식)
    direct_ref = f"{ta}{direct_row}"
    qty_l = get_column_letter(COL["qty"])
    indirect = [("기업이윤", 10.0), ("안전관리비", 0.7), ("식대및운송비등", 3.0)]
    ind_rows = []
    for name, pct in indirect:
        ws.cell(r, COL["nm"], name)
        ws.cell(r, COL["qty"], pct).alignment = CENTER          # 비율(%)
        ws.cell(r, COL["ta"]).value = f"=ROUND({direct_ref}*{qty_l}{r}/100,0)"
        ws.cell(r, COL["ta"]).number_format = WON
        ws.cell(r, COL["ta"]).alignment = RIGHT
        for col in range(1, LAST + 1):
            ws.cell(r, col).border = BORDER
        ind_rows.append(r)
        r += 1

    # ---- 합계
    ws.cell(r, COL["nm"], "합계").font = Font(bold=True, size=11)
    total_expr = f"{direct_ref}+" + "+".join(f"{ta}{ir}" for ir in ind_rows)
    ws.cell(r, COL["ta"]).value = f"={total_expr}"
    ws.cell(r, COL["ta"]).number_format = WON
    ws.cell(r, COL["ta"]).alignment = RIGHT
    ws.cell(r, COL["ta"]).font = Font(bold=True, size=11)
    fill_total = PatternFill("solid", fgColor="FCEFC7")
    for col in range(1, LAST + 1):
        ws.cell(r, col).fill = fill_total
        ws.cell(r, col).border = BORDER
    r += 2

    # ---- 안내
    ws.cell(r, 1, "※ 회색 음영(단가/수량)만 입력하면 금액·소계·합계가 자동 계산됩니다. "
                  "공종(○-0) 행과 소계 행은 그대로 두고, 행을 복사해 항목을 추가하세요. "
                  "VAT 별도.").font = Font(size=9, color="888888")

    ws.freeze_panes = ws.cell(hr + 2, 1)
    out = "견적서_양식.xlsx"
    wb.save(out)
    print(f"생성 완료: {out}")


if __name__ == "__main__":
    main()
