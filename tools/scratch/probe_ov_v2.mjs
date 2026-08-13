// [260813-6] 사업 개요 ① 연도 단일 차트(사업결과비교 형태) ② 분야별 표 = 공연 일자 순 — 실측
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
page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errs.push('['+m.type()+'] '+m.text());});
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  if(u.hostname!=='app.local')return r.abort();
  let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
  try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(5200);
await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
mkdirSync(join(ROOT,'docs','reports','shots'),{recursive:true});
for(const yr of [2026,2025,2024]){
  await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('ov'); _bizOvYear=${yr}; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{});
  await page.waitForTimeout(3200);
  const o=await page.evaluate(`(()=>{
    const g=document.getElementById('bizov-chart');
    const xt=g?[...g.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>t.textContent.trim()):[];
    const yt=g?[...g.querySelectorAll('.yaxislayer-above .ytick text')].map(t=>t.textContent.trim()):[];
    const bars=g?g.querySelectorAll('.barlayer .point').length:0;
    const head=(document.querySelector('#biz-main .bizm-card .ct')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim();
    const rows=[...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6)
      .map(t=>t.cells[0].textContent.trim()+' | '+t.cells[1].textContent.trim().slice(0,26));
    const hd=[...document.querySelectorAll('#sales-rail .bizm-card table thead td')].map(t=>t.textContent.trim().split('(')[0].trim());
    const sub=(document.querySelector('#sales-rail .bizm-card .ct .sub')||{textContent:''}).textContent.trim();
    return {머리줄:head, x축:xt, y축:yt, 막대:bars, 표머리:hd, 표부제:sub, 표앞8:rows.slice(0,8), 표행수:rows.length};
  })()`);
  console.log('■ '+yr, JSON.stringify(o,null,1));
  writeFileSync(join(ROOT,'docs','reports','shots',`ov2_${yr}.png`), await page.screenshot());
}
// ── 운영대장이 실린 경우(실제 앱 상태) — 일자가 `M/D`로 정확해지는가
const OPS=`(()=>{
  const mk=(nm,m,d,paid,seat)=>({'공연명':nm,'년도':'2025','월':String(m),'일':String(d),
    '발권유료':String(paid),'기본좌석':String(seat),'공연구분':'기획','장르1':'클래식','회차':'1'});
  return {sheet:'세부운영관리대장(정리)',headers:[],rows:[
    mk('2025 신년음악회',1,10,464,900),
    mk('뮤지컬 <시카고>',2,14,540,900),
    mk('뮤지컬 <시카고>',2,16,510,900),
    mk('백건우와 모차르트',3,7,300,900)
  ]};
})()`;
await page.evaluate(`(()=>{ _bizState.raw=${OPS}; _bizOvYear=2025; _finIdxClear&&_finIdxClear(); _bizInlineRender(); _railYrmRender(); })()`).catch(e=>errs.push('mock: '+e));
await page.waitForTimeout(3200);
console.log('■ 운영대장 목 적재(2025)', JSON.stringify(await page.evaluate(`(()=>{
  const rows=[...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6)
    .slice(0,6).map(t=>t.cells[0].textContent.trim()+' | '+t.cells[1].textContent.trim().slice(0,20));
  const g=document.getElementById('bizov-chart');
  return {표앞6:rows, 막대:g?g.querySelectorAll('.barlayer .point').length:0,
          머리줄:(document.querySelector('#biz-main .bizm-card .ct')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim()};
})()`),null,1));
console.log('errs:', errs.length?errs.slice(0,6):0);
await br.close();
