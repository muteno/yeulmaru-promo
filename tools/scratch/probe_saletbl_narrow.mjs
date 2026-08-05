import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const W=parseInt(process.argv[3]||'1100',10),H=parseInt(process.argv[4]||'900',10);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:2});
const errs=[]; page.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return route.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  return route.abort();});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForTimeout(2500);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(2500);
// 좁은 화면 = 한 열(half 0) — 3면으로 이동
console.log('state', await page.evaluate(`JSON.stringify({wide:(typeof _bizBookWide==='function')?_bizBookWide():null, page:(window._bizmState||{}).page, slides:(typeof _bizSlides==='function')?_bizSlides().map(s=>s.p+(s.d?'|d':'')):null, main:!!document.getElementById('biz-main'), rail:!!document.getElementById('rail-yrm'), tables:document.querySelectorAll('table').length})`));
// 좁은 화면 한 열(half 0) 강제 — 3면을 현재 면으로 두고 인라인 렌더러를 직접 호출
try{ await page.evaluate(`(function(){ if(window._bizmState)_bizmState.page=3; if(typeof _bizInlineRender==='function')_bizInlineRender(); })()`); }catch(e){ console.log('force fail',e.message); }
await page.waitForTimeout(2500);
const r=await page.evaluate(()=>{
  const all=[...document.querySelectorAll('table')];
  const hit=all.filter(t=>(t.innerText||'').indexOf('오픈석')>=0);
  if(!hit.length)return {found:0,dbg:all.map(t=>(t.innerText||'').slice(0,50).replace(/\n/g,'~')),
    main:(document.getElementById('biz-main')||{innerText:''}).innerText.slice(0,240)};
  const tb=hit[0], rows=[...tb.querySelectorAll('tbody tr')];
  const sc=tb.parentElement;
  return {found:hit.length, hd:[...tb.querySelectorAll('thead td')].map(td=>td.innerText.replace(/\n/g,'/')),
    rowH:[...new Set(rows.map(tr=>+tr.getBoundingClientRect().height.toFixed(1)))], n:rows.length,
    scrollW:sc.scrollWidth, clientW:sc.clientWidth,
    slash:[...new Set(rows.map(tr=>{const td=tr.children[0];const w=document.createTreeWalker(td,NodeFilter.SHOW_TEXT);const ns=[];let n;while(n=w.nextNode())ns.push(n);
      for(const t of ns){const k=t.textContent.indexOf('/');if(k>=0){const rg=document.createRange();rg.setStart(t,k);rg.setEnd(t,k+1);return +rg.getBoundingClientRect().left.toFixed(2);}}return null;}))],
    sample:rows.slice(0,4).map(tr=>[...tr.children].map(td=>td.innerText.trim()).join(' | '))};
});
console.log(JSON.stringify(r,null,1));
if(errs.length)console.log('ERRORS',errs.slice(0,4));
const t=await page.$('table'); if(t) await t.screenshot({path:process.argv[2]});
console.log('saved',process.argv[2]);
await b.close();
