#!/usr/bin/env node
// 고객 분류(AI 홍보 3탭) 스샷 + DOM 실측 하네스 — smoke_modal_head.mjs의 서버·목 배선 그대로 계승.
// 사용: node shot_seg.mjs <출력접두사> [--filter]
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = process.env.SHOT_ROOT || '/home/user/yeulmaru-promo';
const OUT = process.argv[2] || 'seg';
const WANT_FILTER = process.argv.includes('--filter');
const OUTDIR = process.env.SHOT_OUT || (dirname(fileURLToPath(import.meta.url)) + '/shots');
mkdirSync(OUTDIR, { recursive: true });
const W = 1500, H = 1050;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  if (u.hostname === 'cdn.plot.ly') {
    const cached = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
    if (existsSync(cached)) return route.fulfill({ status: 200, body: readFileSync(cached), contentType: 'text/javascript' });
  }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2200);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(400);

await page.evaluate(`openPromoCheck()`);
await page.waitForTimeout(500);
await page.evaluate(`_pcTab('seg')`);
await page.waitForTimeout(400);
// 목데이터는 12명 소표본 — 「전 기간 · 1회 이상」으로 전건이 뜨게 한다
await page.evaluate(`(function(){document.getElementById('seg-span').value='all';_segSpanToggle();document.getElementById('seg-min').value='1';})()`);
await page.evaluate(`_segRun()`);
await page.waitForTimeout(900);

const measure = `(()=>{
  const host=document.getElementById('seg-result');
  const ths=[...host.querySelectorAll('th')].map(t=>({txt:t.textContent.trim(),col:t.getAttribute('data-col'),cur:getComputedStyle(t).cursor,w:+t.getBoundingClientRect().width.toFixed(1)}));
  const rows=[...host.querySelectorAll('tbody tr, table tr')].filter(tr=>tr.querySelector('td'));
  return {ths:ths, nRows:rows.length,
    firstRow:rows[0]?[...rows[0].querySelectorAll('td')].map(td=>td.textContent.trim()):null,
    head:(host.querySelector('div[style*="display:flex"]')||{}).textContent||'',
    pop:!!document.getElementById('colf-pop')};
})()`;
let m = await page.evaluate(measure);
console.log(JSON.stringify(m, null, 1));

const shot = async (name, sel) => {
  const p = join(OUTDIR, name + '.png');
  const box = await page.evaluate(`(()=>{const s=${JSON.stringify(sel || null)};let m;
    if(s){m=document.querySelector(s);}
    else{const bg=[...document.querySelectorAll('.modal-bg')].filter(e=>getComputedStyle(e).display!=='none').pop();m=bg&&bg.querySelector('.modal');}
    if(!m)return null;const r=m.getBoundingClientRect();return {x:Math.max(0,r.x-6),y:Math.max(0,r.y-6),width:r.width+12,height:r.height+12};})()`);
  await page.screenshot({ path: p, clip: box || undefined });
  console.log('shot →', p);
};
await shot(OUT);
await shot(OUT + '_card', '#seg-result');

if (WANT_FILTER) {
  // 지역 열 머리 클릭 → 팝업
  const ok = await page.evaluate(`(function(){var t=document.querySelector('#seg-result th[data-col="area"]');if(!t)return false;t.click();return true;})()`);
  await page.waitForTimeout(400);
  console.log('header click →', ok, 'popup:', await page.evaluate(`!!document.getElementById('colf-pop')`));
  await shot(OUT + '_pop');
  // 첫 지역만 남기고 적용
  const applied = await page.evaluate(`(function(){
    var cbs=[].slice.call(document.querySelectorAll('#colf-pop .colf-cb'));
    if(!cbs.length)return null;
    cbs.forEach(function(cb,i){cb.checked=(i===0);});
    var v=cbs[0].value;
    document.querySelector('#colf-pop button[onclick*="applyColFilter"]').click();
    return v;
  })()`);
  await page.waitForTimeout(500);
  console.log('applied filter value =', applied);
  m = await page.evaluate(measure);
  console.log(JSON.stringify(m, null, 1));
  await shot(OUT + '_filtered');
  // 금액 열 내림차순 정렬
  await page.evaluate(`(function(){document.querySelector('#seg-result th[data-col="amt"]').click();})()`);
  await page.waitForTimeout(350);
  await page.evaluate(`(function(){document.querySelector('#colf-pop button[onclick*="desc"]').click();})()`);
  await page.waitForTimeout(450);
  m = await page.evaluate(measure);
  console.log('SORT amt desc:', JSON.stringify(m.ths.map(t => t.txt)), m.nRows, JSON.stringify(m.firstRow));
  await shot(OUT + '_sorted');
}
console.log('pageerror:', errs.length ? errs : 'none');
await browser.close();
