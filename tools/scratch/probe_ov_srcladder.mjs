// [260813-7] 일자 원천 사다리 실측 — 전시 원천이 도착하면 「데이터 없음」이 실제 일자로 채워지는가
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const SNAP=`(cat)=>{
  const g=document.getElementById('bizov-chart');
  return {머리줄:(document.querySelector('#biz-main .bizm-card .ct')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim(),
    막대:g?g.querySelectorAll('.barlayer .point').length:0,
    표:[...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6)
       .map(t=>t.cells[0].textContent.trim()+' | '+t.cells[1].textContent.trim().slice(0,22))};
}`;
const go=async(yr,cat)=>{ await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('ov'); _bizOvYear=${yr}; _bizOvCat=${JSON.stringify(cat)}; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{}); await page.waitForTimeout(3000); return page.evaluate(`(${SNAP})(${JSON.stringify(cat)})`); };

console.log('■ 전시 원천 없음 · 2025 전시', JSON.stringify(await go(2025,'전시'),null,1));

// 전시마스터 목 주입(전시DB 3건) — 원천 사다리의 「전시」 칸이 답하기 시작한다
const EXM=`(()=>{
  const iso=(m,d)=>'2025-'+('0'+m).slice(-2)+'-'+('0'+d).slice(-2);
  const mk=(nm,s,e,id)=>({'전시ID':id,'전시명':nm,'연도':'2025','상태':'종료','시작일':iso(s[0],s[1]),'종료일':iso(e[0],e[1]),
    '최종유료':'1200','최종총인원':'1500','목표관객':'2000','최종매출':'12000000','운영일수':'40'});
  return {sheet:'전시마스터',headers:[],rows:[
    mk('어린이 미술전 <냠냠>',[3,15],[6,29],'EX1'),
    mk('장도 기획전시 <HELLO, 고래야>',[7,5],[9,28],'EX2'),
    mk('금호 협력기획전',[10,2],[11,30],'EX3')]};
})()`;
await page.evaluate(`(()=>{ if(typeof _anaState==='undefined'||!_anaState)_anaState={}; _anaState._exMaster=${EXM}; _anaState._exDaily={sheet:'전시일일',headers:[],rows:[]}; window._bizmExFail=0; })()`);
console.log('  진단 _bizExhibRows(2025):', JSON.stringify(await page.evaluate(`(()=>{ try{ var r=_bizExhibRows(2025); return r===null?'null(미적재)':r.map(function(g){return g.name+'@'+(g.start?g.start.toISOString().slice(0,10):'-');}); }catch(e){ return 'ERR '+e.message; } })()`)));
console.log('  진단 _finDateMap(2025):', JSON.stringify(await page.evaluate(`(()=>{ var m=_finDateMap(2025); return {ready:m.ready,pending:m.pending,byNo:Object.keys(m.byNo).length}; })()`)));
console.log('■ 전시마스터 목 적재 · 2025 전시', JSON.stringify(await go(2025,'전시'),null,1));
console.log('■ 전시마스터 목 적재 · 2025 공연(무회귀)', JSON.stringify(await go(2025,'공연'),null,1));
console.log('errs:', errs.filter(e=>!/ERR_FAILED|msftauth/.test(e)).slice(0,5));
mkdirSync(join(ROOT,'docs','reports','shots'),{recursive:true});
await page.evaluate(`(()=>{ _bizOvCat='전시'; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{});
await page.waitForTimeout(2600);
writeFileSync(join(ROOT,'docs','reports','shots','ov_src_전시.png'), await page.screenshot());
await br.close();
