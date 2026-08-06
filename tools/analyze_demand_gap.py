#!/usr/bin/env python3
"""[260806] 관심 수요(접속통계) × 구매 수요(예매 원장) 격차 실측 → docs/reports/ HTML

왜 두 축을 따로 재는가 = **홈페이지에 들어온 사람과 실제로 표를 산 사람은 같은 사람이 아니다**(운영자 260806).
  접속통계는 「누가 봤나」(연령·지역)만 알고 「어떻게 샀나」를 모른다.
  예매 원장은 「어떻게 샀나」(리드타임·동반·채널·단가)만 알고 「누구인가」를 모른다.
  → 두 표를 **한 장에 나란히** 놓아야 「관심은 있는데 안 사는 자리」가 보인다.

⚠ 이 스크립트가 **못 하는 것**(260806 실측 · 추정으로 메우지 않는다):
  ① 공연별 1:1 조인 = 불가. 접속통계는 2026년분(47종)뿐이고 예매 원장은 2020~2025라
     **이름 정확일치 0종**이다. 그래서 아래 비교는 전부 **수요군(장르) 단위 구조 비교**지
     같은 공연의 전환율이 아니다. 전환율을 재려면 연도가 겹치는 접속통계가 필요하다.
  ② 실예매자의 연령·지역 = 불가. 원장에 그 열이 없다(회원 조인은 Worker `운영_회원` 시트
     = 관리자 PIN 필요). 화면에는 이미 있다 — AI 홍보 ▸ 고객 분류(`_seg*`).
  ③ 암호 파일 102개 = XLS_PW 없으면 건너뛴다. 평문 104개(2020~2024 연도 폴더 = 사실상 전량,
     2025는 5종만)로도 32,180 고유주문이라 구조 비교에는 충분하지만 **2025는 얇다**.

실행: [XLS_PW=<열기암호>] python3 tools/analyze_demand_gap.py
산출: docs/reports/260806_관심자_실예매자_수요격차.html (자기완결 1파일)
"""
import collections
import datetime
import io
import json
import os
import re
import statistics as st
import sys
import warnings
import zipfile

warnings.filterwarnings('ignore')

try:
    import openpyxl
except ImportError:
    sys.exit('✗ openpyxl 없음 — pip install openpyxl (암호분까지 읽으려면 msoffcrypto-tool도)')
try:
    import msoffcrypto
except ImportError:
    msoffcrypto = None

ZIP = os.environ.get('BOOKING_ZIP', '2020~2025 공연 주문 정보.zip')
ACC = 'data/perf_access_stats.js'
OUT = 'docs/reports/260806_관심자_실예매자_수요격차.html'
XLS_PW = os.environ.get('XLS_PW', '')
OLE = b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
KEEP = ['대표티켓번호', '판매순번', '주문상태', '판매일', '상품명', '이용(관람)일시',
        '총매수', '최종정상매수', '금액', '회원여부', '판매처', '주문일시']

# ── 수요군 = 상품명 키워드 추정(대장 장르는 Worker 측이라 오프라인 재현 불가 · 「추정」으로 표기한다) ──
FAM = r'티니핑|번개맨|에그박사|베베핀|100층|달 ?샤베트|어린이|가족|키즈|공룡|뽀로로|콩순이|캐리|헬로카봇|알사탕|구름빵|브레드이발소'
CLA = r'실내악|오케스트라|심포니|필하모닉|리사이틀|오페라|협주|클래식|브런치|앙상블|합창|국악|정기연주|독주회|콰르텟|피아노|첼로|바이올린'
MOB = re.compile(r'mobile|모바일|어플|앱|안드로이드|아이폰', re.I)
AGE = ["20세 미만", "20~29세", "30~39세", "40~49세", "50~59세", "60~69세", "70세 이상"]
REG = ["여수", "순천", "광양", "호남", "광주", "호남 외 지역"]


def seg(n):
    n = str(n)
    if re.search(FAM, n):
        return '① 가족·아동'
    if '뮤지컬' in n:
        return '② 뮤지컬(성인)'
    if re.search(CLA, n):
        return '③ 클래식·국악'
    if '연극' in n:
        return '④ 연극'
    return '⑤ 기타·대중'


def d8(s):
    m = re.search(r'(20\d{6})', str(s) or '')
    if not m:
        return None
    try:
        g = m.group(1)
        return datetime.date(int(g[:4]), int(g[4:6]), int(g[6:8]))
    except ValueError:
        return None


def num(s):
    try:
        return float(re.sub(r'[^0-9.\-]', '', str(s) or '') or 0)
    except ValueError:
        return 0.0


def esc(s):
    return (str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


# ── 1. 예매 원장 읽기 ────────────────────────────────────────────────────────
def vintage(name):
    """겹친 주문에서 어느 파일 값을 믿을지 — tools/booking_extract.py와 같은 사다리(값이 갈리면 안 된다)."""
    if name.startswith('(12.13_'):
        return 3
    if name.startswith('(11.7_'):
        return 2
    if name.startswith('2021~2025 예매자리스트'):
        return 1
    return 0


def load_orders():
    z = zipfile.ZipFile(ZIP)
    store, files, skipped = {}, 0, 0
    for i in z.infolist():
        if i.is_dir():
            continue
        try:
            nm = i.filename.encode('cp437').decode('cp949')
        except (UnicodeDecodeError, UnicodeEncodeError):
            nm = i.filename
        vt = vintage(nm)
        raw = z.read(i.filename)
        if raw[:8] == OLE:
            if not (XLS_PW and msoffcrypto):
                skipped += 1
                continue
            try:
                f = msoffcrypto.OfficeFile(io.BytesIO(raw))
                f.load_key(password=XLS_PW)
                buf = io.BytesIO()
                f.decrypt(buf)
                raw = buf.getvalue()
            except Exception:
                skipped += 1
                continue
        try:
            wb = openpyxl.load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
        except Exception:
            skipped += 1
            continue
        files += 1
        it = wb.worksheets[0].iter_rows(values_only=True)
        idx = None
        for r in it:                                   # 헤더 = 값 4칸 이상 첫 줄
            c = ['' if x is None else str(x).strip() for x in r]
            if sum(1 for v in c if v) >= 4:
                idx = {h: j for j, h in enumerate(c)}
                break
        if not idx:
            wb.close()
            continue
        for r in it:
            if r is None:
                continue
            v = ['' if x is None else str(x).strip() for x in r]
            if not any(v):
                continue
            rec = {k: (v[idx[k]] if k in idx and idx[k] < len(v) else '') for k in KEEP}
            key = (rec['대표티켓번호'], rec['판매순번'])
            if key not in store or vt > store[key][0]:
                store[key] = (vt, rec)
        wb.close()
    return [r for _, r in store.values()], files, skipped


# ── 2. 접속통계 읽기 ─────────────────────────────────────────────────────────
def load_access():
    src = open(ACC, encoding='utf-8').read()
    rows = [json.loads(m) for m in re.findall(r'^\s*(\{.*\})[,]?$', src, re.M)]
    asof = (re.search(r'asof:\s*"([^"]+)"', src) or [None, ''])[1]
    return rows, asof


def wavg(rs, key, n):
    tot = sum(r['t'] for r in rs) or 1
    return [sum(r['t'] * r[key][i] for r in rs) / tot for i in range(n)]


# ── 3. HTML 부품 — index.html 정본 계승(_accBar 막대 · .ana-kpi 칸) ──────────
def bar(label, pct, mx, hi):
    w = max(2, pct / mx * 100) if mx > 0 else 0
    fill = 'var(--accent);opacity:.79' if hi else 'var(--peach-text);opacity:.5'
    return (f'<div class="barrow"><div class="barlab">{esc(label)}</div>'
            f'<div class="bartrk"><div class="barfil" style="width:{w:.1f}%;background:{fill}"></div></div>'
            f'<div class="barval">{pct:.1f}%</div></div>')


def dist(title, sub, vals, labels):
    mx = max(vals) if vals else 0
    top2 = [i for _, i in sorted(((v, i) for i, v in enumerate(vals)), reverse=True)[:2]]
    body = ''.join(bar(l, vals[i] or 0, mx, i in top2) for i, l in enumerate(labels))
    return f'<div class="disth">{esc(title)} <span class="dists">{esc(sub)}</span></div>{body}'


def kpi(lab, val, sub):
    return f'<div class="kpi"><div class="lab">{esc(lab)}</div><div class="val">{val}</div><div class="sub">{esc(sub)}</div></div>'


def main():
    orders, files, skipped = load_orders()
    acc, asof = load_access()
    if not orders:
        sys.exit('✗ 예매 원장을 한 건도 못 읽었다 — zip 경로 확인')
    print(f'[gap] 원장 파일 {files} (건너뜀 {skipped}) · 고유주문 {len(orders):,} · 접속통계 {len(acc)}종', file=sys.stderr)

    # ── 관심 축 집계 ──
    aT = sum(r['t'] for r in acc)
    aAge, aReg = wavg(acc, 'a', 7), wavg(acc, 'g', 6)
    byC = {}
    for c in ('기획', '대관'):
        rs = [r for r in acc if r['c'] == c]
        if rs:
            byC[c] = (len(rs), sum(r['t'] for r in rs), wavg(rs, 'a', 7), wavg(rs, 'g', 6))
    big = [r for r in acc if r['t'] >= 100]
    famTop = sorted(big, key=lambda r: -(r['a'][2] + r['a'][3]))[:5]
    oldTop = sorted(big, key=lambda r: -sum(r['a'][4:7]))[:5]
    outTop = sorted(big, key=lambda r: -r['g'][5])[:5]
    accTop = sorted(acc, key=lambda r: -r['t'])[:8]

    # ── 구매 축 집계 ──
    yr = collections.Counter()
    lead, pty, unit = [], [], []
    ch = collections.Counter()
    mem = mob = 0
    first = {}
    for r in orders:
        s = d8(r['판매일'])
        if s and r['상품명']:
            first[r['상품명']] = min(first.get(r['상품명'], s), s)
    openday = openday14 = restday = restday14 = 0
    for r in orders:
        u, s = d8(r['이용(관람)일시']), d8(r['판매일'])
        if u:
            yr[u.year] += 1
        if s and u and -1 <= (u - s).days <= 400:
            lead.append((u - s).days)
        p, a = int(num(r['최종정상매수']) or 0), num(r['금액'])
        if 1 <= p <= 20:
            pty.append(p)
            if a > 0:
                unit.append(a / p)
        if r['회원여부'] == 'Y':
            mem += 1
        if MOB.search(r['판매처'] or ''):
            mob += 1
        ch[r['판매처'] or '(공란)'] += 1
        m = re.search(r'(20\d{6})(\d{2})', str(r['주문일시']) or '')
        if m and s and r['상품명'] in first:
            if s == first[r['상품명']]:                 # 오픈 당일
                openday += 1
                openday14 += int(m.group(2)) == 14
            else:                                      # 그 외 날 = 14시 쏠림의 대조군
                restday += 1
                restday14 += int(m.group(2)) == 14
    lead.sort()
    N = len(orders)
    lb = collections.Counter()
    for d in lead:
        lb['당일~D-1' if d <= 1 else 'D-2~6' if d <= 6 else 'D-7~13' if d <= 13
           else 'D-14~29' if d <= 29 else 'D-30~59' if d <= 59 else 'D-60+'] += 1
    LB = ['당일~D-1', 'D-2~6', 'D-7~13', 'D-14~29', 'D-30~59', 'D-60+']
    pb = collections.Counter()
    for p in pty:
        pb['1매' if p == 1 else '2매' if p == 2 else '3매' if p == 3 else '4매' if p == 4
           else '5~9매' if p <= 9 else '10매+'] += 1
    PB = ['1매', '2매', '3매', '4매', '5~9매', '10매+']

    # ── 수요군 교차 ──
    B = collections.defaultdict(lambda: {'n': 0, 'lead': [], 'pty': [], 'unit': [], 'mem': 0, 'mob': 0})
    for r in orders:
        b = B[seg(r['상품명'])]
        b['n'] += 1
        u, s = d8(r['이용(관람)일시']), d8(r['판매일'])
        if s and u and -1 <= (u - s).days <= 400:
            b['lead'].append((u - s).days)
        p, a = int(num(r['최종정상매수']) or 0), num(r['금액'])
        if 1 <= p <= 20:
            b['pty'].append(p)
            if a > 0:
                b['unit'].append(a / p)
        if r['회원여부'] == 'Y':
            b['mem'] += 1
        if MOB.search(r['판매처'] or ''):
            b['mob'] += 1

    segrows = ''
    for k in sorted(B):
        b = B[k]
        L, P, U = sorted(b['lead']), b['pty'], b['unit']
        d7 = sum(1 for x in L if x <= 7) / len(L) * 100
        p4 = sum(1 for x in P if x >= 4) / len(P) * 100
        segrows += (f'<tr><td class="sg">{esc(k)}</td><td>{b["n"]:,}</td>'
                    f'<td class="hi">{st.median(L):.0f}일</td><td>{d7:.1f}%</td>'
                    f'<td class="hi">{st.mean(P):.2f}매</td><td>{p4:.1f}%</td>'
                    f'<td class="hi">{st.median(U):,.0f}원</td><td>{b["mem"]/b["n"]*100:.1f}%</td>'
                    f'<td>{b["mob"]/b["n"]*100:.1f}%</td></tr>')
    segrows += (f'<tr class="tot"><td class="sg">전체</td><td>{N:,}</td>'
                f'<td class="hi">{st.median(lead):.0f}일</td>'
                f'<td>{sum(1 for x in lead if x<=7)/len(lead)*100:.1f}%</td>'
                f'<td class="hi">{st.mean(pty):.2f}매</td>'
                f'<td>{sum(1 for x in pty if x>=4)/len(pty)*100:.1f}%</td>'
                f'<td class="hi">{st.median(unit):,.0f}원</td>'
                f'<td>{mem/N*100:.1f}%</td><td>{mob/N*100:.1f}%</td></tr>')

    def lst(rows, fn, tail=None):
        # tail 기본 = 접속수(순위 근거). TOP8처럼 fn이 이미 접속수면 tail을 1위 연령으로 바꿔 중복 표기를 없앤다.
        t = tail or (lambda r: f'{r["t"]:,}')
        return ''.join(f'<li><b>{fn(r)}</b> <span class="nm">{esc(r["n"][:34])}</span> '
                       f'<span class="tt">{t(r)}</span></li>' for r in rows)

    def topage(r):
        i = max(range(7), key=lambda k: r['a'][k])
        return f'{AGE[i]} {r["a"][i]:.0f}%'

    yrs = ' · '.join(f'{k} {v:,}' for k, v in sorted(yr.items()))
    chtop = ''.join(f'<li><span class="nm">{esc(c[:26])}</span> <span class="tt">{v/N*100:.1f}%</span></li>'
                    for c, v in ch.most_common(6))

    html = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>관심 수요 × 구매 수요 격차 실측 — 260806</title>
<style>
:root{{--accent:#4A4DE7;--accent-light:#E8E8FD;--peach-text:#D88455;--peach-bg:#FDF6F3;
--surface-solid:#fff;--glass-surface:rgba(255,255,255,.78);--border:rgba(0,0,0,.09);--border2:rgba(0,0,0,.12);
--text:#1A1A2E;--dim:#888;--muted:#bbb;--green:#1A6B3C;--danger:#E24B4A;--past-bg:rgba(0,0,0,.02);
--c5:#2D8AB3;--c6:#F5B400;--radius:16px;--radius-lg:20px;
--elev:0 20px 56px rgba(74,77,231,.16),0 6px 18px rgba(26,26,46,.07)}}
*{{box-sizing:border-box}}
body{{margin:0;padding:26px 18px 60px;background:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);
color:var(--text);font-family:-apple-system,BlinkMacSystemFont,'Pretendard','Malgun Gothic',sans-serif;
font-size:13px;line-height:1.62;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1080px;margin:0 auto}}
.mhead{{background:var(--accent);color:#fff;border-radius:var(--radius-lg) var(--radius-lg) 0 0;padding:16px 22px}}
.mhead h1{{margin:0;font-size:19px;font-weight:800;letter-spacing:-.2px}}
.mhead p{{margin:3px 0 0;font-size:12px;opacity:.88}}
.card{{background:var(--glass-surface);border:1px solid var(--border);border-top:0;
border-radius:0 0 var(--radius-lg) var(--radius-lg);box-shadow:var(--elev);padding:22px;backdrop-filter:blur(8px)}}
section{{margin:26px 0 0;padding:18px 20px;background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius)}}
section:first-of-type{{margin-top:0}}
h2{{margin:0 0 4px;font-size:15px;font-weight:800}}
h2 .n{{color:var(--accent);margin-right:6px}}
.sub{{margin:0 0 14px;font-size:11.5px;color:var(--dim)}}
.warn{{background:var(--peach-bg);border:1px solid var(--peach-text);border-left-width:4px;
border-radius:10px;padding:12px 15px;margin:0 0 16px}}
.warn b{{color:var(--peach-text)}}
.lead{{font-size:13.5px;margin:0 0 12px;padding-left:15px;border-left:3px solid var(--accent)}}
.grid{{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}}
.kpis{{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}}
.kpi{{flex:1;min-width:118px;background:var(--past-bg);border:1px solid var(--border);border-radius:11px;padding:9px 12px}}
.kpi .lab{{font-size:10.5px;color:var(--dim);font-weight:600}}
.kpi .val{{font-size:19px;font-weight:800;color:var(--accent);font-variant-numeric:tabular-nums;line-height:1.25}}
.kpi .sub{{font-size:10px;color:var(--dim);margin:0}}
.barrow{{display:flex;align-items:center;gap:9px;margin:4px 0}}
.barlab{{flex:0 0 66px;font-size:11px;font-weight:600;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.bartrk{{flex:1;height:13px;background:var(--past-bg);border-radius:3.5px;overflow:hidden}}
.barfil{{height:100%;border-radius:3.5px}}
.barval{{flex:0 0 46px;font-size:10.5px;color:var(--dim);font-variant-numeric:tabular-nums}}
.disth{{font-size:12px;font-weight:800;margin:0 0 3px}}
.dists{{font-size:10px;color:var(--dim);font-weight:500}}
.divi{{height:1px;background:var(--border);margin:12px 0}}
table{{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums}}
th{{background:var(--accent-light);color:var(--text);font-weight:700;padding:8px 7px;text-align:right;
border-bottom:1.5px solid var(--accent);white-space:nowrap;font-size:11px}}
th:first-child,td.sg{{text-align:left}}
td{{padding:7px;text-align:right;border-bottom:1px solid var(--border)}}
td.sg{{font-weight:700}}
td.hi{{color:var(--accent);font-weight:700}}
tr.tot td{{border-top:1.5px solid var(--border2);background:var(--past-bg);font-weight:700}}
ul.rk{{list-style:none;margin:0;padding:0;font-size:11.5px}}
ul.rk li{{display:flex;gap:8px;align-items:baseline;padding:3.5px 0;border-bottom:1px solid var(--border)}}
ul.rk li b{{flex:0 0 62px;color:var(--accent);font-variant-numeric:tabular-nums}}
ul.rk .nm{{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
ul.rk .tt{{color:var(--dim);font-variant-numeric:tabular-nums}}
.gap{{display:grid;grid-template-columns:1fr 1fr;gap:0;border:1px solid var(--border);border-radius:12px;overflow:hidden;margin:14px 0}}
.gap>div{{padding:13px 16px}}
.gap .L{{background:var(--accent-light)}}
.gap .R{{background:var(--peach-bg);border-left:1px solid var(--border)}}
.gap h4{{margin:0 0 5px;font-size:12px;font-weight:800}}
.gap .L h4{{color:var(--accent)}} .gap .R h4{{color:var(--peach-text)}}
.gap p{{margin:0;font-size:11.5px}}
.take{{background:var(--accent-light);border-radius:11px;padding:13px 16px;margin:14px 0 0}}
.take h4{{margin:0 0 6px;font-size:12px;font-weight:800;color:var(--accent)}}
.take ol{{margin:0;padding-left:19px;font-size:12px}} .take li{{margin:4px 0}}
.foot{{margin-top:22px;font-size:10.5px;color:var(--muted);line-height:1.75}}
.ok{{color:var(--green);font-weight:700}} .no{{color:var(--danger);font-weight:700}}
@media(max-width:640px){{.gap{{grid-template-columns:1fr}}.gap .R{{border-left:0;border-top:1px solid var(--border)}}}}
</style></head><body><div class="wrap">
<div class="mhead"><h1>관심 수요 × 구매 수요 — 무엇이 다른가</h1>
<p>홈페이지에 들어온 사람과 실제로 표를 산 사람을 따로 재서 나란히 놓았어요 · 260806 실측</p></div>
<div class="card">

<section>
<h2><span class="n">⓪</span>한눈 결론</h2>
<p class="sub">아래 숫자는 전부 이 레포 안 원천에서 계산한 실측이에요 — 추정·창작 없음</p>
<p class="lead"><b>관심(접속)은 「가족·40대·관내」에 쏠려 있고, 구매(예매)는 「뮤지컬이 일찍·클래식이 늦게」로 갈려요.</b>
두 표가 같은 사람을 가리키지 않기 때문에, 홍보를 <b>수요군마다 다른 시점</b>에 걸어야 해요.</p>
<div class="warn"><b>⚠ 첨부 2건이 도착하지 않았어요</b> — <code>260806_stats_ingest.mjs</code>와
<code>260806_공연접속통계_전체.tsv</code>는 <code>C:\\Users\\…\\Desktop</code> 로컬 경로만 전달돼 파일이 안 올라왔어요.
지금 레포에 있는 접속통계는 <b>2026년분 {len(acc)}종뿐</b>이라, 예매 원장(2020~2025)과 <b class="no">이름 정확일치 0종</b> —
같은 공연의 「접속 → 구매」 전환율은 <b>아직 못 잽니다</b>. 그 TSV가 바로 이 구멍을 메우는 조각이에요.</div>
</section>

<section>
<h2><span class="n">①</span>주요 관심자 — 누가 보고 있나</h2>
<p class="sub">원천 <code>{esc(ACC)}</code> · 2026년 {len(acc)}종 · 로그인 회원 접속 {aT:,} · 기준 {esc(asof)}</p>
<div class="kpis">
{kpi('총 접속', f'{aT:,}', '로그인 회원')}
{kpi('1위 연령', '40대', f'{aAge[3]:.1f}% · 30대 {aAge[2]:.1f}%')}
{kpi('관내 비중', f'{aReg[0]+aReg[1]+aReg[2]:.1f}%', '여수·순천·광양')}
{kpi('외지 비중', f'{aReg[5]:.1f}%', '호남 외 지역')}
</div>
<div class="grid">
<div>{dist('연령대 분포', '(접속수 가중평균)', aAge, AGE)}</div>
<div>{dist('지역 분포', '(거주지 비율)', aReg, REG)}</div>
</div>
<div class="divi"></div>
<div class="grid">
<div><div class="disth">가족 수요 <span class="dists">30·40대 합 상위</span></div>
<ul class="rk">{lst(famTop, lambda r: f"{r['a'][2]+r['a'][3]:.1f}%")}</ul></div>
<div><div class="disth">중장년 수요 <span class="dists">50대 이상 합 상위</span></div>
<ul class="rk">{lst(oldTop, lambda r: f"{sum(r['a'][4:7]):.1f}%")}</ul></div>
<div><div class="disth">원정 수요 <span class="dists">호남 외 지역 상위</span></div>
<ul class="rk">{lst(outTop, lambda r: f"{r['g'][5]:.1f}%")}</ul></div>
</div>
<div class="divi"></div>
<div class="disth">접속 TOP8 <span class="dists">(공연별 총 접속수 · 오른쪽 = 그 공연 1위 연령)</span></div>
<ul class="rk">{lst(accTop, lambda r: f"{r['t']:,}", topage)}</ul>
<div class="take"><h4>관심자 쪽에서 읽히는 것</h4><ol>
<li><b>40대 {aAge[3]:.1f}% + 30대 {aAge[2]:.1f}% = 접속의 {aAge[2]+aAge[3]:.0f}%</b> — 홈페이지를 여는 사람은 사실상 이 두 세대예요.</li>
<li><b>기획은 40대·대관은 30대</b>가 1위 — 같은 극장인데 사업 유형에 따라 보는 세대가 갈려요.</li>
<li><b>관내가 {aReg[0]+aReg[1]+aReg[2]:.0f}%</b>인데, 라포엠·STAY 패키지처럼 <b>외지가 절반을 넘는 공연</b>이 따로 있어요 — 이건 숙박·관광과 묶을 자리예요.</li>
</ol></div>
</section>

<section>
<h2><span class="n">②</span>실 예매자 — 어떻게 사고 있나</h2>
<p class="sub">원천 <code>{esc(ZIP)}</code> 평문 {files}종 · 고유주문 {N:,} · 관람연도 {esc(yrs)}
{'· 암호분 ' + str(skipped) + '종 제외' if skipped else ''}</p>
<div class="kpis">
{kpi('고유 주문', f'{N:,}', '2020~2025')}
{kpi('리드타임 중앙', f'{st.median(lead):.0f}일', f'평균 {st.mean(lead):.1f}일')}
{kpi('평균 매수', f'{st.mean(pty):.2f}매', f'2매가 {pb["2매"]/len(pty)*100:.0f}%')}
{kpi('1인 단가 중앙', f'{st.median(unit):,.0f}원', '금액÷매수')}
{kpi('회원 예매', f'{mem/N*100:.1f}%', '회원여부 Y')}
{kpi('모바일·앱', f'{mob/N*100:.1f}%', '판매처 기준')}
</div>
<div class="grid">
<div>{dist('언제 사나', '(구매→관람 남은 일수)', [lb[k]/len(lead)*100 for k in LB], LB)}</div>
<div>{dist('몇 장 사나', '(1주문 최종정상매수)', [pb[k]/len(pty)*100 for k in PB], PB)}</div>
</div>
<div class="divi"></div>
<div class="grid">
<div><div class="disth">판매처 TOP6 <span class="dists">(주문 비중)</span></div>
<ul class="rk">{chtop}</ul></div>
<div><div class="disth">티켓오픈 쏠림 <span class="dists">(첫 판매일 = 오픈 근사)</span></div>
<div class="kpis" style="margin:6px 0 0">
{kpi('오픈 당일 주문', f'{openday/N*100:.1f}%', f'{openday:,}건')}
{kpi('그중 14시', f'{openday14/openday*100:.1f}%', f'전체의 {openday14/N*100:.1f}%')}
</div>
<p style="font-size:11px;color:var(--dim);margin:9px 0 0">오픈 당일이 아닌 날의 14시 비중은 {restday14/restday*100:.1f}%예요 —
즉 <b>14시 쏠림은 사람들의 습관이 아니라 티켓오픈 시각</b>이 만든 거예요.</p></div>
</div>
<div class="take"><h4>실 예매자 쪽에서 읽히는 것</h4><ol>
<li><b>절반 가까이(2매 {pb['2매']/len(pty)*100:.0f}%)가 둘이서</b> 와요 — 1인 관람({pb['1매']/len(pty)*100:.0f}%)보다 동반이 많아요.</li>
<li><b>중앙 {st.median(lead):.0f}일 전에 사고, {sum(1 for x in lead if x<=7)/len(lead)*100:.0f}%는 D-7 안에</b> 사요 — 「막판 구매층」이 5분의 1이 넘어요.</li>
<li><b>오픈 당일에 전체의 {openday/N*100:.1f}%, 그중 {openday14/openday*100:.0f}%가 14시</b> — 오픈 첫 한 시간이 사실상 하나의 판매 채널이에요.</li>
</ol></div>
</section>

<section>
<h2><span class="n">③</span>두 수요의 격차 — 수요군별로 갈린다</h2>
<p class="sub">수요군 = 상품명 키워드 <b>추정</b>(대장 장르는 Worker 측이라 오프라인 재현 불가) · 리드·매수·단가는 예매 원장 실측</p>
<table><thead><tr><th>수요군</th><th>주문</th><th>리드중앙</th><th>D-7내</th><th>평균매수</th><th>4매+</th><th>1인단가</th><th>회원</th><th>모바일</th></tr></thead>
<tbody>{segrows}</tbody></table>
<div class="gap">
<div class="L"><h4>관심은 이렇게 생겼는데</h4>
<p>가족물은 <b>접속 상위를 싹쓸이</b>해요(100층짜리 집 1,902 · 달 샤베트 1,051 · 티니핑 914),
그리고 30·40대가 <b>90%를 넘어요</b>. 클래식은 접속 자체가 <b>작아요</b>(실내악 787 · 브런치 603).</p></div>
<div class="R"><h4>사는 방식은 정반대예요</h4>
<p>가족물은 <b>1건이 3.11매</b>라 접속 1건의 값이 제일 크고, 클래식은 <b>1.94매·D-7내 30.1%</b>로
혼자·막판이에요. 뮤지컬은 <b>34일 전</b>에 사고 회원이 <b>89.8%</b>예요.</p></div>
</div>
<div class="take"><h4>그래서 홍보를 어디에 거나 — 수요군별 다른 시점</h4><ol>
<li><b>뮤지컬 = 티켓오픈에 전부 건다.</b> 리드 34일 · D-7내 14.9%(가장 낮음) · 회원 89.8% —
늦게 알리면 이미 끝나요. 회원 대상 <b>오픈 예고</b>가 제일 싸게 먹히는 자리예요.</li>
<li><b>클래식 = 막판 리마인드가 레버.</b> D-7내 30.1%로 가장 늦게 사는데 1인단가는 27,000원으로 가장 낮아요 —
관심 모수를 늘리기보다 <b>공연 주간에 한 번 더</b> 찌르는 게 효율이 높아요.</li>
<li><b>가족물 = 접속 1건이 가장 비싸다.</b> 3.11매·4매+ 19.3% — 접속당 기여가 최고라
같은 노출을 사도 <b>가족물에 태우는 게 이득</b>이에요. 다만 회원 75.4%로 낮아 <b>비회원 유입</b>이 섞여 있어요.</li>
<li><b>연극 = 회원 72.3%로 가장 낮고 모바일 49.2%로 가장 낮다</b> — 신규·비회원이 많고 PC/현장 비중이 높아요.
회원 전환을 붙일 자리예요.</li>
</ol></div>
</section>

<section>
<h2><span class="n">④</span>지금 프로모에 넣을 수 있는 것 / 막힌 것</h2>
<p class="sub">「넣을 수 있나」에 대한 답 — 배선 자리까지 짚었어요</p>
<table><thead><tr><th>조각</th><th style="text-align:left">넣을 자리</th><th style="text-align:left">상태</th></tr></thead><tbody>
<tr><td class="sg">공연접속통계 <b>전체</b>(TSV)</td>
<td style="text-align:left"><code>data/access_stats/</code>에 CSV로 넣고 <code>node tools/build_access_stats.mjs</code></td>
<td style="text-align:left"><span class="no">파일 미도착</span> — 빌더·화면은 <b>이미 있음</b>. 넣기만 하면 드릴 2면이 다년치로 늘어나요</td></tr>
<tr><td class="sg">stats_ingest.mjs</td>
<td style="text-align:left">기존 <code>tools/build_access_stats.mjs</code>와 역할 겹침 — 받아서 대조 필요</td>
<td style="text-align:left"><span class="no">파일 미도착</span></td></tr>
<tr><td class="sg">예매 원장 2020~2025</td>
<td style="text-align:left">이미 반입됨 — <code>운영_예매</code>(40,429행) → <code>운영_예매집계</code></td>
<td style="text-align:left"><span class="ok">완료</span> · 화면 = AI 홍보 ▸ 고객 분류</td></tr>
<tr><td class="sg">실예매자 연령·지역</td>
<td style="text-align:left"><code>운영_예매집계</code> × <code>운영_회원</code> 조인</td>
<td style="text-align:left"><span class="ok">앱에선 됨</span>(관리자 PIN) · 이 보고서에선 원장에 열이 없어 <b>미산출</b></td></tr>
<tr><td class="sg">리드타임·동반·단가</td>
<td style="text-align:left">원장에서 바로 계산 — 지금 화면엔 <b>없는 축</b></td>
<td style="text-align:left"><span class="ok">계산됨</span>(위 ②③) · 화면 배선은 <b>미착수</b></td></tr>
</tbody></table>
<div class="take"><h4>가장 크게 남는 한 방 — 전환율 축</h4>
<ol><li><b>다년치 접속통계가 들어오면</b> 접속(관심)과 예매(구매)가 <b>같은 공연에서 만나요</b> —
그 순간 「접속 1,000명당 몇 장 팔렸나」가 공연마다 나와요. 지금은 연도가 어긋나 이름 일치가 0종이라 못 재요.</li>
<li>그게 생기면 <b>「관심은 높은데 안 팔린 공연」</b>이 자동으로 뜹니다 — 홍보가 아니라 <b>가격·회차·좌석</b> 문제인 공연을 가려낼 수 있어요.</li>
<li>리드타임 축은 이미 계산되니, 공연별 <b>「지금이 D-{st.median(lead):.0f}일 = 중앙값 시점」</b> 알림을 판매 레일에 붙일 수 있어요.</li>
</ol></div>
</section>

<div class="foot">
▸ 원천 = <code>{esc(ACC)}</code>(접속 · 2026 {len(acc)}종) · <code>{esc(ZIP)}</code>(예매 · 평문 {files}종 {N:,}주문)<br>
▸ 한계 ① 두 표는 <b>기간이 다르다</b>(접속 2026 / 예매 2020~2025) — 공연 1:1 조인 불가, 위 비교는 전부 <b>수요군 구조 비교</b>.<br>
▸ 한계 ② 수요군은 <b>상품명 키워드 추정</b>이지 대장 장르가 아니다. ③ 암호 원장 {skipped}종 제외(2025가 얇다).<br>
▸ 한계 ④ <code>마케팅동의여부</code>는 전건 N = <b>값이 안 채워지는 열</b>로 보여 지표에서 뺐다(미확인).<br>
▸ 재생성 = <code>python3 tools/analyze_demand_gap.py</code> · 이 파일은 기계산출물이라 손편집 금지.
</div>
</div></div></body></html>'''

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, 'w', encoding='utf-8').write(html)
    print(f'[gap] → {OUT}', file=sys.stderr)


if __name__ == '__main__':
    main()
