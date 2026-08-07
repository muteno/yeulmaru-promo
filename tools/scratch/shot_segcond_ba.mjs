#!/usr/bin/env node
// [260814] 고객 분류 「조건 만드는 자리」 전/후 스샷 — shot_seg_ba.mjs의 서버·목 배선 계승, 찍는 대상만 조건 카드로.
//   사용: node tools/scratch/shot_segcond_ba.mjs <출력접두사> [--dd 기간|장르|횟수|거주지]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT = process.env.SHOT_ROOT || '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || 'segcond';
const DDI = process.argv.indexOf('--dd');
const DD = DDI > 0 ? process.argv[DDI + 1] : null;
const OUTDIR = process.env.SHOT_OUT || (dirname(fileURLToPath(import.meta.url)) + '/shots');
mkdirSync(OUTDIR, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function fc() { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; }
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: fc(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const WI = process.argv.indexOf('--w');
const W = WI > 0 ? parseInt(process.argv[WI + 1], 10) : 1500;
const page = await browser.newPage({ viewport: { width: W, height: 1050 }, deviceScaleFactor: 2 });
const errs = []; page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.route('**/*', r => {
  const u = new NodeURL(r.request().url());
  if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return r.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); } catch { return r.fulfill({ status: 404, body: 'nf' }); } }
  if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return r.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
  return r.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200); await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(400);
await page.evaluate(`openPromoCheck()`); await page.waitForTimeout(500);
await page.evaluate(`_pcTab('seg')`); await page.waitForTimeout(400);
await page.evaluate(`(async()=>{await _bkLoad(false);await _memLoad(false);if(typeof _segFillRegions==='function')_segFillRegions();})()`); await page.waitForTimeout(700);

// 조건 줄 실측 — 「한 줄인가」(줄바꿈 0)를 높이로 잰다
const m = await page.evaluate(`(()=>{
  const card=document.querySelector('#pc-view-seg .bizm-card');
  const line=document.getElementById('seg-cond')||card;
  const r=line.getBoundingClientRect();
  // 「한 줄인가」 = 자식 상자 **합집합 높이** vs 가장 큰 자식(접히면 두 배) — top만 세면 align-items:center에 속는다
  const rs=[...line.children].map(e=>e.getBoundingClientRect());
  const uni=Math.max(...rs.map(b=>b.bottom))-Math.min(...rs.map(b=>b.top)), tall=Math.max(...rs.map(b=>b.height));
  return {w:window.innerWidth,cardH:+card.getBoundingClientRect().height.toFixed(1),lineH:+r.height.toFixed(1),
    uni:+uni.toFixed(1),tall:+tall.toFixed(1),oneLine:uni<=tall+1,overflow:line.scrollWidth>line.clientWidth+1,
    txt:(line.textContent||'').replace(/\s+/g,' ').trim()};
})()`);
console.log(JSON.stringify(m, null, 1));

const NLI = process.argv.indexOf('--nl');
if (NLI > 0) { // 자연어 한 줄을 실제로 넣고 「조건 만들기」를 눌러 안내 문구까지 찍는다
  const q = process.argv[NLI + 1];
  await page.evaluate(`(async()=>{document.getElementById('seg-nl').value=${JSON.stringify(q)};await _segNlGo();})()`);
  await page.waitForTimeout(500);
  console.log('note →', await page.evaluate(`document.getElementById('seg-nl-note').textContent`));
  console.log('조회 실행 →', await page.evaluate(`!!_segLast`));
}
if (DD) { // 토큰 드롭다운 열어서 찍기
  const okd = await page.evaluate(`(()=>{const b=[...document.querySelectorAll('#seg-cond .ry-yr-tg')].find(x=>x.dataset.k===${JSON.stringify(DD)});if(!b)return false;b.click();return true;})()`);
  await page.waitForTimeout(600);
  console.log('dd open →', okd);
}
const clip = await page.evaluate(`(()=>{const c=document.querySelector('#pc-view-seg .bizm-card');const dd=document.querySelector('#dd-pop .dd-menu');
  let r=c.getBoundingClientRect();let x=r.x-8,y=r.y-8,w=r.width+16,h=r.height+16;
  if(dd){const d=dd.getBoundingClientRect();const x2=Math.max(x+w,d.right+8),y2=Math.max(y+h,d.bottom+8);x=Math.min(x,d.left-8);y=Math.min(y,d.top-8);w=x2-x;h=y2-y;}
  return {x:Math.max(0,x),y:Math.max(0,y),width:w,height:h};})()`);
const p = join(OUTDIR, OUT + '.png');
await page.screenshot({ path: p, clip });
console.log('shot →', p, 'pageerror:', errs.length ? errs : 'none');
await browser.close();
