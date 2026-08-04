#!/usr/bin/env node
// 진단5 — 면 전환(1면 → 3면) 동안 「유리박스 안 내용」의 실제 opacity 곡선을 매 프레임 샘플링.
//   번쩍임 = 옛 내용이 1 → (한 프레임에) 사라지고 새 내용이 0에서 시작하는 **계단**.
//   디졸브 = 1 → 0 으로 내려갔다가 0 → 1 로 올라오는 **경사**.
// 사용: node probe_dissolve.mjs [--json <파일>]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const JSONOUT = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  return null;
}
// 클릭 전 몇 프레임을 먼저 담고(=옛 내용 opacity 1 기준선) 넘긴다. 내용 서명(헤더 제목) 변화 = 교체 시점.
const SAMPLE = `(()=>new Promise(res=>{
  const box=document.querySelector('#biz-main [data-bizmbox]');
  const head=document.querySelector('#biz-main [data-bizmhead]');
  const sig=()=>(head&&head.textContent?head.textContent.trim().slice(0,10):'');
  const op=()=>{const c=box&&box.firstElementChild;return c?+getComputedStyle(c).opacity:1;};
  const rows=[]; let clicked=null; const t0=performance.now();
  const tick=()=>{ const t=performance.now()-t0;
    rows.push([+t.toFixed(0),+op().toFixed(3),sig()]);
    if(clicked===null&&t>=100){ clicked=t; _bizmGo(1); }
    if(t<1100)requestAnimationFrame(tick); else res({rows,clicked:+clicked.toFixed(0)});
  };
  requestAnimationFrame(tick);
}))()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'nf' }); } }
  if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(1500);
await page.evaluate(`_bizmTo(1)`); await page.waitForTimeout(1500);

const out = await page.evaluate(SAMPLE);
const { rows, clicked } = out;
const base = rows[0][2];
let swapAt = null;
console.log('t-클릭(ms)  opacity  내용');
for (const [t, o, s] of rows) {
  if (s !== base && swapAt === null) swapAt = t;
  console.log(String(t - clicked).padStart(9), '  ', String(o).padEnd(7), s);
}
console.log('\n클릭 =', clicked, 'ms · 내용 교체 =', swapAt === null ? '(첫 프레임에 이미 교체됨)' : (swapAt - clicked) + 'ms 뒤');
const fadeOut = rows.filter(r => r[0] <= (swapAt ?? clicked) && r[0] >= clicked).map(r => r[1]);
console.log('클릭~교체 사이 opacity 표본 =', JSON.stringify(fadeOut), '→ 1에서 0으로 내려가는 계단이 있으면 디졸브, 없으면 번쩍');
if (JSONOUT) writeFileSync(JSONOUT, JSON.stringify({ rows, clicked, swapAt }, null, 0));
await browser.close();
