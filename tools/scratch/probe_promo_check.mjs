#!/usr/bin/env node
// 진단 — 상단 대메뉴 「AI 홍보」 + 홍보 점검 모달이 실제로 뜨는가 · _mainView 무접촉인가.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
import { INIT_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2' };
const chrome = (()=>{ const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';
  for(const d of readdirSync(b)) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome'); if(existsSync(p))return p;} return null; })();
const browser = await chromium.launch({ executablePath: chrome, headless: true, args:['--no-sandbox','--no-proxy-server'] });
const errs=[];
for (const [W,H] of [[1920,1080],[1366,768]]) {
  const page = await browser.newPage({ viewport:{width:W,height:H}, deviceScaleFactor:1 });
  page.on('pageerror',e=>errs.push(`[${W}] ${e.message}`.slice(0,160)));
  page.on('console',m=>{ if(m.type()==='error') errs.push(`[${W}] ${m.text()}`.slice(0,160)); });
  await page.route('**/*', route => {
    const u=new NodeURL(route.request().url());
    if(u.hostname==='app.local'){ let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
      try{ return route.fulfill({status:200, body:readFileSync(join(ROOT,p)), contentType:MIME[extname(p)]||'application/octet-stream'}); }
      catch{ return route.fulfill({status:404, body:'nf'}); } }
    return route.abort();
  });
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#nav-menus .nav-btn',{timeout:20000});
  await page.waitForTimeout(1800);
  const before = await page.evaluate(()=>({ mv:(typeof _mainView!=='undefined')?_mainView:null, biz:document.getElementById('app')?.classList.contains('biz-mode') }));
  const nav = await page.evaluate(()=>[...document.querySelectorAll('#nav-menus .nav-btn')].map(b=>b.textContent.trim()));
  await page.locator('#nav-menus .nav-btn',{hasText:'AI 홍보'}).first().click({force:true});
  await page.waitForTimeout(700);
  const m = await page.evaluate(()=>{
    const el=document.getElementById('promo-check');
    const cards=el?[...el.querySelectorAll('.bizm-card')]:[];
    const md=el?el.querySelector('.modal'):null;
    return { 열림:!!(el&&el.querySelector('.modal-bg.show')), 카드:cards.length,
      제목:cards.map(c=>c.firstElementChild.textContent.trim().slice(0,34)),
      빈상태:!!(el&&el.querySelector('.u-empty')),
      모달넘침: md? md.scrollHeight>md.clientHeight+1 : null,
      mv:(typeof _mainView!=='undefined')?_mainView:null,
      biz:document.getElementById('app')?.classList.contains('biz-mode'),
      가로넘침:document.documentElement.scrollWidth-document.documentElement.clientWidth };
  });
  console.log(`${W}x${H} nav=${JSON.stringify(nav)}`);
  console.log(`  before mv=${before.mv} biz=${before.biz}  →  after mv=${m.mv} biz=${m.biz}  (같아야 통과)`);
  console.log(`  ${JSON.stringify({열림:m.열림,카드:m.카드,빈상태:m.빈상태,가로넘침:m.가로넘침})}`);
  console.log(`  카드: ${m.제목.join(' | ')}`);
  if(W===1920) await page.screenshot({ path: process.env.SP+'/promocheck.png' });
  await page.close();
}
await browser.close();
console.log(errs.length? 'ERRORS:\n'+[...new Set(errs)].slice(0,8).join('\n') : '✅ JS 에러 0');
