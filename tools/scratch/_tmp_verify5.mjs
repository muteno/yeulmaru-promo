// 3단계 반출 심사 실측 — 복사 오염 · 말줄임 행수 · 배지 selection · 접근성 이름
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const W=parseInt(process.argv[2]||'1440',10),H=parseInt(process.argv[3]||'900',10);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:W,height:H}});
const errs=[]; page.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return route.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  return route.abort();});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForSelector('#biz-main [data-bizmbox]',{timeout:20000});
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(2500);
const SL=await page.evaluate(`_bizSlides().map(function(s){return s.p+(s.d?'|상세':'|실적');})`);
await page.evaluate(`_bizmTo(${SL.findIndex(s=>s.startsWith('3|')&&s.endsWith('상세'))+1})`);
await page.waitForTimeout(2500);

const r=await page.evaluate(`(()=>{
  const tb=document.querySelector('#rail-yrm table'); if(!tb)return {err:'no table'};
  const tbody=tb.querySelector('tbody'), rows=[...tbody.querySelectorAll('tr')];
  // 1) 복사 직렬화
  const sel=window.getSelection(); sel.removeAllRanges();
  const rg=document.createRange(); rg.selectNodeContents(tbody); sel.addRange(rg);
  const txt=sel.toString(); sel.removeAllRanges();
  const lines=txt.split('\\n').filter(s=>s.length);
  // 2) 말줄임 실렌더 행 수 (clientWidth 기준)
  const ell=rows.filter(t=>{const td=t.children[1]; return td.scrollWidth>td.clientWidth+0.5;}).length;
  // 3) 배지 span에 user-select 지정이 있나
  const bs=rows.map(t=>t.children[1].querySelector('span[title]')).filter(Boolean);
  const us=bs.length?getComputedStyle(bs[0]).userSelect:'없음';
  // 4) 셀 접근성 이름(스크린리더가 읽는 것) — td.textContent
  const acc=rows.slice(0,3).map(t=>t.children[1].textContent);
  // 5) title 중복 — 잘리지 않은 행에도 title이 붙나
  const tips=rows.map(t=>{const td=t.children[1];return {trunc:td.scrollWidth>td.clientWidth+0.5,title:!!td.getAttribute('title')};});
  // 6) 배지 툴팁 문구
  const btip=bs.map(s=>s.getAttribute('title')).filter((v,i,a)=>a.indexOf(v)===i);
  const blab=bs.map(s=>s.getAttribute('aria-label')).filter((v,i,a)=>a.indexOf(v)===i);
  return {rowN:rows.length, copyLines:lines.length, copyFirst3:lines.slice(0,3),
    ellipsisRows:ell, badgeN:bs.length, badgeUserSelect:us, accNames:acc,
    titleAlways:tips.filter(x=>!x.trunc&&x.title).length, btip:btip, blab:blab,
    scrollW:tb.parentElement.scrollWidth, clientW:tb.parentElement.clientWidth};
})()`);
console.log(JSON.stringify(r,null,1));
if(errs.length)console.log('PAGE ERRORS',errs.slice(0,4)); else console.log('페이지 오류 0');
await b.close();
