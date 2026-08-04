#!/usr/bin/env node
// 260804 전/후 보고서 생성 — docs/reports 정본 서식(글래스 섹션 · .two 2열 · 태그 b/a) 계승.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const SP = process.argv[2], OUT = process.argv[3];
const img = p => 'data:image/jpeg;base64,' + readFileSync(p).toString('base64');
const B = f => img(join(SP, 'shot_before', f)), A = f => img(join(SP, 'shot_after', f));
const cB = JSON.parse(readFileSync(join(SP, 'curve_before.json'), 'utf8'));
const cA = JSON.parse(readFileSync(join(SP, 'curve_after.json'), 'utf8'));

// ── opacity 곡선 SVG(실측 표본 그대로) ───────────────────────────────
function curve(o, color) {
  const pts = o.rows.map(r => [r[0] - o.clicked, r[1]]).filter(r => r[0] >= 0 && r[0] <= 780);
  const X = t => 44 + (t / 780) * 486, Y = v => 150 - v * 116;
  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' ');
  const dots = pts.map(p => `<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3" fill="${color}"/>`).join('');
  return { d, dots, pts };
}
const gB = curve(cB, '#888'), gA = curve(cA, '#4A4DE7');
const axis = `
  <line x1="44" y1="150" x2="530" y2="150" stroke="rgba(0,0,0,.12)"/>
  <line x1="44" y1="34" x2="44" y2="150" stroke="rgba(0,0,0,.12)"/>
  ${[0, 200, 400, 600, 780].map(t => `<text x="${44 + (t / 780) * 486}" y="166" font-size="10" fill="#888" text-anchor="middle">${t}</text>`).join('')}
  <text x="287" y="182" font-size="10" fill="#888" text-anchor="middle">클릭 후 경과(ms)</text>
  <text x="38" y="38" font-size="10" fill="#888" text-anchor="end">1.0</text>
  <text x="38" y="154" font-size="10" fill="#888" text-anchor="end">0</text>
  <text x="14" y="98" font-size="10" fill="#888" text-anchor="middle" transform="rotate(-90 14 98)">내용 opacity</text>`;

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>260804 대시보드 하단 슬라이더 — 좌우 비율 고정 + 면 전환 디졸브 전/후</title>
<style>
:root{--accent:#4A4DE7;--accent-light:#E8E8FD;--peach-text:#D88455;--text:#1A1A2E;--dim:#888;--muted:#bbb;--border:rgba(0,0,0,.09);--radius:16px;--radius-lg:20px;--green:#1A6B3C;--danger:#E24B4A}
*{box-sizing:border-box}
body{margin:0;padding:32px 28px 60px;background:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);color:var(--text);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Malgun Gothic",sans-serif}
h1{font-size:22px;margin:0 0 6px;letter-spacing:-.02em}
.sub{color:var(--dim);font-size:13px;margin-bottom:26px;line-height:1.7}
section{background:rgba(255,255,255,.78);border:1px solid rgba(255,255,255,.7);border-radius:var(--radius-lg);box-shadow:0 8px 32px rgba(74,77,231,.08),0 2px 8px rgba(0,0,0,.04);padding:18px 20px 22px;margin-bottom:20px}
h2{font-size:15px;margin:0 0 6px;color:var(--accent);letter-spacing:-.01em}
h3{font-size:13px;margin:18px 0 8px;color:var(--text)}
p{font-size:12.5px;line-height:1.75;margin:0 0 10px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:900px){.two{grid-template-columns:1fr}}
figure{margin:0}
figcaption{font-size:12px;color:var(--text);line-height:1.6;margin-bottom:8px}
.tag{display:inline-block;font-size:11px;font-weight:800;border-radius:999px;padding:2px 9px;margin-right:7px;vertical-align:1px}
.tag.b{background:#EEEDF3;color:#6B6B7B}
.tag.a{background:var(--accent-light);color:var(--accent)}
img{width:100%;display:block;border:1px solid var(--border);border-radius:12px;background:#fff}
.guide{position:relative}
.guide::after{content:'';position:absolute;left:50%;top:0;bottom:0;width:1px;background:rgba(226,75,74,.75)}
.gcap{font-size:10.5px;color:var(--danger);margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;margin:6px 0 4px}
th,td{padding:7px 10px;border-bottom:1px solid var(--border);text-align:right}
th:first-child,td:first-child{text-align:left}
thead td,th{color:var(--dim);font-weight:700}
tbody tr:last-child td{border-bottom:none}
.ok{color:var(--green);font-weight:800}
.bad{color:var(--danger);font-weight:800}
.strip{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
@media(max-width:900px){.strip{grid-template-columns:repeat(2,1fr)}}
.strip figcaption{font-size:10.5px;color:var(--dim);margin:0 0 4px;text-align:center}
.note{background:#EEEDF3;border-left:3px solid var(--peach-text);border-radius:0 10px 10px 0;padding:10px 13px;font-size:12px;line-height:1.7;margin:12px 0 0}
code{font-size:11.5px;background:rgba(74,77,231,.06);border-radius:5px;padding:1px 5px}
</style></head><body>

<h1>260804 대시보드 하단 슬라이더 — ① 좌우 비율 고정 ② 면 전환 디졸브</h1>
<div class="sub">
운영자 지시 ①「전면 하단 슬라이더를 누르면 전체화면에선 상관없는데, 최대화면이 아닌 곳에서는 슬라이드가 왔다갔다 — 일정하게 유지되게 비율로 하던지」<br>
운영자 지시 ②「다음 페이지로 전환될 때는 번쩍이면서 바뀐다 — 최대한 자연스럽게 디졸빙. 내용이 차라리 없어도 디졸빙해서 넘어간 다음에 기다리게 하는 게 낫다」<br>
캡처·수치는 전부 헤드리스 크로미엄 실측(<code>?qa=admin</code> 목데이터). 대상 = <code>index.html</code> 대시보드 책 4면.
</div>

<section>
  <h2>① 하단 슬라이더 바가 면마다 좌우로 튀던 것 — 비율 고정</h2>
  <p><b>정체(실측).</b> 좌 열 <code>#main-area</code>는 flex 아이템인데 <code>min-width:auto</code>(기본)라 <b>내용의 min-content 밑으로 못 줄어든다</b>.
  1면 「전체 실적표」(연도 7열 + 누계)의 min-content가 자기 몫(50%)보다 넓어서 좌 열이 <b>42.5px 부풀고</b>,
  <code>flex-shrink:0</code>인 우 레일(50% 고정)을 그만큼 오른쪽으로 밀어 <b>문서가 가로로 넘쳤다</b>(1280 화면에 1322.5px).
  3·4면은 안 넘쳐 정확히 50:50 → <b>면마다 펼침 폭·중심이 달라진다</b> = 그 중심에 맞춰 미는 바가 왔다갔다.
  전체화면(1920·1600·1440)에선 1면도 50% 안에 들어가 스윙 0 → 「전체화면에선 상관없다」와 정확히 일치.</p>
  <p><b>조치.</b> <code>#app.biz-mode #main-area{min-width:0}</code> — 폭에 관계없이 <b>좌:우 = 1:1 비율</b>이 항상 성립.
  캘린더 모드(레일 숨김·전체 폭)는 손대지 않았다.</p>

  <table>
    <thead><tr><td>창 크기</td><td>전 — 바 중심 스윙(1·3·4면 왕복)</td><td>후 — 바 중심 스윙</td><td>전 — 문서 가로 넘침</td><td>후</td></tr></thead>
    <tbody>
      <tr><td>1280 × 760</td><td class="bad">21.2px</td><td class="ok">0.0px</td><td class="bad">1322 &gt; 1280</td><td class="ok">없음</td></tr>
      <tr><td>1220 × 800</td><td class="bad">21.2px</td><td class="ok">0.0px</td><td class="bad">넘침</td><td class="ok">없음</td></tr>
      <tr><td>1440 × 820</td><td class="ok">0.0px</td><td class="ok">0.0px</td><td class="ok">없음</td><td class="ok">없음</td></tr>
      <tr><td>1920 × 1080</td><td class="ok">0.0px</td><td class="ok">0.0px</td><td class="ok">없음</td><td class="ok">없음</td></tr>
    </tbody>
  </table>

  <h3>바 위치 — 1면 ↔ 3면 (1280×760, 최대화 아님)</h3>
  <div class="two">
    <figure><figcaption><span class="tag b">전</span>1면. 바 중심 x=661.7 · 우 레일이 오른쪽으로 밀려 화면 밖으로 잘렸다(「판매증」 글자 끊김).</figcaption><img src="${B('bar_full_p1.jpg')}" alt="전 1면"></figure>
    <figure><figcaption><span class="tag a">후</span>1면. 바 중심 x=640.5 · 좌우 정확히 1:1, 레일 잘림 없음.</figcaption><img src="${A('bar_full_p1.jpg')}" alt="후 1면"></figure>
    <figure><figcaption><span class="tag b">전</span>3면. 바 중심 x=640.5 — 1면과 <b>21.2px 차이</b>. 면을 넘길 때마다 바와 우 열이 통째로 움직였다.</figcaption><img src="${B('bar_full_p3.jpg')}" alt="전 3면"></figure>
    <figure><figcaption><span class="tag a">후</span>3면. 바 중심 x=640.5 — 1면과 <b>같은 자리</b>(Δ0).</figcaption><img src="${A('bar_full_p3.jpg')}" alt="후 3면"></figure>
  </div>

  <h3>바만 잘라서 겹쳐 보기 (붉은 선 = 화면 정중앙 640px)</h3>
  <div class="two">
    <figure><figcaption><span class="tag b">전</span>1면 — 바가 중앙선보다 <b>오른쪽</b></figcaption><div class="guide"><img src="${B('bar_crop_p1.jpg')}" alt="전 1면 바"></div>
      <figcaption style="margin-top:8px"><span class="tag b">전</span>3면 — 바가 중앙선 위</figcaption><div class="guide"><img src="${B('bar_crop_p3.jpg')}" alt="전 3면 바"></div>
      <div class="gcap">두 장 사이에서 바가 21.2px 이동 = 운영자가 본 「왔다갔다」</div></figure>
    <figure><figcaption><span class="tag a">후</span>1면 — 중앙선 위</figcaption><div class="guide"><img src="${A('bar_crop_p1.jpg')}" alt="후 1면 바"></div>
      <figcaption style="margin-top:8px"><span class="tag a">후</span>3면 — 중앙선 위(동일)</figcaption><div class="guide"><img src="${A('bar_crop_p3.jpg')}" alt="후 3면 바"></div>
      <div class="gcap" style="color:var(--green)">두 장 사이 이동 0.0px</div></figure>
  </div>

  <div class="note"><b>맞바꾼 것(꼭 확인 필요).</b> 창 폭 <b>1201~1362px</b> 구간에서는 1면 「전체 실적표」가 반쪽 폭에 원래 안 들어간다(표 최소폭 579.5px).
  전에는 <b>화면 전체</b>가 가로로 밀려 우 레일이 잘렸고, 지금은 <b>표가 자기 통 안에서 가로 스크롤</b>한다(그 통의 <code>overflow-x:auto</code>는 원래부터 있던 정본).
  1363px 이상에서는 전·후가 완전히 동일하다. 아래는 1280 기준 실제 모습 — 「누계」 열이 잘려 가로로 밀어야 보인다.
  표가 늘 다 보여야 한다면 <b>좁은 화면에서 연도 창(현재 7열)을 줄이는 쪽</b>이 다음 후보다(데이터 표시 규칙이라 운영자 결정 사항).</div>
  <div class="two" style="margin-top:12px">
    <figure><figcaption><span class="tag b">전</span>1280 · 전체 실적표 — 다 보이지만, 그 대가로 화면이 가로로 밀렸다</figcaption><img src="${img(join(SP, 'tbl_before.png'))}" alt="전 표"></figure>
    <figure><figcaption><span class="tag a">후</span>1280 · 전체 실적표 — 「누계」가 잘리고 통 안에서 가로 스크롤(1363px 이상은 차이 없음)</figcaption><img src="${img(join(SP, 'tbl_after.png'))}" alt="후 표"></figure>
  </div>
</section>

<section>
  <h2>② 면 전환 「번쩍」 → 디졸브</h2>
  <p><b>정체(실측).</b> 구판은 클릭하면 그 자리에서 <b>동기로</b> 내용을 통째 갈아끼웠다.
  옛 내용이 <b>사라지는 과정 없이</b> 한 프레임에 없어지고, 그동안 차트를 다시 그리느라 메인 스레드가 ~200ms 멈춘다.
  화면에는 「1면이 잠깐 굳었다가 → 갑자기 텅 빈 유리(배경 사진이 그대로 비침) → 새 내용이 올라옴」으로 보인다 = <b>번쩍</b>.</p>
  <p><b>조치.</b> ① 지금 내용을 0.18초에 지우고 → ② <b>안 보이는 동안</b> 교체하고 → ③ 0.30초에 새 내용을 올린다.
  무거운 렌더가 「빈 화면 뒤」로 숨는다. 운영자 단서(<i>내용이 없어도 디졸빙 후 기다리는 게 낫다</i>) 그대로다.
  <b>opacity만</b> 만지므로 유리 프레임·높이·정렬(이젤 고정)은 1px도 안 건드린다. 하단 점 점등은 기다리지 않고 즉시 켜져 클릭 반응은 그대로다.</p>

  <h3>내용 opacity 실측 곡선 (매 프레임 샘플링 · 1면 → 3면)</h3>
  <div class="two">
    <figure><figcaption><span class="tag b">전</span> 클릭~교체 사이 표본 = <b>[1, 0]</b> — 중간이 없다(계단).</figcaption>
      <svg viewBox="0 0 545 190" style="width:100%;background:#fff;border:1px solid var(--border);border-radius:12px">${axis}
        <path d="${gB.d}" fill="none" stroke="#888" stroke-width="2"/>${gB.dots}
        <text x="120" y="96" font-size="10.5" fill="${'#E24B4A'}">← 이 구간에 표본이 없다</text>
        <text x="120" y="110" font-size="10.5" fill="#E24B4A">(동기 렌더로 화면이 멈춰 있었음)</text>
      </svg></figure>
    <figure><figcaption><span class="tag a">후</span> 클릭~교체 사이 표본 = <b>[1, 1, 0.81, 0.39, 0]</b> — 경사로 내려갔다 올라온다.</figcaption>
      <svg viewBox="0 0 545 190" style="width:100%;background:#fff;border:1px solid var(--border);border-radius:12px">${axis}
        <path d="${gA.d}" fill="none" stroke="#4A4DE7" stroke-width="2"/>${gA.dots}
        <text x="150" y="60" font-size="10.5" fill="var(--green)">내려가는 경사(옛 내용) → 0 → 올라오는 경사(새 내용)</text>
      </svg></figure>
  </div>

  <h3>같은 전환을 20배 느리게 촬영 (좌 열 · 1920×1080 · 라벨 = 실시간 환산 ms)</h3>
  <p style="color:var(--dim);margin-bottom:8px">지속시간만 20배로 늘리고 이징·순서는 정본 그대로 — 실시간에서는 눈으로 못 잡는 정지 프레임을 그대로 찍은 것.</p>
  <div style="margin-bottom:6px"><span class="tag b">전</span> 0.04초 만에 이미 옛 내용이 통째로 사라지고 빈 유리가 드러난다.</div>
  <div class="strip">
    ${['000', '040', '090', '190', 'end'].map((t, i) => `<figure><figcaption>${['0ms (클릭 직전)', '40ms', '90ms', '190ms', '완료'][i]}</figcaption><img src="${B('dz_t' + t + '.jpg')}" alt="전 ${t}"></figure>`).join('')}
  </div>
  <div style="margin:16px 0 6px"><span class="tag a">후</span> 0.09초까지도 옛 내용이 살아 있고, 사라진 뒤에 새 내용이 올라온다.</div>
  <div class="strip">
    ${['000', '040', '090', '190', 'end'].map((t, i) => `<figure><figcaption>${['0ms (클릭 직전)', '40ms', '90ms', '190ms', '완료'][i]}</figcaption><img src="${A('dz_t' + t + '.jpg')}" alt="후 ${t}"></figure>`).join('')}
  </div>
  <div class="note">전체 소요는 전 ≈0.63초 / 후 ≈0.64초로 사실상 같다 — <b>느려진 게 아니라 순서가 바뀐 것</b>이다.
  로딩이 걸리는 3면은 디졸브가 끝난 뒤 기다리게 되고, 늦게 도착한 데이터도 같은 결(0.30초 페이드)로 올라온다.</div>
</section>

<section>
  <h2>검증</h2>
  <table>
    <thead><tr><td>게이트 / 실측</td><td>결과</td></tr></thead>
    <tbody>
      <tr><td><code>python3 tools/check_design.py</code> (디자인 기틀 — 신규 hex·토큰 0)</td><td class="ok">통과 (raw hex 1590/1590 · :root 2/0)</td></tr>
      <tr><td><code>python3 tools/check_refs.py</code></td><td class="ok">통과</td></tr>
      <tr><td><code>node tools/smoke_layout.mjs 1920 1080</code> (이젤·흰 라인 계약)</td><td class="ok">PASS</td></tr>
      <tr><td><code>node tools/smoke_layout.mjs 1600 900</code></td><td class="ok">PASS</td></tr>
      <tr><td>바 중심 스윙 (1220·1280·1440·1920)</td><td class="ok">전 21.2px → 후 0.0px</td></tr>
      <tr><td>문서 가로 넘침</td><td class="ok">전 1322&gt;1280 → 후 없음</td></tr>
    </tbody>
  </table>
  <div class="note"><b>고치지 않은 기존 결함(이번 변경과 무관).</b> <code>smoke_layout 1280 760</code>은 <b>전·후 똑같이</b> 3면에서 실패한다
  (「흰 카드 하단 수평선 Δ15.9px · 우 흰 도형이 안선 아래로 18.0px」). 이번 diff를 되돌려도 수치가 1px도 안 바뀌는 것을 확인했다 —
  1280 구간 3면의 별건 정렬 문제이므로 지시가 있으면 따로 잡는다.</div>
</section>

</body></html>`;
writeFileSync(OUT, html);
console.log('report →', OUT, (html.length / 1024 / 1024).toFixed(2) + 'MB');
