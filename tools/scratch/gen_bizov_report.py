#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""[scratch · 260813] 사업 개요 전/후 리포트 생성 — 스샷 base64 삽입 + 미입력 현황을 씨앗에서 직접 세서 표로.
   실행: python3 tools/scratch/gen_bizov_report.py"""
import base64
import html
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SHOTS = ROOT / "tools" / "scratch" / "shots"
OUT = ROOT / "docs" / "reports" / "260813_사업개요_표기단위_분야선택_전후.html"

FILL = ["bud", "vou", "fee", "rev", "paid", "inv"]
LAB = {"bud": "예산", "vou": "전표실적", "fee": "판매수수료", "rev": "정산서매출", "paid": "유료인원", "inv": "초대인원"}
AXIS = {"교육": {"inv"}}   # 그 분야 원본에 열 자체가 없음 = 「해당 없음」


def seed_rows():
    src = (ROOT / "data" / "biz_finance.js").read_text(encoding="utf-8")
    years, cur, out = {}, None, []
    for line in src.split("\n"):
        m = re.match(r"\s*(20\d\d):\{", line)
        if m:
            cur = int(m.group(1))
        m2 = re.search(r"\{no:\"([^\"]+)\".*\}", line)
        if m2 and cur:
            row = {"y": cur}
            for k, v in re.findall(r"(\w+):(\"(?:[^\"\\]|\\.)*\"|-?\d+)", m2.group(0)):
                row[k] = v.strip('"') if v.startswith('"') else int(v)
            out.append(row)
    return out


def img(name):
    """스샷은 **base64로 HTML 안에** 박는다 — `.gitignore` 규약(「보고서에 실을 것은 base64로 HTML 안에 박아
       docs/reports/에 남긴다 … 같은 PNG를 레포에도 또 두면 사본이 한 벌 더 쌓인다」). 실측 = `git ls-files docs/reports/*.png` **0건**.
       ⚠ 그래서 크롭을 좁게 찍는다(좌 열 통짜 = 한 장 200KB → 리포트가 MB 단위로 부푼다 · 첫 판이 8MB였다)."""
    p = SHOTS / (name + ".png")
    if not p.exists():
        return '<div class="note">스샷 없음: %s</div>' % html.escape(name)
    return '<img alt="%s" src="data:image/png;base64,%s">' % (
        html.escape(name), base64.b64encode(p.read_bytes()).decode("ascii"))


def ba(title, why, before, after, note=""):
    return ('<h2><span class="no">▸</span>%s</h2><p class="why">%s</p>'
            '<div class="ba"><div class="card"><span class="tag b">전</span>%s</div>'
            '<div class="card"><span class="tag a">후</span>%s</div></div>%s'
            % (title, why, before, after, ('<div class="note">%s</div>' % note) if note else ""))


rows = seed_rows()

# ── 미입력 현황 ─────────────────────────────────────────────────────────────
by_year = {}
for r in rows:
    by_year.setdefault(r["y"], []).append(r)

fill_tbl = []
for y in sorted(by_year, reverse=True):
    for r in sorted(by_year[y], key=lambda x: x["no"]):
        ax = AXIS.get(r["cat"], set())
        blank = [k for k in str(r.get("blank", "")).split("|") if k]
        blank = [k for k in blank if k not in ax and k in FILL]
        zero = [k for k in FILL if k not in ax and k not in blank and not r.get(k)]
        miss = []
        if not r.get("acct"):
            miss.append("회계구분")
        if not r.get("mon"):
            miss.append("진행월")
        if not r.get("cnt"):
            miss.append("횟수")
        if blank or miss:
            fill_tbl.append((y, r["no"], r["cat"], r["name"], blank, zero, miss))

cat_sum = {}
for r in rows:
    ax = AXIS.get(r["cat"], set())
    k = (r["y"], r["cat"])
    c = cat_sum.setdefault(k, {"n": 0, "blank": 0, "acct": 0, "mon": 0})
    c["n"] += 1
    if [x for x in str(r.get("blank", "")).split("|") if x and x not in ax]:
        c["blank"] += 1
    if not r.get("acct"):
        c["acct"] += 1
    if not r.get("mon"):
        c["mon"] += 1

sum_rows = "".join(
    "<tr><td>%d</td><td>%s</td><td class=n>%d</td><td class='n %s'>%d</td><td class='n %s'>%d</td><td class='n %s'>%d</td></tr>"
    % (y, c, v["n"], "bad" if v["blank"] else "", v["blank"], "bad" if v["acct"] else "", v["acct"],
       "bad" if v["mon"] else "", v["mon"])
    for (y, c), v in sorted(cat_sum.items(), key=lambda kv: (-kv[0][0], kv[0][1])))

fill_rows = "".join(
    "<tr><td>%d</td><td class=mono>%s</td><td>%s</td><td>%s</td><td class=bad>%s</td><td>%s</td><td class=dim>%s</td></tr>"
    % (y, html.escape(no), html.escape(cat), html.escape(nm),
       html.escape(" · ".join(LAB[k] for k in bl)) or "—",
       html.escape(" · ".join(LAB[k] for k in z)) or "—",
       html.escape(" · ".join(ms)) or "—")
    for y, no, cat, nm, bl, z, ms in fill_tbl)

CSS = """
:root{--accent:#4A4DE7;--accent-light:#E8E8FD;--peach-text:#D88455;--green:#1A6B3C;--text:#1A1A2E;
 --dim:#888;--muted:#bbb;--neutral-text:#6B6B7B;--border:rgba(0,0,0,.09);--border2:rgba(0,0,0,.12);
 --danger:#E24B4A;--bg:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);--surface:#fff;--radius:16px}
*{box-sizing:border-box}
body{margin:0;padding:34px 22px 70px;background:var(--bg);color:var(--text);
 font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;line-height:1.65}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:23px;margin:0 0 6px;letter-spacing:-.3px}
.lede{color:var(--neutral-text);font-size:13.5px;margin:0 0 26px}
h2{font-size:16px;margin:38px 0 4px;padding-top:16px;border-top:1px solid var(--border2)}
h2 .no{color:var(--accent);font-weight:800;margin-right:7px}
.why{color:var(--neutral-text);font-size:12.5px;margin:0 0 14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);
 padding:14px;box-shadow:0 8px 32px rgba(74,77,231,.07)}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:900px){.ba{grid-template-columns:1fr}}
.tag{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.4px;padding:3px 10px;
 border-radius:999px;margin-bottom:9px}
.tag.b{background:rgba(0,0,0,.06);color:var(--neutral-text)}
.tag.a{background:var(--accent-light);color:var(--accent)}
img{width:100%;display:block;border-radius:10px;border:1px solid var(--border)}
.solo{max-width:760px}
.note{font-size:12px;color:var(--neutral-text);margin-top:10px;padding-left:14px;border-left:2px solid var(--accent-light)}
table{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:10px}
th,td{padding:7px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{color:var(--dim);font-size:11.5px;font-weight:600;position:sticky;top:0;background:var(--surface)}
td.n{text-align:right;font-variant-numeric:tabular-nums}
td.mono{font-variant-numeric:tabular-nums;color:var(--neutral-text);white-space:nowrap}
td.bad,.bad{color:var(--danger);font-weight:700}
td.dim{color:var(--dim)}
.scroll{max-height:520px;overflow:auto;border-radius:12px}
.kv{font-size:12.5px;color:var(--neutral-text);margin:0 0 4px}
.kv b{color:var(--text)}
"""

doc = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>사업 개요 — 표기 단위·분야 선택자 전/후 (260813)</title>
<style>%s</style></head><body><div class="wrap">
<h1>사업 개요 — 표기 단위·분야 선택자 전/후</h1>
<p class="lede">260813 운영자 지시 4건 반영. 실제 앱을 헤드리스로 띄워 찍은 화면이다(모형 아님 · 씨앗 데이터 · 실API 미접촉).
「전」은 같은 코드의 직전 커밋 상태, 「후」는 이 브랜치 상태.</p>

%s

%s

%s

%s

<h2><span class="no">▸</span>아직 안 채워진 칸 — 「무엇을 적어야 하나」</h2>
<p class="why">운영자 첫 질문(「사업별로 비어있는 부분이 많은데 내가 채워줘야 할 부분이 있어?」)에 대한 실측 답이다.
씨앗(<code>data/biz_finance.js</code> = 운영자가 올린 「&lt;연도&gt;년 예술사업 대시보드.xlsx」 반입분)을 그대로 세었다.
<b>「미입력」과 「0원이 맞다」는 다르다</b> — 원본 엑셀에서 <b>빈칸이던 것만</b> 미입력으로 세고, 담당자가 적은 0은 안 센다.</p>
<div class="card">
<p class="kv">분야별 요약 — <b>미입력 사업</b> = 금액·인원 6칸 중 하나라도 원본이 빈칸이던 사업 수</p>
<table><thead><tr><th>연도</th><th>분야</th><th>사업</th><th>미입력 사업</th><th>회계구분 없음</th><th>진행월 없음</th></tr></thead>
<tbody>%s</tbody></table>
</div>
<div class="card" style="margin-top:14px">
<p class="kv">사업별 상세 — <b>미입력</b>(원본 빈칸) / <b>값이 0</b>(적혀 있으나 0 · 참일 수 있음) / <b>기타 빈칸</b></p>
<div class="scroll"><table><thead><tr><th>연도</th><th>사업NO</th><th>분야</th><th>사업명</th><th>미입력</th><th>값이 0</th><th>기타 빈칸</th></tr></thead>
<tbody>%s</tbody></table></div>
<div class="note">채우는 자리 = 사업 개요 머리줄 <b>[사업 지표 입력]</b>(회계 담당자·관리자). 사업 고르는 칸에 <b>「● 미기입 N」</b>이 그대로 뜬다.
저장은 시트 <code>운영_사업비</code>로 가고, 같은 사업NO는 시트가 씨앗을 이긴다 = 재빌드가 담당자 수정본을 되돌리지 않는다.</div>
</div>

<h2><span class="no">▸</span>게이트</h2>
<div class="card"><p class="kv">
check_design ✓ · check_finance ✓ · check_refs ✓ · check_modal_head ✓ · check_exchart ✓ · check_wiring ✓ ·
check_break_rule ✓ · check_biz_list ✓ · check_wide_threshold ✓ · build_annual_yr ✓ ·
smoke_layout ✓(이젤·흰 라인 Δ0) · smoke_component_parity ✓(갈래 증가 0) · smoke_finance ✓ · smoke_login ✓ ·
smoke_modal_head ✓ · smoke_bizchart ✓ · smoke_wizard_open ✓</p>
<div class="note">신규 CSS·색·토큰 <b>0</b> — 분야 선택자는 이미 쓰던 정본 도구 묶음(<code>.ry-hd-tools</code> 절대배치 +
<code>.ry-live-tg</code> + <code>.ry-hd-div</code>)을 그대로 재사용했다. 절대배치라 카드 높이·유리 박스 기하가 안 밀린다
(운영자 「지금의 틀을 안 넘어가게 주의」).</div></div>
</div></body></html>""" % (
    CSS,
    ba("KPI = 네 칸 · 억 표기",
       "「사업비는 0.0억 · 수익도 0.0억 · 수익률은 정상 · 예산이 더 앞에 개념 · 총 예산/사업비/수입/수익률 이 4개만. 차액은 일단 없어도 되고」"
       " — 다섯 칸(사업비·수입·수익률·예산·차액, 만원)에서 네 칸(총 예산·사업비·수입·수익률, 억)으로.",
       img("before_kpi"), img("after_kpi"),
       "차액은 <b>지운 게 아니라 KPI에서만 내렸다</b> — 「사업 결과」 표와 우 열 「차액 적자」가 그대로 들고 있다. "
       "머리줄 부제의 「단위 원」은 뺐다(자가 두 층이 된 뒤로 면 전체를 한 자로 말하면 거짓이 된다)."),
    ba("표 = 백만원 반올림",
       "「각 분야별 사업별 … 그 부분에 예산을 백만원 단위로 하고 반올림할게 그니까 1,470,284,757 이면 1,470 백만 원」"
       " — 두 표의 돈 칸 전부와 우 열 「차액 적자」를 같은 자로 맞췄다.",
       img("before_card1"), img("after_card1"),
       "왜 KPI만 억이고 표는 백만원인가 = 해상도가 다르다. 억 한 자리로 표를 줄이면 1,470,284,757과 1,455,038,020이 "
       "<b>둘 다 14.7억</b>이 되어 사업 간 비교가 뭉갠다."),
    ba("「사업별」 → 「분야별」 + 분야 선택자",
       "「사업별을 &gt; 분야별로 해서 (박스 안) 우측 상단에 공연 전시 예술교육 선택자 · 기본으로 공연 · "
       "사업no 실제 표기는 공연-01만 · 분야는 선택자에서 걸러지니까 없어도 됨 · 회계구분은 비고라고 표기해서 맨 우측 · "
       "사업명이 좀 더 표출 · no › 사업명 › 사업비 수입 수익률 비고」",
       img("before_card2"), img("after_jeon_card2"),
       "사업명 칸이 넓어진 실제 출처 = <b>분야 열을 뺀 자리</b>(사업명은 남는 폭을 통째로 흡수하는 칸이다). "
       "「후」는 선택자로 <b>전시</b>를 고른 상태 — 기본값은 공연이다. 전시 행의 비고가 전부 「—」인 이유는 "
       "<b>전시에 회계구분이 원래 없어서</b>다(아래 「안 채워진 칸」 참조)."),
    ba("우 열 = 「회계구분별」 철거",
       "「회계 구분별 사업지표는 필요없고」 — 카드 한 장을 내렸다. 회계구분 축은 좌 열 「분야별」 표의 <b>비고 열</b>로 옮겨 살아 있다.",
       img("before_rail"), img("after_rail"),
       "남은 카드(차액 적자)가 <code>data-bizmfill</code>로 남는 높이를 흡수한다 = 좌·우 흰 라인 Δ0 계약 유지"
       "(smoke_layout 실측 통과)."),
    sum_rows, fill_rows)

OUT.write_text(doc, encoding="utf-8")
print("wrote", OUT, "%.0f KB" % (OUT.stat().st_size / 1024))
print("미입력/빈칸 사업 %d건" % len(fill_tbl))
