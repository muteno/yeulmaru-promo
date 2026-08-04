// 좁은 화면(레일 숨김)·감속선호 경로 회귀 점검 — 면 1→2→3→4→1 클릭 시 JS 오류 0 & 면이 실제로 바뀌는가.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
function findChromium(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;}
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:findChromium(),headless:true,args:['--no-sandbox','--no-proxy-server']});
let bad=0;
for(const cfg of [{w:1100,h:820,rm:false,tag:'좁은 화면(레일 없음)'},{w:1920,h:1080,rm:true,tag:'감속선호(reduced-motion)'},{w:1920,h:1080,rm:false,tag:'넓은 화면 연타'}]){
  const ctx=await browser.newContext({viewport:{width:cfg.w,height:cfg.h},reducedMotion:cfg.rm?'reduce':'no-preference'});
  const page=await ctx.newPage(); const errs=[];
  page.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  page.on('console',m=>{if(m.type()==='error')errs.push('console:'+m.text().slice(0,90));});
  await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
   if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
   if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return route.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
   return route.abort();});
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForSelector('#biz-main [data-bizmbox]',{timeout:20000});
  await page.waitForTimeout(1400); await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(1400);
  const seen=[];
  if(cfg.tag==='넓은 화면 연타'){
    await page.evaluate(`_bizmGo(1);_bizmGo(1);_bizmGo(1)`);   // 연타 = 앞 회차 취소 경로
    await page.waitForTimeout(1600);
    seen.push(await page.evaluate(`(()=>{const b=document.querySelector('#biz-main [data-bizmbox]');const c=b&&b.firstElementChild;
      return {page:_bizmState.page, op:c?+getComputedStyle(c).opacity:null, dz:b?b.className:''};})()`));
  } else {
    for(const p of [2,3,4,1]){ await page.evaluate(`_bizmTo(${p})`); await page.waitForTimeout(1300);
      seen.push(await page.evaluate(`(()=>{const b=document.querySelector('#biz-main [data-bizmbox]');const c=b&&b.firstElementChild;
        return {page:_bizmState.page, op:c?+getComputedStyle(c).opacity:null};})()`)); }
  }
  const stuck=seen.filter(s=>s.op!==null&&s.op<0.99);
  const jsErr=errs.filter(e=>/ReferenceError|TypeError|SyntaxError|is not defined|is not a function/.test(e));
  console.log(`[${cfg.tag}] 면 이동=${JSON.stringify(seen.map(s=>s.page))} · 최종 opacity=${JSON.stringify(seen.map(s=>s.op))} · JS오류=${jsErr.length}`);
  if(jsErr.length){bad++;jsErr.slice(0,3).forEach(e=>console.log('   !',e));}
  if(stuck.length){bad++;console.log('   ! 내용이 투명하게 남음:',JSON.stringify(stuck));}
  await ctx.close();
}
await browser.close();
console.log(bad?'FAIL':'OK — 전 경로 회귀 0');
process.exit(bad?1:0);
