#!/usr/bin/env node
// [260801] 부팅 타임라인 프로브 — 「처음에 잠깐 크게 떴다가 작아진다」의 범인을 100ms 간격 샘플로 특정.
// 실행: node tools/scratch/probe_bizboot.mjs <파일> <viewportW> <outerW override|0> [샷디렉터리]
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = '/home/user/yeulmaru-promo';
const FILE = process.argv[2] || 'index.html';
const VW = +(process.argv[3] || 2560);
const OUTER = +(process.argv[4] || 0);
const SHOTDIR = process.argv[5] || '';

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = `${base}/${d}/chrome-linux/chrome`;
      if (existsSync(p)) return p;
    }
  }
  return null;
}
if (SHOTDIR) mkdirSync(SHOTDIR, { recursive: true });

const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: Math.round(VW * 1080 / 1920) }, deviceScaleFactor: 1 });
await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
if (OUTER) await ctx.addInitScript(`Object.defineProperty(window,'outerWidth',{value:${OUTER},configurable:true});`);
// 페이지 안에서 rAF마다 상태를 적는 샘플러 — 첫 페인트 직후 프레임까지 잡는다
await ctx.addInitScript(`
  window.__tl = []; window.__t0 = performance.now();
  (function tick(){
    try{
      var bw=document.getElementById('body-wrap'), app=document.getElementById('app');
      var bm=document.getElementById('biz-main'), ch=document.getElementById('yrm-chart');
      var r=function(el){ if(!el)return null; var b=el.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)]; };
      var s={ t:Math.round(performance.now()-window.__t0),
              z:(bw&&bw.style.zoom)||'-', cz:(bw&&typeof bw.currentCSSZoom==='number')?+bw.currentCSSZoom.toFixed(3):null,
              fit:!!(app&&app.classList.contains('biz-fit')), biz:!!(app&&app.classList.contains('biz-mode')),
              bm:r(bm), ch:r(ch), sh:document.documentElement.scrollHeight };
      var last=window.__tl[window.__tl.length-1];
      if(!last||JSON.stringify(s.z+'|'+s.cz+'|'+s.fit+'|'+s.biz+'|'+s.bm+'|'+s.ch+'|'+s.sh)!==JSON.stringify(last._k)){
        s._k=s.z+'|'+s.cz+'|'+s.fit+'|'+s.biz+'|'+s.bm+'|'+s.ch+'|'+s.sh; window.__tl.push(s);
      }
    }catch(e){}
    if(performance.now()-window.__t0 < 8000) requestAnimationFrame(tick);
  })();
`);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto('file://' + ROOT + '/' + FILE + '?qa=1#biz', { waitUntil: 'domcontentloaded', timeout: 60000 });

if (SHOTDIR) {
  for (const ms of [150, 300, 600, 1000, 1600, 2400, 3500]) {
    await page.waitForTimeout(ms - (await page.evaluate(() => Math.round(performance.now() - window.__t0))) > 0
      ? ms - (await page.evaluate(() => Math.round(performance.now() - window.__t0))) : 0);
    await page.screenshot({ path: `${SHOTDIR}/t${String(ms).padStart(4, '0')}.png` });
  }
}
await page.waitForTimeout(8200 - (await page.evaluate(() => Math.round(performance.now() - window.__t0))));
const tl = await page.evaluate(() => window.__tl.map(s => { const c = { ...s }; delete c._k; return c; }));
console.log(FILE, 'vw=' + VW, 'outer=' + (OUTER || '-'));
tl.forEach(s => console.log(`  t=${String(s.t).padStart(5)}ms  zoom=${String(s.z).padStart(6)} css=${s.cz}  biz=${s.biz ? 1 : 0} fit=${s.fit ? 1 : 0}  biz-main=${s.bm}  chart=${s.ch}  scrollH=${s.sh}`));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 3));
await browser.close();
