// [260813] 전/후 보고서 산출 — docs/reports/260813_사업개요_100퍼센트맞춤_전후.html
//   「전」 = git HEAD 그대로 · 「후」 = 지금 작업 트리. 둘 다 네트워크 차단 + 같은 씨앗 경로라 차이는 코드에서만 온다.
//   이미지는 jpeg(품질 80·배율 1)로 박아 넣는다 — 기존 260812 보고서와 같은 방식(링크가 아니라 그림 자체).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUTF = join(ROOT, 'docs', 'reports', '260813_사업개요_100퍼센트맞춤_전후.html');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const at = (rev, p) => execFileSync('git', ['-C', ROOT, 'show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
const OLD = { '/index.html': at('HEAD', 'index.html'), '/data/biz_finance.js': at('HEAD', 'data/biz_finance.js') };
const exe = (() => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; })();
const YEARS = [2024, 2025, 2026];
const VIEWS = [[1440, 790, '맥북 13 · 100%'], [1512, 860, '맥북 14 · 100%'], [1920, 955, 'FHD · 100%']];

const { chromium } = await import('playwright-core');
const br = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const img = {}, fit = {}, meta = {};

const wire = (page, old) => page.route('**/*', r => {
  const u = new NodeURL(r.request().url());
  if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return r.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
  if (u.hostname !== 'app.local') return r.abort();
  let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
  if (old && OLD[p]) return r.fulfill({ status: 200, body: OLD[p], contentType: MIME[extname(p)] || 'text/plain' });
  try { return r.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
  catch { return r.fulfill({ status: 404, body: 'nf' }); }
});
const draw = (page, yr) => page.evaluate(`(()=>{ try{_bizDeckGo('ov');}catch(e){} try{_bizOvYear=${yr};}catch(e){} try{_bizInlineRender();}catch(e){} try{_railYrmRender();}catch(e){} })()`).catch(() => { });
const FIT = `(()=>{
  const box=document.querySelector('#biz-main [data-bizmbox]')||document.getElementById('biz-main');
  const cards=[...(box?box.querySelectorAll('.bizm-card'):[])], last=cards[cards.length-1];
  const ch=document.getElementById('bizov-chart');
  return { 잘림: last&&box?Math.round(last.getBoundingClientRect().bottom-box.getBoundingClientRect().bottom):null,
           차트: ch?Math.round(ch.getBoundingClientRect().height):null };
})()`;

for (const old of [true, false]) {
  const tag = old ? 'b' : 'a';
  // ── 그림: 맥북 13(가장 빡빡한 자리)에서 연도별 한 장씩
  const page = await br.newPage({ viewport: { width: 1440, height: 790 }, deviceScaleFactor: 1 });
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await wire(page, old);
  await page.goto('https://app.local/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5200);
  await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
  for (const yr of YEARS) {
    await draw(page, yr); await page.waitForTimeout(2600);
    img[yr + tag] = (await page.screenshot({ type: 'jpeg', quality: 80 })).toString('base64');
    if (yr === 2024) meta[tag] = await page.evaluate(`(()=>{
      const head=document.querySelector('#biz-main .bizm-card .ct');
      return { 머리줄: head?head.textContent.replace(/\\s+/g,' ').trim():null,
               불릿: document.querySelectorAll('#biz-main .ct-bul').length,
               차트범례: document.querySelectorAll('#bizov-chart .legend').length,
               표: [...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6)
                    .slice(0,8).map(t=>[t.cells[0].textContent.trim(),t.cells[1].textContent.trim(),t.cells[5].textContent.trim()]) };
    })()`);
  }
  await page.close();
  // ── 잘림 실측: 뷰포트 3종
  for (const [w, h, lab] of VIEWS) {
    const p2 = await br.newPage({ viewport: { width: w, height: h } });
    await wire(p2, old);
    await p2.goto('https://app.local/index.html', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(5200);
    await draw(p2, 2025); await p2.waitForTimeout(2600);
    fit[lab + '|' + tag] = await p2.evaluate(FIT);
    await p2.close();
  }
  meta[tag + 'err'] = errs.length ? errs : 0;
}
await br.close();

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const pair = (yr, cap) => `<h2><span class="no">${cap}</span>${yr}년 사업 개요 — 맥북 13 · 100%</h2>
<div class="ba">
 <div class="card"><span class="tag b">전 (main)</span><img alt="${yr} 전" src="data:image/jpeg;base64,${img[yr + 'b']}"></div>
 <div class="card"><span class="tag a">후 (이번 판)</span><img alt="${yr} 후" src="data:image/jpeg;base64,${img[yr + 'a']}"></div>
</div>`;
const fitRows = VIEWS.map(([w, h, lab]) => {
  const b = fit[lab + '|b'], a = fit[lab + '|a'];
  return `<tr><td>${lab} <span class="dim">(${w}×${h})</span></td><td class="num bad">${b.잘림 > 0 ? b.잘림 + 'px 잘림' : (-b.잘림) + 'px 여유'}</td><td class="num">${b.차트}px</td><td class="num good">${a.잘림 > 0 ? a.잘림 + 'px 잘림' : (-a.잘림) + 'px 여유'}</td><td class="num">${a.차트}px</td></tr>`;
}).join('');
const nameRows = meta.a.표.map((r, i) => `<tr><td class="dim">${esc(r[0])}</td><td>${esc(meta.b.표[i] ? meta.b.표[i][1] : '')}</td><td class="arrow">→</td><td><b>${esc(r[1])}</b></td><td class="dim">${esc(meta.b.표[i] ? meta.b.표[i][2] : '')}</td><td class="arrow">→</td><td><b>${esc(r[2])}</b></td></tr>`).join('');

writeFileSync(OUTF, `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>사업 개요 — 100% 화면 맞춤 · 범례 불릿 · 사업명 동기화 전/후 (260813)</title>
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
.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bad{color:var(--peach-text);font-weight:700}
.good{color:var(--green);font-weight:700}
.dim{color:var(--neutral-text)}
.arrow{color:var(--accent);text-align:center;width:22px}
.note{font-size:12px;color:var(--neutral-text);margin-top:10px;padding-left:14px;border-left:2px solid var(--accent-light)}
</style></head><body><div class="wrap">
<h1>사업 개요 — 100% 화면 맞춤 · 범례 불릿 · 사업명 동기화</h1>
<p class="lede">260813 · 「전」 = main 그대로 · 「후」 = 이번 판. 두 판 다 네트워크 차단 + 같은 씨앗 경로라 차이는 코드에서만 온다. pageerror 전/후 각 ${JSON.stringify(meta.berr)} / ${JSON.stringify(meta.aerr)}.</p>

<h2><span class="no">①</span>100% 화면에서 「사업 결과」가 잘려 나갔다</h2>
<p class="why">차트 높이가 <b>410px 고정</b>이라 유리 박스 아래 표가 화면 밖으로 나갔다. 남는 공간을 재서 주는 방식(<code>_bizOvChartH()</code> · 240~410)으로 바꿨다.</p>
<div class="card"><table>
<thead><tr><th>뷰포트</th><th class="num">전 · 잘림</th><th class="num">전 · 차트</th><th class="num">후 · 잘림</th><th class="num">후 · 차트</th></tr></thead>
<tbody>${fitRows}</tbody></table>
<p class="note">「여유」 = 유리 박스 바닥이 내용보다 아래에 있다 = 한 화면에 다 들어온다.</p></div>

<h2><span class="no">②</span>범례를 차트 밖 머리줄로 (공연 · 전시 · 교육 순 불릿)</h2>
<p class="why">Plotly 범례가 차트 안 바닥을 먹고 있었다 → 끄고, 카드 머리줄에 정본 <code>.ct-bul</code> 색 불릿을 세웠다.</p>
<div class="card"><table>
<thead><tr><th></th><th>머리줄</th><th class="num">불릿</th><th class="num">차트 안 범례</th></tr></thead>
<tbody>
<tr><td class="dim">전</td><td>${esc(meta.b.머리줄)}</td><td class="num">${meta.b.불릿}</td><td class="num bad">${meta.b.차트범례}</td></tr>
<tr><td class="dim">후</td><td><b>${esc(meta.a.머리줄)}</b></td><td class="num">${meta.a.불릿}</td><td class="num good">${meta.a.차트범례}</td></tr>
</tbody></table></div>

<h2><span class="no">③</span>사업명 · 비고 = 운영자 확정 공연명 (2024 17건 · 2025 17건 · 2026 18건)</h2>
<p class="why">2024년 앞 8줄 실측(사업NO는 안 바뀐다 — 재빌드 로그 「NO 재사용 27건 / 신규 0건」이 그 실증).</p>
<div class="card"><table>
<thead><tr><th>NO</th><th>사업명 (전)</th><th></th><th>사업명 (후)</th><th>비고 (전)</th><th></th><th>비고 (후)</th></tr></thead>
<tbody>${nameRows}</tbody></table></div>

${pair(2024, '④')}
${pair(2025, '⑤')}
${pair(2026, '⑥')}

</div></body></html>`);
console.log('→', OUTF, (readFileSync(OUTF).length / 1048576).toFixed(2) + 'MB');
console.log(JSON.stringify({ fit, 머리줄: meta.a.머리줄, 불릿: meta.a.불릿, 범례: meta.a.차트범례, err: [meta.berr, meta.aerr] }, null, 1));
