#!/usr/bin/env node
// [260810] 고객 분석 **부팅 선로딩** 실측 — 「책을 4면까지 넘겨야 그제서야 부른다」가 정말 사라졌는지만 본다.
//   서빙·목데이터 배선 = smoke_layout/probe_p4shot 그대로(실API·PII 미접촉 · ?qa=admin).
//   ⚠ 목 주입 지점이 FEED_SCRIPT가 아니라 **_qaApi 래핑**인 이유 = 부팅 warm은 페이지 로드 직후 몇 초 안에 출발한다.
//     FEED는 그보다 늦게 들어가므로 그걸로 먹이면 재려는 그 출발을 못 잰다.
//   측정 = 4면으로 **안 넘기고 · 메뉴에 마우스도 안 올리고** 가만히 둔 뒤 _memState/_bkState가 찼는가 + 언제 찼는가.
//   사용: node tools/scratch/probe_bootwarm.mjs [--src=<index.html 경로>] [--wait=ms]
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';

const ROOT = '/home/user/yeulmaru-promo';
const arg = (k, d) => { const m = process.argv.find(a => a.startsWith('--' + k + '=')); return m ? m.slice(k.length + 3) : d; };
const SRC = arg('src', join(ROOT, 'index.html'));
const WAIT = parseInt(arg('wait', '9000'), 10);
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

// _qaApi 래핑 — 회원·예매집계만 목으로 가로채고 나머지는 원본 QA 응답 그대로.
//   호출 시각을 window.__hit에 적어 「언제 불렀나」를 진입 시각(__t0) 기준 상대초로 만든다.
//   ⚠ 목 응답에 **1.5초 지연**을 준다 — 즉답 목이면 실물(6.7MB 시트)에서 사람이 보는 로딩 구간이 0으로 접혀
//     「넘긴 뒤 로더가 뜨나」를 못 잰다(전후 차이가 hit 시각에만 남는다).
const HOOK = `(()=>{
  window.__t0 = performance.now(); window.__hit = [];
  const LAT = 1500;
  const real = window._qaApi;
  const late = v => new Promise(r => setTimeout(()=>r(v), LAT));
  window._qaApi = function(method, path){
    const dp = decodeURIComponent(String(path||''));
    if(dp.indexOf('/api/ops')===0 && dp.indexOf('sheet=회원')>=0){
      window.__hit.push({sheet:'회원', at:+((performance.now()-window.__t0)/1000).toFixed(2)});
      return late(window.__MOCK_MEM);
    }
    if(dp.indexOf('/api/ops')===0 && dp.indexOf('sheet=예매집계')>=0){
      window.__hit.push({sheet:'예매집계', at:+((performance.now()-window.__t0)/1000).toFixed(2)});
      return late(window.__MOCK_BKAGG);
    }
    return real.apply(this, arguments);
  };
})()`;

const SNAP = `(()=>({
  t: +((performance.now()-window.__t0)/1000).toFixed(2),
  hit: window.__hit,
  memRows: (typeof _memState!=='undefined' && _memState && _memState.rows) ? _memState.rows.length : null,
  bkN: (typeof _bkState!=='undefined' && _bkState) ? _bkState.n : null,
  page: (window._bizmState||{}).page, rdet: (window._bizmState||{}).rdet,
  role: (typeof userRole!=='undefined') ? userRole : null
}))()`;

const browser = await (await import('playwright-core')).chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    const file = (p === '/index.html') ? SRC : join(ROOT, p);
    try { return route.fulfill({ status: 200, body: readFileSync(file), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
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
await page.evaluate(HOOK);

// 4면으로 안 넘기고 · 메뉴 호버도 안 하고 그냥 둔다 = 「가만히 뒀을 때 불러오나」
await page.waitForTimeout(WAIT);
const idle = await page.evaluate(SNAP);

// 이제 4면으로 넘겨 본다 — 데이터가 이미 있으면 로더 없이 즉시, 없으면 여기서 처음 부른다.
await page.evaluate('_bizmTo(4)');
await page.waitForTimeout(400);
const flip04 = await page.evaluate(`(()=>{const i=document.getElementById('mem-ov-inline');return {loader: !!(i&&/불러오는 중/.test(i.textContent)), chars:(i?i.textContent.trim().length:0)};})()`);
const SHOT = arg('shot', '');
// 넓은 화면(1600)에서 고객 분석은 **우 열**(#rail-yrm)이 들고 있다 — 좌 열(#biz-main)을 찍으면 전후가 같은 그림이 나온다.
if (SHOT) { const b = await page.$('#rail-yrm') || await page.$('#biz-main'); try { await b.screenshot({ path: SHOT }); } catch (e) { console.log('shot skip:', String(e).split('\n')[0]); } }
await page.waitForTimeout(2600);
const after = await page.evaluate(SNAP);
const flipped = await page.evaluate(`(()=>{const i=document.getElementById('mem-ov-inline');return {loader: !!(i&&/불러오는 중/.test(i.textContent)), chars:(i?i.textContent.trim().length:0)};})()`);

console.log(JSON.stringify({ src: SRC.replace(ROOT + '/', ''), idle, flip_at_0_4s: flip04, flip_at_3s: flipped, after, pageErrors: errs.slice(0, 5) }, null, 1));
await browser.close();
