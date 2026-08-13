// [260813] 전/후 캡처 — ① 좌 차트 높이(100% 화면 잘림) ② 범례 불릿 ③ 사업명·비고 동기화(2024·2025)
//   「전」 = git HEAD 그대로 · 「후」 = 지금 작업 트리. 두 판 다 네트워크 차단 + 같은 씨앗 경로라 차이는 코드에서만 온다.
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';

const ROOT = '/home/user/yeulmaru-promo';
const OUT = join(ROOT, 'docs', 'reports', 'shots');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const at = (rev, p) => execFileSync('git', ['-C', ROOT, 'show', `${rev}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28 });
const OLD = { '/index.html': at('HEAD', 'index.html'), '/data/biz_finance.js': at('HEAD', 'data/biz_finance.js'), '/tools/../data/biz_finance.js': null };
const exe = (() => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; })();

const { chromium } = await import('playwright-core');
const br = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
mkdirSync(OUT, { recursive: true });
const stat = {};

for (const old of [true, false]) {
  const tag = old ? 'before' : 'after';
  const page = await br.newPage({ viewport: { width: 1440, height: 790 }, deviceScaleFactor: 2 });
  const errs = []; page.on('pageerror', e => errs.push(String(e && e.message || e)));
  await page.route('**/*', r => {
    const u = new NodeURL(r.request().url());
    if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return r.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
    if (u.hostname !== 'app.local') return r.abort();
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    if (old && OLD[p]) return r.fulfill({ status: 200, body: OLD[p], contentType: MIME[extname(p)] || 'text/plain' });
    try { return r.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return r.fulfill({ status: 404, body: 'nf' }); }
  });
  await page.goto('https://app.local/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5200);
  await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);

  for (const yr of [2024, 2025, 2026]) {
    await page.evaluate(`(()=>{ try{_bizDeckGo('ov');}catch(e){} try{_bizOvYear=${yr};}catch(e){} try{_bizInlineRender();}catch(e){} try{_railYrmRender();}catch(e){} })()`).catch(() => { });
    await page.waitForTimeout(2600);
    writeFileSync(join(OUT, `bizov_${yr}_${tag}.png`), await page.screenshot());
    stat[`${yr}/${tag}`] = await page.evaluate(`(()=>{
      const box=document.querySelector('#biz-main [data-bizmbox]')||document.getElementById('biz-main');
      const cards=[...(box?box.querySelectorAll('.bizm-card'):[])], last=cards[cards.length-1];
      const ch=document.getElementById('bizov-chart');
      const head=document.querySelector('#biz-main .bizm-card .ct');
      const tbl=[...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6)
                 .slice(0,6).map(t=>t.cells[1].textContent.trim()+'  ⟨'+t.cells[5].textContent.trim()+'⟩');
      return { 잘림: last&&box?Math.round(last.getBoundingClientRect().bottom-box.getBoundingClientRect().bottom):null,
               차트높이: ch?Math.round(ch.getBoundingClientRect().height):null,
               머리줄: head?head.textContent.replace(/\\s+/g,' ').trim():null,
               불릿: document.querySelectorAll('#biz-main .ct-bul').length,
               차트범례: document.querySelectorAll('#bizov-chart .legend').length,
               표: tbl };
    })()`);
  }
  stat[tag + '/pageerror'] = errs.length ? errs : 0;
  await page.close();
}
await br.close();
console.log(JSON.stringify(stat, null, 1));
