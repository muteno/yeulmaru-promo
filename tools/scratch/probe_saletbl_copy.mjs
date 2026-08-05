// 판매현황 상세 표 — 복사 직렬화(줄 수)·배지/제목 세로선·2자리 회차 정렬 실측
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const W=parseInt(process.argv[2]||'1920',10),H=parseInt(process.argv[3]||'1080',10);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const ctx=await b.newContext({viewport:{width:W,height:H}});
await ctx.grantPermissions(['clipboard-read','clipboard-write']);
const page=await ctx.newPage();
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
  const tbody=tb.querySelector('tbody');
  const sel=window.getSelection(); sel.removeAllRanges();
  const rg=document.createRange(); rg.selectNodeContents(tbody); sel.addRange(rg);
  const selTxt=sel.toString();
  // 실제 클립보드 직렬화(user-select:none 반영) — Selection.toString()과 다르다
  try{ document.execCommand('copy'); }catch(e){}
  const txt=selTxt; sel.removeAllRanges();
  const rows=[...tbody.querySelectorAll('tr')];
  const ink=el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;
    if(getComputedStyle(n.parentElement).visibility==='hidden')continue;
    const r2=document.createRange();r2.setStart(n,0);r2.setEnd(n,1);return +r2.getBoundingClientRect().left.toFixed(2);}return null;};
  const hdName=[...tb.querySelectorAll('thead td')][1];
  const badgeX=[...new Set(rows.map(t=>{const s=t.children[1].querySelector('span[title]');return s?+s.getBoundingClientRect().left.toFixed(2):'없음';}))];
  // 좌석 숫자(괄호 앞)의 오른쪽 끝 x — 회차 자릿수가 섞여도 한 세로선인지
  const seatRight=rows.map(t=>{const td=t.children[4];const w=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);let n;
    while(n=w.nextNode()){const i=n.textContent.indexOf('(');
      if(i>0){const r3=document.createRange();r3.setStart(n,0);r3.setEnd(n,i);return {t:td.innerText.trim(),x:+r3.getBoundingClientRect().right.toFixed(2)};}
      if(i<0&&n.textContent.trim()){const r3=document.createRange();r3.selectNodeContents(n);return {t:td.innerText.trim(),x:+r3.getBoundingClientRect().right.toFixed(2)};}}
    return null;}).filter(Boolean);
  return {clipUsed:true,selLines:selTxt.split('\\n').filter(x=>x.length).length,copyLines:txt.split('\\n').filter(s=>s.length).length, rowN:rows.length,
    copyVia:(0),copySample:txt.split('\\n').filter(s=>s.length).slice(0,2),
    hdInk:ink(hdName), titleInk:[...new Set(rows.map(t=>ink(t.children[1])))],
    badgeX:badgeX, rowH:[...new Set(rows.map(t=>+t.getBoundingClientRect().height.toFixed(1)))],
    seatNumRight:seatRight,
    slash:[...new Set(rows.map(t=>{const td=t.children[0];const w=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);let n;
      while(n=w.nextNode()){const i=n.textContent.indexOf('/');if(i>=0){const r4=document.createRange();r4.setStart(n,i);r4.setEnd(n,i+1);return +r4.getBoundingClientRect().left.toFixed(2);}}return null;}))]};
})()`);
const clip=await page.evaluate(()=>navigator.clipboard.readText().catch(()=>null));
console.log('CLIP_LINES', clip==null?'null':clip.split('\n').filter(x=>x.length).length);
console.log('CLIP_SAMPLE', clip==null?'null':JSON.stringify(clip.split('\n').filter(x=>x.length)[0]));
console.log(JSON.stringify(r,null,1));
if(errs.length)console.log('PAGE ERRORS',errs.slice(0,4)); else console.log('페이지 오류 0');
await b.close();
