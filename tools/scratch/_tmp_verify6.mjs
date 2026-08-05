import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:1440,height:900}});
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
console.log(JSON.stringify(await page.evaluate(`(()=>{
  const out={perfReady:(typeof _perfReady!=='undefined')?_perfReady:'undef', perfsN:(typeof PERFS!=='undefined'&&PERFS)?PERFS.length:'undef'};
  out.cPerfs=(PERFS||[]).filter(p=>p.t==='c').map(p=>({f:p.f,n:p.n,l:p.l,s:p.s,e:p.e,rc:p.rc,g:p.g}));
  const m=(typeof _bizHallMap==='function')?_bizHallMap():null;
  out.hallMapKeys=m?Object.keys(m):null;
  out.hallMap=m;
  out.uName=(typeof _uName==='function')?{
    ops:_uName('한국페스티발앙상블 <세상에서 가장 편한 음악>'),
    sheet:_uName('한국페스티발앙상블 <세상에서 가장 편한 음악>'),
    ny:_uName('2026 신년음악회')
  }:null;
  // 표에 실제로 렌더된 배지 상태
  const tb=document.querySelector('#rail-yrm table');
  out.rows=[...tb.querySelectorAll('tbody tr')].map(tr=>{
    const td=tr.children[1], sp=td.querySelector('span[title]');
    return {name:td.getAttribute('title'), badge:sp?sp.textContent:'-', tip:sp?sp.getAttribute('title'):'-'};
  });
  return out;
})()`),null,1));
await b.close();
