// [260813] 사업 개요 머리줄 [실적 입력] 실측 — 버튼 존재·클릭 시 판매현황과 같은 창이 열리나·권한
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await br.newPage({viewport:{width:1440,height:790},deviceScaleFactor:2});
const errs=[];page.on('pageerror',e=>errs.push(String(e&&e.message||e)));
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  if(u.hostname!=='app.local')return r.abort();
  let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
  try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(5200);
await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
const btns = () => page.evaluate(`(()=>[...document.querySelectorAll('#biz-main [data-bizmhead] button')].map(b=>b.textContent.trim()))()`);
// ① 일반 사용자
await page.evaluate(`(()=>{ userRole='user'; sessionStorage.removeItem('isAcct'); _bizDeckGo('ov'); _bizInlineRender(); })()`).catch(()=>{});
await page.waitForTimeout(1200);
console.log('일반 사용자 머리줄:', JSON.stringify(await btns()));
// ② 관리자
await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('ov'); _bizInlineRender(); })()`).catch(()=>{});
await page.waitForTimeout(1500);
console.log('관리자 머리줄:', JSON.stringify(await btns()));
// ③ 눌러서 창이 열리나 + 그 창이 판매현황 [일일입력]과 같은 창인가
const open1 = await page.evaluate(`(()=>{
  const b=[...document.querySelectorAll('#biz-main [data-bizmhead] button')].find(x=>x.textContent.trim()==='실적 입력');
  if(!b)return {err:'버튼 없음'};
  b.click();
  return {clicked:true};
})()`);
await page.waitForTimeout(1600);
const st1 = await page.evaluate(`(()=>{
  const ids=[...document.querySelectorAll('[id]')].filter(e=>getComputedStyle(e).display!=='none'&&e.querySelector(':scope > .modal')).map(e=>e.id);
  const m=document.querySelector('.modal:not([hidden])');
  const head=[...document.querySelectorAll('.modal .mhead')].filter(h=>h.offsetParent!==null).map(h=>h.textContent.replace(/\\s+/g,' ').trim());
  return {열린모달:ids, 머리줄:head};
})()`);
console.log('사업 개요 [실적 입력] 클릭 →', JSON.stringify(st1));
// 닫고, 판매 실적 쪽 일일입력과 대조
await page.evaluate(`(()=>{ try{closeDailyInput&&closeDailyInput();}catch(e){} try{_ddCloseAll&&_ddCloseAll();}catch(e){} })()`).catch(()=>{});
await page.waitForTimeout(700);
await page.evaluate(`openDailyInput()`).catch(e=>{});
await page.waitForTimeout(1600);
const st2 = await page.evaluate(`(()=>{
  const ids=[...document.querySelectorAll('[id]')].filter(e=>getComputedStyle(e).display!=='none'&&e.querySelector(':scope > .modal')).map(e=>e.id);
  const head=[...document.querySelectorAll('.modal .mhead')].filter(h=>h.offsetParent!==null).map(h=>h.textContent.replace(/\\s+/g,' ').trim());
  return {열린모달:ids, 머리줄:head};
})()`);
console.log('메뉴 경로 openDailyInput() →', JSON.stringify(st2));
console.log('같은 창인가:', JSON.stringify(st1)===JSON.stringify(st2));
console.log('pageerror:', errs.length?errs:0);
await br.close();
