# [scratch · 260813-2] 사업 개요 2차 전/후 리포트 — 디자인은 260813 1차 리포트 CSS를 **그대로** 재사용(새 디자인 0).
import base64, json, os, re, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOT = os.path.join(ROOT, "tools", "scratch", "shots")
PREV = os.path.join(ROOT, "docs", "reports", "260813_사업개요_표기단위_분야선택_전후.html")
OUT  = os.path.join(ROOT, "docs", "reports", "260813_사업개요_기준일_전시분리_전후.html")

def b64(name):
    p = os.path.join(SHOT, name if name.endswith(".png") else name + ".png")
    if not os.path.exists(p): return None
    with open(p, "rb") as f: return "data:image/png;base64," + base64.b64encode(f.read()).decode()

def img(name):
    d = b64(name)
    return '<img src="%s" alt="">' % d if d else '<p class="bad">캡처 없음: %s</p>' % name

css = re.search(r"<style>(.*?)</style>", open(PREV, encoding="utf-8").read(), re.S).group(1)

# 이름 가르기 전수 — 화면과 **같은 함수**를 index.html에서 뽑아 돌린다(복붙 아님)
H = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
src = (re.search(r"var _FIN_PAREN=.*?;", H, re.S).group(0) + "\n"
       + re.search(r"function _finNamePair\(name\)\{[\s\S]*?\n\}", H).group(0))
node = subprocess.run(["node", "-e", """
const fs=require("fs"),vm=require("vm");
const s=fs.readFileSync("data/biz_finance.js","utf8");
const sb={}; vm.createContext(sb); vm.runInContext(s+"\\nthis.__R=BIZ_FIN;",sb);
%s
const F=sb.__R,out=[];
for(const y of Object.keys(F.years)) for(const r of F.years[y].rows){
  const o=_finNamePair(r.name);
  out.push({y,no:r.no.replace(/^20\\d\\d-/,""),cat:r.cat,acct:r.acct||"",raw:r.name,show:o.show,tag:o.tag});
}
console.log(JSON.stringify(out));
""" % src], cwd=ROOT, capture_output=True, text=True)
rows = json.loads(node.stdout)
tagged = [r for r in rows if r["tag"]]
plain  = [r for r in rows if not r["tag"]]
bracket = [r for r in rows if "<" in r["raw"] or "〈" in r["raw"]]

def esc(s): return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

trs = "".join(
    '<tr><td class="mono">%s %s</td><td class="dim">%s</td><td>%s</td><td><b>%s</b></td><td>%s</td><td class="dim">%s</td></tr>'
    % (r["y"], esc(r["no"]), esc(r["cat"]), esc(r["raw"]), esc(r["show"]),
       ('<span style="color:var(--accent);font-weight:700">%s</span>' % esc(r["tag"])) if r["tag"]
       else '<span class="dim">— 운영자가 채울 자리</span>', esc(r["acct"]) or "—")
    for r in rows)

html = """<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>사업 개요 2차 — 기준일·전시 분리 전/후 (260813)</title>
<style>%s</style></head><body><div class="wrap">
<h1>사업 개요 2차 — 차액 열 · 기준일(광학 수평) · 전시 이름 분리</h1>
<p class="lede">260813 운영자 2차 지시 4건. 실제 앱을 헤드리스로 띄워 찍은 화면이다(모형 아님 · 씨앗 데이터 · 실API 미접촉).
「전」 = 지금 라이브(<span class="mono">1ae1b56</span>)를 같은 하네스로 되돌려 촬영.</p>
<p class="note"><b>범위 정정</b> — 지시 중 「클래식1을 사업명에서 빼고 비고로」는 작업 도중 <b>다른 세션이 먼저 머지했다</b>(#805·#806 · <code>_finNamePair</code>/<code>_finShowName</code>).
같은 값에 함수를 두 벌 만들면 이 레포가 금지하는 상태가 되므로 <b>내 중복 구현은 버리고</b> 그쪽 정본을 그대로 쓰되, <b>덜 된 두 곳만</b> 손봤다(③).</p>

<h2><span class="no">①</span>사업 결과 — 차액 열 제거 + 우측 기준일</h2>
<p class="why">지시: 「사업 결과에 <b>차액 안나와도 될것 같고</b>」 · 「사업 결과 우측에는 몇일 기준인지… <b>데이터를 마지막으로 건드린 시점</b>을 기준으로 <b>(2026. 8. 13. 기준)</b> 이렇게」.
차액 축은 <b>안 잃는다</b> — 우 열 「차액 적자」 카드가 그대로 들고 있다.</p>
<div class="ba"><div class="card"><span class="tag b">전</span>%s</div><div class="card"><span class="tag a">후</span>%s</div></div>
<p class="note"><b>왜 오늘 날짜를 안 찍나</b> — <code>new Date()</code>로 오늘을 쓰면 데이터가 반년째 그대로여도 화면은 늘 「오늘 기준」이라 거짓말이 된다.
원천 ① 시트 <code>수정일시</code>(담당자가 실제 저장한 시각) 중 가장 늦은 것 → ② 없으면 씨앗 <code>BIZ_FIN.built</code>(빌더가 찍는다) → ③ 둘 다 없으면 <b>라벨을 아예 안 그린다</b>(모르는 날짜를 지어내지 않는다).
게이트 <code>check_finance</code> ⑭가 오늘 찍기를 하드로 막는다(킬테스트 4/4).</p>

<h2><span class="no">②</span>광학 잉크 수평 — 「사업 결과」 ↔ 기준일 라벨</h2>
<p class="why">지시: 「사업 결과라는 말하고 <b>광학 잉크 단위로 수평이게 픽셀 측정</b>」.
레이아웃 상자로는 못 잡는다 — 13px/700과 11px/600은 <b>상자 중심과 잉크 중심이 다르다</b>.
260804 2차(<code>.ry-hd-tools</code> 7.38px 어긋남을 잡은 그 자)와 <b>같은 방법</b>: DPR 4로 제목 줄을 캡처 → 그 PNG를 canvas에 도로 그려 <b>칠해진 화소만</b> 스캔 → 잉크 상·하단과 중심.</p>
<table><thead><tr><th>임계</th><th>제목 「사업 결과」 잉크</th><th>기준일 라벨 잉크</th><th>Δ (라벨−제목)</th><th>판정</th></tr></thead><tbody>
<tr><td class="mono">보정 전 thr60</td><td class="mono">21.00~33.25 · 중심 27.125</td><td class="mono">22.50~33.25 · 중심 27.875</td><td class="mono bad">+0.750px</td><td class="bad">라벨이 아래로 처짐</td></tr>
<tr><td class="mono">보정 후 thr30</td><td class="mono">20.75~33.25 · 중심 27.000</td><td class="mono">21.50~32.50 · 중심 27.000</td><td class="mono"><b>0.000px</b></td><td style="color:var(--green);font-weight:700">수평</td></tr>
<tr><td class="mono">보정 후 thr60/90</td><td class="mono">21.00~33.25 · 중심 27.125</td><td class="mono">21.50~32.25 · 중심 26.875</td><td class="mono"><b>−0.250px</b></td><td style="color:var(--green);font-weight:700">수평 (DPR4에서 1화소 이하)</td></tr>
</tbody></table>
<p class="note"><b>고침 = <code>padding-bottom:1.5px</code>, 매직 넘버가 아니다</b> — 1.5 = 실측 Δ 0.75 × 2.
이 칸은 flex <b>컨테이너</b>라 안쪽 글자가 익명 플렉스 항목이고 <code>align-items:center</code>는 <b>콘텐츠 상자</b> 기준으로 가운데를 잡는다 → 아래 패딩 1.5px = 글자가 정확히 0.75px 올라간다.
transform 대신 패딩인 이유 = 합성 레이어를 안 만들고 순수 배치로 끝나 DPR이 바뀌어도 같은 규칙으로 따라간다. 재는 자 = <code>tools/scratch/ink_asof.mjs</code>.
자리·활자는 <b>기존 둘의 합성</b>(<code>.ry-hd-tools</code> 절대배치 + <code>.ct .sub</code>의 11px/600/<code>--dim</code>) = 새 색·새 토큰·새 raw hex <b>0</b>.</p>

<h2><span class="no">③</span>분야별 — 덜 된 두 곳</h2>
<p class="why">지시: 「비고에 <b>예술성 대신해서</b> 사업명칭을 넣을게 … 그 다음에 <b>내가 부족분을 채울게</b>」.</p>
<div class="ba"><div class="card"><span class="tag b">전</span>%s</div><div class="card"><span class="tag a">후</span>%s</div></div>
<table><thead><tr><th>덜 된 것</th><th>전 (라이브)</th><th>후</th></tr></thead><tbody>
<tr><td><b>전시가 통째로 안 갈림</b> — 원본이 작품명을 <code>&lt;&gt;</code>에 넣는데 구 정규식은 <code>()</code>만 봤고, 닫는 괄호가 <b>문자열 끝</b>이어야 해서 꼬리말 붙은 것도 놓쳤다</td>
<td class="mono">어린이 미술전 &lt;냠냠&gt; / 비고 —</td><td class="mono"><b>냠냠</b> / 비고 <b>어린이 미술전</b></td></tr>
<tr><td><b>「예술성」이 도로 섬</b> — 묶음 이름이 없으면 <code>|| r.acct</code>로 되돌아갔다. 운영자가 빼달라고 한 그 글자다</td>
<td class="mono">신년음악회 / 비고 <span class="bad">예술성</span><br>화요살롱 / 비고 <span class="bad">클래스</span></td>
<td class="mono">신년음악회 / 비고 <b>—</b><br>화요살롱 / 비고 <b>—</b></td></tr>
<tr><td><b>정규식이 두 벌</b> — 260812-9 주석은 「<code>_finAliases</code>와 같은 한 벌」이라 적었지만 실제로는 복제본이 따로 살아 있었다. 표기만 꺾쇠를 배우고 조인은 못 배웠다</td>
<td class="mono">표기 <code>_FIN_PAREN</code> · 조인 인라인 복제</td><td class="mono"><b><code>_FIN_PAREN</code> 한 벌</b>(게이트 ⑮가 잠금)</td></tr>
</tbody></table>
<p class="note">비어 있는 비고(<b>%d/%d건</b>)가 곧 <b>운영자가 채울 부족분</b>이다 — 채워 넣지 않고 「—」로 두고 기다린다.
비고는 시트 <code>비고</code> 칸에 적으면 그쪽이 이긴다(사업 지표 입력 창에 이미 있는 칸).
⚠ 회계구분 축은 안 잃는다 — 상세 창·입력 창·사업비 보드가 그대로 들고 있고 거르기도 그쪽이 한다.
⚠ <b>표기만 가른다 — 값(<code>name</code>)은 안 건드린다.</b> 조인 무회귀는 <code>smoke_finance</code> ④(정확 일치 ✓ · 괄호 안 이름 ✓ · 없는 건 안 붙음 ✓)로 실측했다.</p>

<h2><span class="no">④</span>가르기 전수 — %d건 (묶음 이름 있음 %d · 없음 %d · 꺾쇠 %d)</h2>
<div class="scroll"><table><thead><tr><th>연도·NO</th><th>분야</th><th>원본 사업명(값 · 안 바뀜)</th><th>화면 사업명</th><th>화면 비고</th><th>회계구분(다른 화면엔 그대로)</th></tr></thead><tbody>%s</tbody></table></div>

<h2><span class="no">⑤</span>덤 — <code>main</code>이 빨갰다</h2>
<p class="why">작업 도중 발견: 내 변경 <b>이전</b>, clean <code>origin/main</code>(<span class="mono">1ae1b56</span>)에서 <code>check_finance</code> ⑧이 실패하고 있었다.</p>
<p class="note"><b>원인</b> — #806이 <code>2026년 기획사업 정산서 매출.xlsx</code>로 4행(2026-전시-01·02·03 · 2026-교육-01)을 새로 만들었는데,
<code>.gitignore</code>의 <code>*.xlsx</code> 때문에 <b>그 원천이 커밋되지 않았다</b>. 게이트 ⑧은 빌더를 다시 돌려 NO 안정성을 실증하는데, 원천이 없으니 그 4행이 재현되지 않고 <span class="bad">「NO가 밀렸다」</span>로 잡혔다.
<b>고침</b> — 「사라짐(→None)」과 「다른 번호로 바뀜(A→B)」을 가른다. 씨앗 <code>src</code>가 이름을 적어 둔 원천 중 <b>레포에 실제로 없는 파일</b>이 있으면 사라짐은 <b>면책 + 파일명 지목</b>, 그 외에는 종전대로 실패.
이빨은 안 뺐다 — 원천이 다 있는데 행이 사라지면 그대로 사고로 잡는다(킬테스트로 실증).
⚠ <b>씨앗은 재생성하지 않았다</b> — 재빌드하면 83행 → 79행이 되고 2026-공연-06 매출 31,922,000 → 0 등 <b>방금 반입된 값이 되돌아간다</b>(레포 무접촉 프로브로 실측 후 중단).
그 xlsx를 최상단에 두고 <code>python3 tools/build_biz_finance.py</code>를 한 번 돌리면 ⓐ 면책이 사라져 ⑧을 완전히 재고 ⓑ 씨앗에 <code>built</code>가 찍혀 기준일 폴백이 채워진다.</p>

<h2><span class="no">⑥</span>리베이스에서 드러난 것 — 넘김 611px은 내 것이 아니다</h2>
<p class="why">작업 중 <code>main</code>이 두 번 더 움직였다(#807 좌 메인 차트 · #808 빈 값 = 숫자 0 · #809 차트를 매출로 · #810 _YR 분리 · #811 확정 공연명·선택자 버그). 리베이스해 합친 뒤 같은 하네스로 재니
<b>분야별 카드가 유리 박스 아래로 611.1px 넘친다</b>(1500×1050). <b>상류 <code>HEAD</code>를 그대로 재도 같은 넘김</b> — #807이 넣은 410px 고정 높이 차트 카드가 원인이고 내 변경과 무관하다.
정본 게이트 <code>smoke_layout</code>은 1920×1080에서 재기 때문에 통과한다. <b>그 카드는 지금 다른 세션이 만지는 중이라 손대지 않았다</b> — 같은 자리를 두 세션이 동시에 고치면 그게 사고다.</p>

<h2><span class="no">⑦</span>덤 2 — 분야 선택자가 죽어 있었다</h2>
<p class="why">#809가 「분야별」 표를 <b>우측 레일로 옮겼는데</b>(운영자 「분야별 표 이거 우측으로 보내줘」) <code>_bizOvSetCat</code>은 <code>_bizInlineRender()</code>(= <code>#biz-main</code> 좌 열만)만 부르고 있었다.
클릭은 먹는데 <b>그리는 쪽이 딴 열</b>이라, 전시·예술교육을 눌러도 표가 <b>공연 17건 그대로</b>였다(실측).
나도 같은 걸 고쳤지만 리베이스해 보니 <b>#811이 먼저 머지돼 있었고 그쪽이 더 낫다</b>(정식 진입점 <code>_railYrmRender()</code>) — 내 중복분은 버렸다. 실측 <b>공연 17 → 전시 9 → 예술교육 6</b>.</p>

<h2><span class="no">⑧</span>실측</h2>
<p class="why">게이트 <b>20종 전건 PASS</b> · 킬테스트 <b>10/10 차단</b>(기준일 5 · 정규식 한 벌 · ⑧ 이빨 등) ·
실클릭 공연 17 → 전시 9 → 예술교육 6 · <code>pageerror</code> 0 ·
카드가 유리 박스 안선 <b>안쪽</b>(하단 −18.9px · 우 −19px = 전과 동일) · 새 CSS는 <code>.ry-hd-asof</code> 한 줄, 새 색·토큰·raw hex 0.</p>
</div></body></html>
""" % (css, img("before7_card1"), img("after7_card1"), img("before7_card2"), img("after7_card2"),
       len(plain), len(rows), len(rows), len(tagged), len(plain), len(bracket), trs)

open(OUT, "w", encoding="utf-8").write(html)
print("→ %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
print("   묶음 이름 있음 %d · 없음 %d · 꺾쇠 %d · 합 %d" % (len(tagged), len(plain), len(bracket), len(rows)))
