#!/usr/bin/env node
// [스크래치 260807-4] 전일 대비 모드 두 칸의 **광학 잉크 수평** + 회색 갈래 실측.
//   ① 3열 `32%` ↔ 4열 `±0%` 의 잉크 상/하단이 같은 선인지(같은 크기·굵기라 baseline이 같으면 Δ0)
//   ② 두 칸 안 회색 종류가 몇 가지인지(색+역할 목록)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = parseInt(process.argv[2] || '1920', 10), H = parseInt(process.argv[3] || '1080', 10);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}

// 잉크 = **텍스트 노드 Range**만(요소 박스 아님 — display:block 자식을 만나면 셀 전폭이 잡혀 오독한다)
const MEASURE = `(()=>{
  function runs(el){
    var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT), out=[], n;
    while((n=w.nextNode())){
      var t=n.nodeValue.trim(); if(!t)continue;
      var r=document.createRange(); r.selectNodeContents(n); var b=r.getBoundingClientRect();
      if(!b.width&&!b.height)continue;
      var cs=getComputedStyle(n.parentElement);
      out.push({t:t,color:cs.color,fs:cs.fontSize,fw:cs.fontWeight,
        top:+b.top.toFixed(2),bottom:+b.bottom.toFixed(2),left:+b.left.toFixed(2),right:+b.right.toFixed(2)});
    }
    return out;
  }
  var tb=document.querySelector('#rail-yrm-list table.mv-tbl');
  var rows=[...tb.querySelectorAll('tbody tr')].map(function(tr){
    return {c3:runs(tr.children[2]), c4:runs(tr.children[3])};
  });
  // 회색 갈래 = 두 칸의 무채색 잉크 색 집합
  var greys={};
  rows.forEach(function(r){ r.c3.concat(r.c4).forEach(function(x){
    var m=/rgba?\\((\\d+), ?(\\d+), ?(\\d+)/.exec(x.color); if(!m)return;
    var a=+m[1],b=+m[2],c=+m[3];
    if(Math.max(a,b,c)-Math.min(a,b,c)<=14){ greys[x.color]=(greys[x.color]||[]); if(greys[x.color].length<3)greys[x.color].push(x.t); }
  }); });
  // % 짝 = 각 행에서 3열 마지막 '%' 런과 4열 '%' 런
  var pairs=rows.map(function(r){
    var a=r.c3.filter(function(x){return /%$/.test(x.t);}).pop();
    var b=r.c4.filter(function(x){return /%$/.test(x.t);}).pop();
    if(!a||!b)return null;
    return {누적:a.t,전일:b.t,'3열top':a.top,'4열top':b.top,'Δtop':+(b.top-a.top).toFixed(2),
      'Δbottom':+(b.bottom-a.bottom).toFixed(2),fs:[a.fs,b.fs],fw:[a.fw,b.fw],색:[a.color,b.color]};
  }).filter(Boolean);
  // 첫 줄 주숫자(굵은 값)의 잉크 수평도 함께
  var heads=rows.map(function(r){
    var a=r.c3[0], b=r.c4[0]; if(!a||!b)return null;
    return {누적:a.t,전일:b.t,'Δtop':+(b.top-a.top).toFixed(2),'Δbottom':+(b.bottom-a.bottom).toFixed(2),fs:[a.fs,b.fs]};
  }).filter(Boolean);
  return {회색갈래:greys, '％수평':pairs, '주숫자수평':heads};
})()`;

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', e => console.error('[pageerror]', String(e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  if (u.hostname === 'cdn.plot.ly') {
    const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js');
    if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' });
  }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForSelector('#biz-main [data-bizmbox]', { timeout: 20000 });
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(2500);
await page.evaluate(`_ryDodToggle()`); await page.waitForTimeout(1200);
const r = await page.evaluate(MEASURE);
console.log('■ 회색 갈래');
for (const [c, ex] of Object.entries(r['회색갈래'])) console.log('  ', c, '←', ex.join(' / '));
console.log('■ ％ 수평 (Δtop·Δbottom = 4열 − 3열, 0이면 같은 선)');
for (const p of r['％수평']) console.log('  ', p['누적'].padStart(6), 'vs', p['전일'].padStart(7), ' Δtop=' + p['Δtop'], ' Δbottom=' + p['Δbottom'], ' fs=' + p.fs.join('/'), ' fw=' + p.fw.join('/'));
console.log('■ 주숫자 수평');
for (const p of r['주숫자수평']) console.log('  ', p['누적'].padStart(12), 'vs', p['전일'].padStart(8), ' Δtop=' + p['Δtop'], ' Δbottom=' + p['Δbottom'], ' fs=' + p.fs.join('/'));
await browser.close();
