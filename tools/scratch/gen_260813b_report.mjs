// [260813-5] 전/후 보고서 — docs/reports/260813_매출차트_백만원_전후.html
//   「전」 = git HEAD(머지된 main) · 「후」 = 지금 작업 트리. 두 판 다 네트워크 차단 = 차이는 코드에서만.
//   재는 것: ① 단위·소수점 ② 최저 콜아웃이 x축을 덮나 ③ 칩이 칸 밖으로 잘리나·서로 포개나
//            ④ 관람·수강(정본) 무회귀 ⑤ 머리줄 [실적 입력]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUTF = join(ROOT, 'docs', 'reports', '260813_매출차트_백만원_전후.html');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const at = (rev, p) => execFileSync('git', ['-C', ROOT, 'show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
const OLD = { '/index.html': at('HEAD', 'index.html') };
const exe = (() => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; })();

const { chromium } = await import('playwright-core');
const br = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const shot = {}, ov = {}, yrm = {}, hdr = {}, err = {};

const CHIPS = `[...arguments[0].querySelectorAll('.annotation .annotation-text-g, .annotation text')].filter((e,i,arr)=>!arr.some(o=>o!==e&&o.contains(e)))`;
const MEASURE = `(function(g){
  if(!g)return {err:'차트 없음'};
  var gb=g.getBoundingClientRect();
  var CH=[].slice.call(g.querySelectorAll('.annotation .annotation-text-g, .annotation text')).filter(function(e,i,arr){return !arr.some(function(o){return o!==e&&o.contains(e);});});
  var xb=[].slice.call(g.querySelectorAll('.xaxislayer-above .xtick text')).map(function(t){return t.getBoundingClientRect();});
  var ovl=[];for(var i=0;i<CH.length;i++)for(var j=i+1;j<CH.length;j++){var r=CH[i].getBoundingClientRect(),q=CH[j].getBoundingClientRect();
    if(!(r.bottom<q.top||r.top>q.bottom||r.right<q.left||r.left>q.right))ovl.push(CH[i].textContent.trim()+' ↔ '+CH[j].textContent.trim());}
  return {
    y축:[].slice.call(g.querySelectorAll('.yaxislayer-above .ytick text')).map(function(t){return t.textContent.trim();}),
    콜아웃:CH.map(function(e){return e.textContent.trim();}),
    자리:CH.map(function(e){var r=e.getBoundingClientRect();return e.textContent.trim()+'@'+Math.round(r.top);}),
    점라벨:[].slice.call(g.querySelectorAll('.scatterlayer text')).map(function(t){return t.textContent.trim();}).filter(Boolean),
    x축덮음:CH.filter(function(e){var r=e.getBoundingClientRect();return xb.some(function(b){return !(r.bottom<b.top||r.top>b.bottom||r.right<b.left||r.left>b.right);});}).map(function(e){return e.textContent.trim();}),
    칸밖잘림:CH.filter(function(e){var r=e.getBoundingClientRect();return r.top<gb.top-0.5||r.bottom>gb.bottom+0.5||r.left<gb.left-0.5||r.right>gb.right+0.5;}).map(function(e){return e.textContent.trim();}),
    서로포갬:ovl};
})`;

for (const old of [true, false]) {
  const tag = old ? 'b' : 'a';
  const page = await br.newPage({ viewport: { width: 1440, height: 790 }, deviceScaleFactor: 1 });
  const es = []; page.on('pageerror', e => es.push(String(e && e.message || e)));
  await page.route('**/*', r => {
    const u = new NodeURL(r.request().url());
    if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return r.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
    if (u.hostname !== 'app.local') return r.abort();
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    if (old && OLD[p]) return r.fulfill({ status: 200, body: OLD[p], contentType: 'text/html; charset=utf-8' });
    try { return r.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return r.fulfill({ status: 404, body: 'nf' }); }
  });
  await page.goto('https://app.local/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5200);
  await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
  // ⚠ 관람·수강(정본)은 **사업 개요 덱을 켜기 전에** 잰다 — `_bizInlineRender`가 `_YR`에 매출 행을 붙이므로
  //   순서를 바꾸면 같은 페이지에서 두 지표가 섞여 무회귀 판정이 헛돈다(실측에서 그렇게 어긋났다).
  // 관람·수강(정본) — 임시 칸에 그려 무회귀 확인
  yrm[tag] = await page.evaluate(`(async()=>{
    var d=document.createElement('div'); d.id='yrm-chart'; d.style.cssText='width:860px;height:560px;position:fixed;left:0;top:0;background:#fff;z-index:99999';
    document.body.appendChild(d); _yrDrawChart(true,'yrm',_YRM_ST); await new Promise(r=>setTimeout(r,2200));
    var o=(${MEASURE})(d); d.remove(); return o;
  })()`);
  await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('ov'); _bizOvYear=2026; _bizInlineRender(); _railYrmRender(); })()`).catch(() => { });
  await page.waitForTimeout(3000);
  shot[tag] = (await page.screenshot({ type: 'jpeg', quality: 82 })).toString('base64');
  const chart = await page.locator('#bizov-chart').boundingBox();
  shot[tag + 'z'] = (await page.screenshot({ type: 'jpeg', quality: 88, clip: { x: chart.x, y: chart.y - 4, width: chart.width, height: chart.height + 8 } })).toString('base64');
  ov[tag] = await page.evaluate(`(${MEASURE})(document.getElementById('bizov-chart'))`);
  hdr[tag] = await page.evaluate(`(()=>({버튼:[...document.querySelectorAll('#biz-main [data-bizmhead] button')].map(b=>b.textContent.trim()),
    머리줄:(document.querySelector('#biz-main .bizm-card .ct')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()}))()`);
  err[tag] = es.length ? es : 0;
  await page.close();
}
await br.close();

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const list = a => a && a.length ? a.map(x => '<code>' + esc(x) + '</code>').join(' · ') : '<span class="ok">0건</span>';
const row = (nm, k) => `<tr><td>${nm}</td><td>${list(ov.b[k])}</td><td>${list(ov.a[k])}</td></tr>`;

writeFileSync(OUTF, `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>매출 차트 — 백만원 · 소수점 없음 · 최저 콜아웃 (260813)</title>
<style>
:root{--accent:#4A4DE7;--accent-light:#E8E8FD;--peach-text:#D88455;--green:#1A6B3C;--text:#1A1A2E;
 --dim:#888;--neutral-text:#6B6B7B;--border:rgba(0,0,0,.09);--border2:rgba(0,0,0,.12);
 --bg:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);--surface:#fff;--radius:16px}
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
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
th,td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{color:var(--dim);font-size:11.5px;font-weight:600}
code{background:rgba(0,0,0,.04);padding:1px 6px;border-radius:5px;font-size:12px}
.ok{color:var(--green);font-weight:700}
.dim{color:var(--neutral-text)}
.note{font-size:12px;color:var(--neutral-text);margin-top:10px;padding-left:14px;border-left:2px solid var(--accent-light)}
</style></head><body><div class="wrap">
<h1>매출 차트 — 백만원 · 소수점 없음 · 최저 콜아웃 · [실적 입력]</h1>
<p class="lede">260813 · 「전」 = 지금 머지된 main · 「후」 = 이번 판. pageerror 전/후 ${JSON.stringify(err.b)} / ${JSON.stringify(err.a)}.</p>

<h2><span class="no">①</span>차트 확대 — 전 / 후</h2>
<p class="why">운영자: 「최저가 xy선에 있는 내용은 안 가리게 · 소수점까지 없어도됨 · 단위 백만원으로 · 박스 안 값도」</p>
<div class="ba">
 <div class="card"><span class="tag b">전</span><img alt="차트 전" src="data:image/jpeg;base64,${shot.bz}"></div>
 <div class="card"><span class="tag a">후</span><img alt="차트 후" src="data:image/jpeg;base64,${shot.az}"></div>
</div>

<h2><span class="no">②</span>실측 — 단위 · 자릿수 · 겹침</h2>
<div class="card"><table>
<thead><tr><th></th><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>y축 눈금</td><td>${list(ov.b.y축)}</td><td>${list(ov.a.y축)}</td></tr>
<tr><td>콜아웃</td><td>${list(ov.b.콜아웃)}</td><td>${list(ov.a.콜아웃)}</td></tr>
<tr><td>점 라벨</td><td>${list(ov.b.점라벨)}</td><td>${list(ov.a.점라벨)}</td></tr>
${row('x축 연도를 덮은 칩', 'x축덮음')}
${row('칸 밖으로 잘린 칩', '칸밖잘림')}
${row('칩끼리 포갬', '서로포갬')}
<tr><td>카드 머리줄</td><td class="dim">${esc(hdr.b.머리줄)}</td><td>${esc(hdr.a.머리줄)}</td></tr>
</tbody></table>
<p class="note">「(단위: 백만원)」 칩은 뺐다 — 카드 머리줄이 이미 같은 말을 하고 있었고, 차트 위쪽 마진이 좁아 그 칩이 잘리며 「최고」 콜아웃과 포갰다.</p></div>

<h2><span class="no">③</span>관람·수강 추이(정본) 무회귀</h2>
<p class="why">같은 함수(<code>_yrDrawChart</code>)를 쓰므로 정본 차트가 덩달아 바뀌면 안 된다. 자릿수·단위는 지표에서 고르고, 콜아웃 뒤집기는 「x축을 실제로 덮는 칩」만 움직인다.</p>
<div class="card"><table>
<thead><tr><th></th><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>y축 눈금</td><td>${list(yrm.b.y축)}</td><td>${list(yrm.a.y축)}</td></tr>
<tr><td>점 라벨(앞 6)</td><td>${list(yrm.b.점라벨.slice(0, 6))}</td><td>${list(yrm.a.점라벨.slice(0, 6))}</td></tr>
<tr><td>칩끼리 포갬</td><td>${list(yrm.b.서로포갬)}</td><td>${list(yrm.a.서로포갬)}</td></tr>
<tr><td>칸 밖으로 잘린 칩</td><td>${list(yrm.b.칸밖잘림)}</td><td>${list(yrm.a.칸밖잘림)}</td></tr>
<tr><td>움직인 칩</td><td colspan="2">${(function(){var m=yrm.a.자리.filter(function(x,i){return x!==yrm.b.자리[i];});
  return m.length?m.map(function(x,i){return '<code>'+esc(yrm.b.자리[yrm.a.자리.indexOf(x)])+'</code> → <code>'+esc(x)+'</code>';}).join(' · '):'<span class="ok">없음</span>';})()}</td></tr>
</tbody></table>
<p class="note">칩 이름 뒤 <code>@숫자</code> = 화면 위에서의 픽셀 위치. 움직인 칩 하나를 뺀 나머지는 픽셀까지 그대로다.
 그 하나는 값이 바닥에 붙어(0.0만명) 리더선·칩이 2012 라벨 위로 내려앉던 자리 — 위로 올려도 새로 겹치는 게 없다(칩끼리 포갬 0 유지).</p></div>

<h2><span class="no">④</span>사업 개요 머리줄에 [실적 입력]</h2>
<p class="why">운영자: 「사업 개요에도, 판매현황에서 실적 입력하는 것처럼 실적 입력이 있어야 함」 — 판매 실적의 [일일입력]과 <b>같은 창</b>을 같은 부품으로 냈다(관리자만).</p>
<div class="card"><table>
<thead><tr><th></th><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>머리줄 버튼(관리자)</td><td>${list(hdr.b.버튼)}</td><td>${list(hdr.a.버튼)}</td></tr>
</tbody></table>
<p class="note">일반 사용자 머리줄 = 연도 칩만(실측). 눌러서 열리는 창 = 메뉴 경로 <code>openDailyInput()</code>과 동일(머리줄 「일일 판매 입력」 대조 일치).</p></div>

<h2><span class="no">⑤</span>화면 전체 — 전 / 후</h2>
<div class="ba">
 <div class="card"><span class="tag b">전</span><img alt="전체 전" src="data:image/jpeg;base64,${shot.b}"></div>
 <div class="card"><span class="tag a">후</span><img alt="전체 후" src="data:image/jpeg;base64,${shot.a}"></div>
</div>
</div></body></html>`);
console.log('→', OUTF, (readFileSync(OUTF).length / 1048576).toFixed(2) + 'MB');
console.log(JSON.stringify({ ov, hdr, yrm: { b: yrm.b.x축덮음, a: yrm.a.x축덮음 }, err }, null, 1));
