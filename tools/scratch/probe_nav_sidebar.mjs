#!/usr/bin/env node
// [260806] 상단 nav 겹침 + 캘린더:사이드바 비율 실측 프로브 — 폭 스윕.
// 실행: node tools/scratch/probe_nav_sidebar.mjs [파일] [샷디렉터리]
//  · 캘린더 모드로 전환 → 오늘 날짜 패널을 연 상태에서 각 폭의 기하를 잰다.
//  · nav = 좌(로고+월네비) / 중앙(대메뉴) / 우(아이콘 묶음) 세 덩이의 겹침 px.
//  · 사이드바 = #panel 실폭 · 캘린더(#main-area) 실폭 · 비율.
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const ROOT = '/home/user/yeulmaru-promo';
const FILE = process.argv[2] || 'index.html';
const SHOTDIR = process.argv[3] || '';
const WIDTHS = (process.argv[4] || '1920,1600,1440,1366,1280,1200,1100,1024,960,900,820,780,700,600,480')
  .split(',').map(Number);

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

const MEASURE = `(()=>{
  const r=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect();
    if(!b.width&&!b.height)return null;
    return {l:+b.left.toFixed(1),r:+b.right.toFixed(1),w:+b.width.toFixed(1),t:+b.top.toFixed(1),b:+b.bottom.toFixed(1)};};
  const L=r('.nav-left'), C=r('.nav-center'), R=r('.nav-right'), P=r('#panel'), M=r('#main-area'), CAL=r('.cal');
  const vis=s=>{const e=document.querySelector(s);return !!(e&&e.offsetParent!==null&&e.getBoundingClientRect().width>0);};
  return {
    vw:window.innerWidth,
    navL:L, navC:C, navR:R,
    ovLC:(L&&C)?+(L.r-C.l).toFixed(1):null,          // >0 = 좌 덩이가 중앙 메뉴를 침범
    ovCR:(C&&R)?+(C.r-R.l).toFixed(1):null,          // >0 = 중앙 메뉴가 우 덩이를 침범
    panel:P, main:M, cal:CAL,
    panelVis:vis('#panel'), railVis:vis('#sales-rail'),
    ratio:(P&&M)?+(P.w/(P.w+M.w)).toFixed(4):null,
    docW:document.documentElement.scrollWidth,
    ov:document.documentElement.scrollWidth-window.innerWidth   // 가로 넘침
  };
})()`;

const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await page.goto(`file://${ROOT}/${FILE}?qa=admin`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#app', { state: 'attached', timeout: 20000 });
await page.waitForTimeout(2500);
// 캘린더 모드 + 오늘 패널 열기
await page.evaluate(`try{setMainView('cal',true)}catch(e){}`);
await page.waitForTimeout(900);
await page.evaluate(`try{openPanel(new Date(),(typeof getRecsForDate==='function')?getRecsForDate(new Date()):[])}catch(e){}`);
await page.waitForTimeout(700);

const rows = [];
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: Math.max(600, Math.round(w * 9 / 16)) });
  await page.waitForTimeout(450);
  const m = await page.evaluate(MEASURE);
  rows.push(m);
  if (SHOTDIR) await page.screenshot({ path: `${SHOTDIR}/w${w}.png` });
}
console.log('폭   | nav좌겹침 | nav우겹침 | 패널폭 | 캘린더폭 | 패널비율 | 패널보임 | 가로넘침');
for (const m of rows) {
  console.log(
    String(m.vw).padStart(4) + ' | ' +
    String(m.ovLC ?? '-').padStart(9) + ' | ' +
    String(m.ovCR ?? '-').padStart(9) + ' | ' +
    String(m.panel ? m.panel.w : '-').padStart(6) + ' | ' +
    String(m.main ? m.main.w : '-').padStart(8) + ' | ' +
    String(m.ratio ?? '-').padStart(8) + ' | ' +
    String(m.panelVis).padStart(8) + ' | ' + String(m.ov).padStart(8));
}
if (errs.length) console.log('\npageerror:', errs.slice(0, 5).join(' | '));
await browser.close();
