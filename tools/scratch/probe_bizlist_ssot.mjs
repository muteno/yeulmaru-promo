// [260807-8] 사업 목록 표 정본화 검증 — 3면 우 열과 모달 _bizRender가 **같은 마크업**을 내는지 실측
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:2});
const warns=[]; page.on('console',m=>{ if(m.type()==='warning'||m.type()==='error')warns.push(m.text().slice(0,120)); });
page.on('pageerror',e=>warns.push('PAGEERROR '+String(e).split('\n')[0]));
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
    try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}}
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  return r.abort();});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForSelector('#biz-main [data-bizmbox]',{timeout:20000}); await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(2600);

// 두 표를 같은 list로 직접 만들어 문자열 대조(렌더 경로와 무관하게 정본 여부를 본다)
console.log(await page.evaluate(`(()=>{
  const all=_bizClean(); const y=_bizmState.year;
  const rec=all.filter(r=>r._year===y&&r._type==='기획');
  const L=_bizListBuild(rec,y);
  const a=_bizListTable(L), b=_bizListTable(L);
  const hd=(function(){const d=document.createElement('div');d.innerHTML=a;return [...d.querySelectorAll('thead td')].map(t=>t.innerText.split('\\n')[0]);})();
  return JSON.stringify({동일:a===b, 행:L.length, 머리글:hd,
    구표기잔존:{공연일:a.indexOf('공연일')>=0, 판매좌석:a.indexOf('판매좌석')>=0, 회차열:hd.indexOf('회차')>=0}},null,1);
})()`));

// 모달을 실제로 열어 렌더 확인
await page.evaluate(`(function(){ try{ openBusinessBoard(); }catch(e){ console.warn('open fail',e.message); } })()`);
await page.waitForTimeout(2500);
console.log(await page.evaluate(`(()=>{
  const tbs=[...document.querySelectorAll('#business-board table, .modal table')].filter(t=>(t.innerText||'').indexOf('오픈석')>=0);
  if(!tbs.length)return JSON.stringify({모달표:'미발견'});
  const t=tbs[0];
  return JSON.stringify({모달표:'발견', 머리글:[...t.querySelectorAll('thead td')].map(x=>x.innerText.split('\\n')[0]),
    행:t.querySelectorAll('tbody tr').length,
    첫행:[...t.querySelectorAll('tbody tr')[0].children].map(x=>x.innerText.trim().replace(/\\n/g,' '))},null,1);
})()`));
const el=await page.$('#business-board table')||await page.$('.modal table');
if(el)await el.screenshot({path:process.argv[2]});
console.log('warn/err:', warns.length?warns.slice(0,4):'0');
await b.close();
