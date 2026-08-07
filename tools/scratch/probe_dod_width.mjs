import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const base=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';
let exe=null; for(const d of readdirSync(base)) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(base,d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const {chromium}=await import('playwright-core');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:1920,height:1080}});
page.on('pageerror',e=>console.error('[err]',String(e).split('\n')[0]));
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
 if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
   try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}}
 if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
 return r.abort();});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForSelector('#biz-main [data-bizmbox]',{timeout:20000});
await page.waitForTimeout(1500); await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(2500);
const M=`(()=>{
 function inkRect(el){
   var w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT), L=Infinity,R=-Infinity,n;
   while((n=w.nextNode())){ if(!n.nodeValue.trim())continue;
     var r=document.createRange(); r.selectNodeContents(n); var b=r.getBoundingClientRect();
     if(b.width===0&&b.height===0)continue; L=Math.min(L,b.left); R=Math.max(R,b.right); }
   return {l:L,r:R};
 }
 const tb=document.querySelector('#rail-yrm-list table.mv-tbl');
 return [...tb.querySelectorAll('tbody tr')].map(function(tr){
   var a=inkRect(tr.children[2]), b=inkRect(tr.children[3]);
   return (tr.children[2].innerText.split('\\n')[0])+' | '+(tr.children[3].innerText.split('\\n')[0])
     +'   3열끝='+a.r.toFixed(1)+' 4열시작='+b.l.toFixed(1)+' **틈='+(b.l-a.r).toFixed(1)+'px**';
 }).join('\\n');
})()`;
console.log('--- 끔(판매율 | 7일 추이) ---'); console.log(await page.evaluate(M));
await page.evaluate(`_ryDodToggle()`); await page.waitForTimeout(1200);
console.log('--- 켬(누적 | 전일 대비) ---'); console.log(await page.evaluate(M));
await b.close();
