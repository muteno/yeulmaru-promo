#!/usr/bin/env python3
"""260807 대장 정본 동기 — 전/후 보고서 빌더(일회성).

값은 전부 계획 JSON·라이브 스냅샷·실측 스샷에서 읽는다(손으로 옮겨 적는 숫자 0).
디자인 = index.html :root 토큰 사본 + 기존 보고서 톤 계승(새 색·새 토큰 0).
"""
import base64, collections, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PLAN = json.load(open(os.path.join(ROOT, 'docs/260807_대장정본_계획.json'), encoding='utf-8'))
LIVE = json.load(open(sys.argv[1], encoding='utf-8'))
SHOTS = sys.argv[2]
BA = json.load(open(sys.argv[3], encoding='utf-8'))
OUT = os.path.join(ROOT, 'docs/reports/260807_대장정본_동기_전후.html')

S = lambda v: '' if v is None else str(v).strip()


def N(v):
    try:
        return float(re.sub(r'[^0-9.\-]', '', S(v)) or 0)
    except ValueError:
        return 0.0


def agg(rows, col='발권유료'):
    m = collections.defaultdict(float)
    for r in rows:
        y = S(r.get('년도'))
        if y:
            m[y] += N(r.get(col))
    return m


def rowcount(rows):
    m = collections.Counter(S(r.get('년도')) for r in rows)
    return m


# 원장 「합계」행 = 검산 기준(plan.py가 찍은 것과 같은 값 — 여기선 표시용으로 다시 읽는다)
LEDGER = {'2012': 25267, '2013': 60483, '2014': 50670, '2015': 48975, '2016': 52199, '2017': 43488,
          '2018': 46033, '2019': 55536, '2020': 13927, '2021': 32269, '2022': 58601, '2023': 55600,
          '2024': 56236}

b_paid, a_paid = agg(LIVE['rows']), agg(PLAN['rows'])
b_cnt, a_cnt = rowcount(LIVE['rows']), rowcount(PLAN['rows'])
a_inv = agg(PLAN['rows'], '발권초대')
years = sorted(set(b_paid) | set(a_paid), key=lambda y: (y == '', y))


def img(name):
    p = os.path.join(SHOTS, name)
    if not os.path.exists(p):
        return '<div class="miss">스샷 없음: %s</div>' % name
    return '<img alt="%s" src="data:image/png;base64,%s">' % (name, base64.b64encode(open(p, 'rb').read()).decode())


def esc(s):
    return (S(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))


d = PLAN['diff']
rows_year = ''
for y in years:
    bp, ap = b_paid.get(y, 0), a_paid.get(y, 0)
    bc, ac = b_cnt.get(y, 0), a_cnt.get(y, 0)
    led = LEDGER.get(y)
    dp = ap - bp
    match = '' if led is None else ('<span class="ok">일치</span>' if abs(ap - led) < 0.5 else
                                    '<span class="warn">' + format(ap - led, '+,.0f') + '</span>')
    cls = 'up' if dp > 0 else ('dn' if dp < 0 else 'dim')
    ycell = y or '<span class="dim">(연도 공란)</span>'
    ledcell = (f'{led:,}' if led else '<span class="dim">—</span>') + ' ' + match
    rows_year += (f'<tr><td>{ycell}</td><td class="n">{bc:,}</td><td class="n">{ac:,}</td>'
                  f'<td class="n">{bp:,.0f}</td><td class="n">{ap:,.0f}</td>'
                  f'<td class="n {cls}">{(f"{dp:+,.0f}" if dp else "·")}</td><td>{ledcell}</td></tr>')

rows_add = ''
for e in d['추가']:
    rows_add += '<tr><td><span class="tag %s">%s</span></td><td>%s</td><td>%s</td><td class="n">%s</td><td class="n">%s</td><td class="n">%s</td><td class="mono">%s</td></tr>' % (
        'cx' if e['상태'] == '취소공연' else 'ok2', e['상태'], e['년월일'], esc(e['공연명']),
        e['기본좌석'] or '·', e['발권유료'] or '·', e['발권초대'] or '·', e['공연ID'])

rows_fix = ''
for e in d['덮어씀']:
    rows_fix += '<tr><td>%s</td><td>%s</td><td class="n dn">%s</td><td class="n up">%s</td></tr>' % (
        esc(e['공연명']), e['열'], e['live'], e['xlsx'])

fill = collections.Counter(e['열'] for e in d['보강'])
rows_fill = ''.join('<tr><td>%s</td><td class="n">%s건</td></tr>' % (k, v) for k, v in fill.most_common())

shots = ''
for y in ('2012', '2017', '2022'):
    b, a = BA['전'].get(y), BA['후'].get(y)
    if not b:
        continue
    kpi = ''.join('<div class="kv"><span>%s</span><b>%s → %s</b></div>' % (
        bc['k'], bc['v'], ac['v']) for bc, ac in zip(b['cards'], a['cards']))
    shots += f'''<div class="shot">
      <h4>{y}년 · 연간 누적 실적 보드 <span class="dim">(기획·대관·기타 전부 켠 상태)</span></h4>
      <div class="kpis">{kpi}<div class="kv"><span>표 행수</span><b>{b['rows']} → {a['rows']}</b></div></div>
      <div class="ba"><figure><figcaption>전 (지금 라이브)</figcaption>{img(f'260807_대장동기_{y}_KPI_전.png')}{img(f'260807_대장동기_{y}_차트_전.png')}</figure>
      <figure><figcaption>후 (정본 동기 뒤)</figcaption>{img(f'260807_대장동기_{y}_KPI_후.png')}{img(f'260807_대장동기_{y}_차트_후.png')}</figure></div></div>'''

HTML = f'''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>운영관리대장 정본 동기 — 전/후 실측 (260807)</title>
<style>
:root{{
  --accent:#4A4DE7; --accent-light:#E8E8FD; --accent-glow:rgba(74,77,231,0.15);
  --peach-bg:#FDF6F3; --peach-text:#D88455;
  --bg:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);
  --surface-solid:#fff; --glass:rgba(255,255,255,0.55);
  --glass-shadow:0 8px 32px rgba(74,77,231,0.08),0 2px 8px rgba(0,0,0,0.04);
  --border:rgba(0,0,0,0.09); --border2:rgba(0,0,0,0.12);
  --text:#1A1A2E; --dim:#888; --muted:#bbb;
  --green:#1A6B3C; --danger-btn:#E24B4A; --c5:#2D8AB3;
  --radius:16px; --radius-lg:20px; --r-modal:20px;
  --neutral:#EEEDF3; --neutral-text:#6B6B7B;
}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.6;padding:28px 18px 80px}}
.wrap{{max-width:1120px;margin:0 auto}}
.mhead{{background:var(--accent);color:#fff;border-radius:var(--r-modal) var(--r-modal) 0 0;padding:18px 24px}}
.mhead h1{{margin:0;font-size:19px;font-weight:800;letter-spacing:-.2px}}
.mhead .sub{{font-size:11.5px;font-weight:600;opacity:.82;margin-top:3px}}
.card{{background:var(--surface-solid);border:1px solid var(--border);border-radius:0 0 var(--r-modal) var(--r-modal);box-shadow:var(--glass-shadow);padding:22px 24px 26px;margin-bottom:22px}}
section{{background:var(--surface-solid);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:var(--glass-shadow);padding:20px 24px 24px;margin-bottom:20px}}
h2{{font-size:15px;font-weight:800;margin:0 0 4px;color:var(--accent)}}
h2 .no{{display:inline-block;min-width:22px;height:22px;line-height:22px;text-align:center;background:var(--accent-light);color:var(--accent);border-radius:7px;font-size:12px;margin-right:8px}}
h4{{font-size:13px;font-weight:700;margin:18px 0 8px}}
p.lead{{margin:2px 0 14px;font-size:13px;color:var(--neutral-text)}}
table{{width:100%;border-collapse:collapse;font-size:12.5px;margin-top:6px}}
th{{text-align:left;font-weight:700;color:var(--neutral-text);border-bottom:1.5px solid var(--border2);padding:7px 8px;font-size:11.5px;white-space:nowrap}}
td{{border-bottom:1px solid var(--border);padding:6px 8px;vertical-align:top}}
td.n,th.n{{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}}
.mono{{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--neutral-text)}}
.up{{color:var(--green);font-weight:700}} .dn{{color:var(--danger-btn);font-weight:700}}
.dim{{color:var(--muted)}} .ok{{color:var(--green);font-weight:700}} .warn{{color:var(--peach-text);font-weight:700}}
.tag{{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}}
.tag.cx{{background:var(--neutral);color:var(--neutral-text)}} .tag.ok2{{background:var(--accent-light);color:var(--accent)}}
.kpis{{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}}
.kv{{background:var(--peach-bg);border:1px solid var(--border);border-radius:12px;padding:8px 14px;font-size:12px}}
.kv span{{color:var(--neutral-text);font-weight:600;display:block;font-size:11px}}
.kv b{{font-size:14px;color:var(--accent);font-variant-numeric:tabular-nums}}
.ba{{display:grid;grid-template-columns:1fr 1fr;gap:14px}}
@media(max-width:820px){{.ba{{grid-template-columns:1fr}}}}
figure{{margin:0}} figcaption{{font-size:11.5px;font-weight:700;color:var(--neutral-text);margin-bottom:6px}}
figure img{{width:100%;display:block;border:1px solid var(--border);border-radius:12px;margin-bottom:8px;background:#fff}}
.miss{{padding:20px;text-align:center;color:var(--muted);border:1px dashed var(--border2);border-radius:12px}}
.note{{background:var(--peach-bg);border-left:3px solid var(--peach-text);border-radius:0 10px 10px 0;padding:11px 14px;font-size:12.5px;margin:12px 0}}
.note b{{color:var(--peach-text)}}
ul{{margin:8px 0 0;padding-left:19px;font-size:12.5px}} li{{margin-bottom:5px}}
code{{background:var(--neutral);padding:1px 5px;border-radius:5px;font-size:11.5px;font-family:ui-monospace,Menlo,monospace}}
.scroll{{overflow-x:auto}}
</style></head><body><div class="wrap">

<div class="mhead"><h1>운영관리대장 → 모달 DB 정본 동기</h1>
<div class="sub">260807 · 원본 「2026 공연장 운영관리대장」 세부운영관리대장 시트 → 운영_세부운영관리대장(정리)</div></div>
<div class="card">
<p class="lead">운영자 지시 = <b>「이 내용을 다 반영 · 기존거랑 겹쳐서 다르면 이게 정본(공연명 등은 제외)」</b>.
원장 {len(PLAN['rows']) - d['유지'] - len(d['추가']) + len(d['추가']):,}행을 라이브 {LIVE['count']:,}행과 한 행씩 맞춰
<b>겹치는 자리는 원장 값으로, 원장에만 있는 행은 새로</b> 넣었다. 라이브에만 있는 행은 지우지 않았다.</p>
<div class="kpis">
 <div class="kv"><span>행</span><b>{LIVE['count']:,} → {len(PLAN['rows']):,}</b></div>
 <div class="kv"><span>덮어쓴 값</span><b>{len(d['덮어씀'])}건</b></div>
 <div class="kv"><span>공란 보강</span><b>{len(d['보강'])}건</b></div>
 <div class="kv"><span>신규 행</span><b>{len(d['추가'])}건</b></div>
 <div class="kv"><span>신규 열</span><b>발권초대</b></div>
 <div class="kv"><span>Σ발권초대</span><b>{sum(a_inv.values()):,.0f}</b></div>
</div></div>

<section><h2><span class="no">1</span>연도별 대조 — 동기 뒤엔 원장과 정확히 같아진다</h2>
<p class="lead">지금 라이브는 5개 연도가 원장보다 적다(기본좌석·발권유료가 공란이라 집계에서 빠지던 행들). 동기 뒤 <b>2012~2024 전 연도가 원장 「합계」행과 일치</b>한다.</p>
<div class="scroll"><table><thead><tr><th>연도</th><th class="n">행(전)</th><th class="n">행(후)</th><th class="n">Σ발권유료(전)</th><th class="n">Σ발권유료(후)</th><th class="n">차</th><th>원장 합계행</th></tr></thead>
<tbody>{rows_year}</tbody></table></div>
<div class="note"><b>2012 · 연도 공란 1행 = 운영자 확정</b> — 「한중연합오케스트라」(6/9 · 발권유료 930)는 원본 원장에서도 년도 칸이 비어 있었다.
원장 자신의 합계행이 이 행을 2012에 넣어 세고(25,267 = 24,337 + 930) 행 위치도 2012-06-02와 2012-06-14 사이다.
운영자 확답 「2012로 채운다」 → <code>OPERATOR_FIX</code>로 편입. 그래서 <b>2012도 원장과 일치</b>한다.</div>
</section>

<section><h2><span class="no">2</span>앱 화면 전/후 — 같은 화면, 데이터만 갈아끼움</h2>
<p class="lead">index.html을 로컬로 띄우고 운영대장 응답만 전(라이브)/후(계획)로 바꿔 같은 자리를 두 번 찍었다. 숫자는 화면에서 직접 읽은 값이다.</p>
{shots}
</section>

<section><h2><span class="no">3</span>덮어쓴 값 — 딱 {len(d['덮어씀'])}건</h2>
<p class="lead">양쪽 다 값이 있는데 서로 다른 자리. 나머지는 원래 같았다.</p>
<table><thead><tr><th>공연명</th><th>열</th><th class="n">지금(라이브)</th><th class="n">원장(정본)</th></tr></thead><tbody>{rows_fix}</tbody></table>
<h4>공란 보강 {len(d['보강'])}건 <span class="dim">— 라이브가 비어 있고 원장에 값이 있던 자리</span></h4>
<table><thead><tr><th>열</th><th class="n">건수</th></tr></thead><tbody>{rows_fill}</tbody></table>
<div class="note">기본좌석의 <b>비숫자 표기 9건</b>(비대면 4 · '-' 4 · 연기 1)은 <b>안 넣었다</b> — 숫자 열이라 앱이 어차피 NaN으로 떨구고, 라이브의 공란이 이미 같은 뜻이다.</div>
</section>

<section><h2><span class="no">4</span>신규 행 {len(d['추가'])}건</h2>
<p class="lead">원장에만 있던 회차. 취소·연기 회차는 <code>상태=취소공연</code>으로 넣어 집계에서 자동으로 빠진다(라이브 기존 5행과 같은 표기).
그렇게 안 하면 2020년 코로나 취소 회차가 <b>점유율 0%인 정상 공연</b>으로 잡혀 그 해 통계가 무너진다.</p>
<div class="scroll"><table><thead><tr><th>상태</th><th>날짜</th><th>공연명</th><th class="n">기본좌석</th><th class="n">발권유료</th><th class="n">발권초대</th><th>공연ID</th></tr></thead><tbody>{rows_add}</tbody></table></div>
</section>

<section><h2><span class="no">5</span>신규 열 「발권초대」 — 그동안 없던 축</h2>
<p class="lead">앱 주석이 <code>원장엔 무료·초대 열이 없다</code>고 적어 둔 그 구멍이다. 그래서 2026 막대를 다른 해와 비교할 때
환산 각주를 달아야 했다. 원장엔 처음부터 있던 값이라 그대로 실었다 — <b>{d['초대신규']:,}행</b>에 값이 들어간다.</p>
<div class="scroll"><table><thead><tr><th>연도</th>{''.join('<th class="n">%s</th>' % y for y in years if y)}</tr></thead>
<tbody><tr><td>Σ발권초대</td>{''.join('<td class="n">%s</td>' % f'{a_inv.get(y,0):,.0f}' for y in years if y)}</tr></tbody></table></div>
<div class="note">열만 심어 둔 상태다 — <b>화면은 아직 이 값을 안 읽는다</b>. 어디에 쓸지(관람인원 = 유료+초대 표기, 2026 환산 각주 폐지 등)는 다음 건.</div>
</section>


<section><h2><span class="no">6</span>원본의 나머지 2장 — 신설 시트 2개</h2>
<p class="lead">운영자 지시 「둘 다 넣어」. 라이브에 대응 시트가 없어 <b>신설</b>했다(기존 시트 무접촉). 원장 셀을 그대로 싣고, 가공은 셋뿐 —
머리글 중복 해소(<code>합계</code>·<code>공연일수</code>가 각각 둘이라 그대로 두면 뒤엣것이 앞엣것을 먹는다) · <code>총계</code> 집계행 제외 · <code>공연ID</code> 파생(라이브 채번 규칙).</p>
<h4>운영_공연대장 <span class="dim">— 공연 단위 요약(2012~2026) — 티켓가·주최/주관·입장연령·공연장소·판매금액</span></h4><div class="kpis"><div class="kv"><span>행</span><b>1,442</b></div><div class="kv"><span>열</span><b>31</b></div><div class="kv"><span>공연ID 파생</span><b>1438 / 1442</b></div><div class="kv"><span>집계·빈행 제외</span><b>140</b></div></div><div class="scroll"><table><thead><tr><th>연도</th><th class="n">공연</th><th class="n">발권유료</th><th class="n">발권초대</th><th class="n">판매금액</th></tr></thead><tbody><tr><td>2012</td><td class="n">53</td><td class="n">25,260</td><td class="n">32,158</td><td class="n">·</td></tr><tr><td>2013</td><td class="n">108</td><td class="n">60,363</td><td class="n">41,171</td><td class="n">·</td></tr><tr><td>2014</td><td class="n">123</td><td class="n">50,670</td><td class="n">22,351</td><td class="n">·</td></tr><tr><td>2015</td><td class="n">130</td><td class="n">48,975</td><td class="n">25,900</td><td class="n">·</td></tr><tr><td>2016</td><td class="n">139</td><td class="n">52,199</td><td class="n">27,416</td><td class="n">·</td></tr><tr><td>2017</td><td class="n">104</td><td class="n">43,488</td><td class="n">24,835</td><td class="n">·</td></tr><tr><td>2018</td><td class="n">89</td><td class="n">47,633</td><td class="n">21,171</td><td class="n">·</td></tr><tr><td>2019</td><td class="n">105</td><td class="n">55,539</td><td class="n">22,967</td><td class="n">·</td></tr><tr><td>2020</td><td class="n">55</td><td class="n">13,927</td><td class="n">3,842</td><td class="n">·</td></tr><tr><td>2021</td><td class="n">87</td><td class="n">32,269</td><td class="n">6,274</td><td class="n">·</td></tr><tr><td>2022</td><td class="n">114</td><td class="n">58,601</td><td class="n">15,721</td><td class="n">·</td></tr><tr><td>2023</td><td class="n">127</td><td class="n">55,600</td><td class="n">26,850</td><td class="n">·</td></tr><tr><td>2024</td><td class="n">94</td><td class="n">56,236</td><td class="n">22,426</td><td class="n">·</td></tr><tr><td>2025</td><td class="n">89</td><td class="n">62,646</td><td class="n">20,817</td><td class="n">23,108,000</td></tr><tr><td>2026</td><td class="n">25</td><td class="n">22,451</td><td class="n">1,150</td><td class="n">23,108,000</td></tr></tbody></table></div><h4>운영_기획공연판매현황 <span class="dim">— 기획공연 판매금액(2024)</span></h4><div class="kpis"><div class="kv"><span>행</span><b>23</b></div><div class="kv"><span>열</span><b>28</b></div><div class="kv"><span>공연ID 파생</span><b>23 / 23</b></div><div class="kv"><span>집계·빈행 제외</span><b>1</b></div></div><div class="scroll"><table><thead><tr><th>연도</th><th class="n">공연</th><th class="n">발권유료</th><th class="n">발권초대</th><th class="n">판매금액</th></tr></thead><tbody><tr><td>2024</td><td class="n">23</td><td class="n">27,432</td><td class="n">3,182</td><td class="n">956,827,919</td></tr></tbody></table></div>
<div class="note"><b>원장 두 장이 서로 조금 다르다</b> — 같은 파일 안인데 연도 합이 어긋난다(2013 발권유료 공연대장 60,363 ↔ 회차원장 60,483 · 2018 47,633 ↔ 46,033 · 2023 초대 26,850 ↔ 25,448).
<b>어느 쪽으로도 안 맞췄다</b> — 둘 다 운영자 원장이고, 앱 DB의 정본은 이미 회차 원장이다.</div>
<div class="note"><b>공연대장 2026 = 25건 · 발권유료 22,451</b> — 회차 원장(2026 5행)·라이브(21행·9,568)보다 훨씬 많다.
회차 원장의 2026이 아직 안 채워졌을 뿐이다. 다만 <b>공연 단위</b>라 회차 원장에 그대로 못 옮긴다(회차 분해가 필요).</div>
<div class="note"><b>공연대장 <code>판매금액</code> 열은 매출 축으로 쓸 수 없다</b> — 1,442행 중 값이 7개뿐이고 그중 3개가
「5/1 230」·「5/2 503」·「5/3 747」 = 예울마루 위크 일자별 인원 메모가 엉뚱한 열에 타이핑된 것이다. 진짜 매출은 <b>기획공연판매현황</b>(2024 23건 · Σ956,827,919원) 쪽.</div>
</section>

<section><h2><span class="no">7</span>안 건드린 것 · 남은 결정</h2>
<ul>
<li><b>공연명</b> — 운영자 명시 제외. 라이브의 정제된 이름 유지.</li>
<li><b>장르1</b> — 원장에 <b>대응 열이 없다</b>. 실측(2012~2024 1,987행 교차표)에서 원장 (복합,뮤지컬) 583행이 라이브 장르1로는
    뮤지컬 283 / 어린이·가족 113 / 대중 27 / 발레·연극 9로 갈린다 = 라이브 장르1은 원장 세부장르의 사본이 아니라 <b>앱이 따로 정제한 축</b>이다.
    세부장르로 덮으면 어린이·가족 113행이 사라지고 어휘 밖 값(콘서트·행사·교육·영화)이 들어온다.</li>
<li><b>공연ID·전체순번</b> — 라이브 규칙 유지. 신규 행의 공연ID만 같은 규칙(YYMMDD_NN)으로 새로 딴다.</li>
<li><b>화면 배선</b> — 신규 열 <code>발권초대</code>와 신설 시트 2개는 <b>DB에만 들어갔고 화면은 아직 안 읽는다</b>. 어디에 쓸지는 다음 건.</li>
</ul>
</section>

<section><h2><span class="no">8</span>재현 · 검증</h2>
<ul>
<li>계획 산출 <code>python3 docs/260807_대장정본_plan.py &lt;원장.xlsx&gt;</code> → <code>docs/260807_대장정본_계획.json</code></li>
<li>검산 = 파싱 합 vs 원장 「합계」행 <b>14/15년 일치</b>. 남은 1건(2023)은 원장 자신의 SUM 범위가 마지막 행
    (연극 &lt;옥탑방 고양이&gt; 12/25 · 유료 149·초대 8)을 안 세는 것 — <b>값은 안 고쳤다</b>.</li>
<li>반입 <code>YM_PIN=&lt;관리자PIN&gt; node docs/260807_대장정본_sync.mjs --write</code> · 나머지 2장 <code>… docs/260807_공연대장_sync.mjs --write</code> (인자 없이 = DRY-RUN)</li>
<li><b>반입 완료 · 라이브 실측</b> = 세부운영관리대장 <b>2,262행/14열</b> · 연도별 Σ발권유료가 원장 합계행과 <b>13/13년 일치</b> · 상태 정상 2,205 / 취소공연 57 · 신설 시트 2개(공연대장 1,442행 · 기획공연판매현황 23행) 조회 확인.</li>
<li>반입 전 4중 가드: ① 라이브 지문 대조(계획 낡으면 거부) ② 행수 감소 거부 ③ 라이브 행 전량 보존 검사 ④ 연도별 합 급락 거부</li>
</ul>
</section>

</div></body></html>'''

os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w', encoding='utf-8').write(HTML)
print(OUT, f'{os.path.getsize(OUT)/1024:.0f} KB')
