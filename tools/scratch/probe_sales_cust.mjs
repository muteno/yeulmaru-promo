// [260813] 판매 현황 덱에서 「고객」 축이 살아 있나 — 슬라이드 차례·점·우 열 내용 실측
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await br.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
const errs=[];page.on('pageerror',e=>errs.push(String(e&&e.message||e)));
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  if(u.hostname!=='app.local')return r.abort();
  let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
  try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(5200);
await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('sales'); })()`).catch(()=>{});
await page.waitForTimeout(3000);
console.log('책 계약:', JSON.stringify(await page.evaluate(`(()=>({
  admin:userRole, bookN:_bizBookN(), wide:_bizBookWide(),
  slides:_bizSlides().map(s=>s.p+'|'+s.d), deck:_bizDeck, page:_bizmState.page, rdet:_bizmState.rdet,
  rightId:_bizRightId()
}))()`),null,1));
// 슬라이드를 한 바퀴 돌며 각 칸의 좌·우 제목을 읽는다
const seen=[];
for(let i=0;i<6;i++){
  const s=await page.evaluate(`(()=>({
    좌:(document.querySelector('#biz-main [data-bizmhead]')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim().slice(0,40),
    우:(document.querySelector('#rail-yrm [data-bizmhead]')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim().slice(0,40),
    점:[...document.querySelectorAll('#bizm-dots-row .dot')].map(d=>(d.getAttribute('aria-label')||'')+(d.classList.contains('on')?' ●':'')),
    page:_bizmState.page, rdet:_bizmState.rdet
  }))()`);
  seen.push(s);
  await page.evaluate(`(()=>{ _bizmGo(1); })()`).catch(e=>errs.push('go: '+e));
  await page.waitForTimeout(2200);
}
console.log('슬라이드 한 바퀴:'); seen.forEach((s,i)=>console.log(' ',i+1,JSON.stringify(s)));
// 슬라이드 1(사업 결과 비교|판매 실적)의 KPI 스트립 · 슬라이드 4(고객 분석) 안쪽
await page.evaluate(`(()=>{ _bizmTo(1); })()`).catch(()=>{}); await page.waitForTimeout(2400);
console.log('슬라이드1 KPI:', JSON.stringify(await page.evaluate(`(()=>[...document.querySelectorAll('#biz-main .bizm-kpi')].map(k=>k.textContent.replace(/\\s+/g,' ').trim()))()`),null,1));
writeFileSync(join(ROOT,'docs','reports','shots','sales_s1.png'), await page.screenshot());
await page.evaluate(`(()=>{ _bizmTo(4); })()`).catch(()=>{}); await page.waitForTimeout(3000);
console.log('슬라이드4 고객 분석 안쪽:', JSON.stringify(await page.evaluate(`(()=>{
  const r=document.getElementById('rail-yrm'); if(!r)return {err:'rail 없음'};
  return {제목:[...r.querySelectorAll('.ct')].map(c=>c.textContent.replace(/\\s+/g,' ').trim().slice(0,40)),
          KPI:[...r.querySelectorAll('.bizm-kpi')].map(k=>k.textContent.replace(/\\s+/g,' ').trim().slice(0,40)),
          글자:r.textContent.replace(/\\s+/g,' ').trim().slice(0,320)};
})()`),null,1));
writeFileSync(join(ROOT,'docs','reports','shots','sales_s4.png'), await page.screenshot());
console.log('errs:', errs.filter(e=>!/ERR_FAILED|msftauth/.test(e)).slice(0,6));
mkdirSync(join(ROOT,'docs','reports','shots'),{recursive:true});
writeFileSync(join(ROOT,'docs','reports','shots','sales_deck.png'), await page.screenshot());
await br.close();
