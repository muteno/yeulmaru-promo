// 검색량 확인 모달 전/후 실측 — 정본 하네스 로딩 문법(smoke_layout) 계승
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { URL as NodeURL } from 'node:url';
import { INIT_SCRIPT, FEED_SCRIPT } from './../qa_mock_ops.mjs';
const MODE=process.argv[2]||'before';
const ROOT='/home/user/yeulmaru-promo';
const OUT='/tmp/claude-0/-home-user-yeulmaru-promo/854f177d-24f4-5b43-85f8-481b56e682c7/scratchpad';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/json'};
const errs=[];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',headless:true,args:['--no-sandbox','--no-proxy-server']});
const p=await b.newPage({viewport:{width:1600,height:900}});
p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
await p.route('**/*',route=>{
  const u=new NodeURL(route.request().url());
  if(u.hostname==='app.local'){let f=decodeURIComponent(u.pathname);if(f==='/')f='/index.html';
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,f)),contentType:MIME[extname(f)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'nf'});}}
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');
    if(existsSync(c))return route.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  return route.abort();
});
await p.addInitScript(INIT_SCRIPT);
await p.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForTimeout(4500);
await p.evaluate(FEED_SCRIPT);
await p.waitForTimeout(400);
await p.evaluate(()=>{const g=document.getElementById('admin-gear'); if(g){g.style.display='';_ddAdmin(g);} });
await p.waitForTimeout(600);
await p.screenshot({path:`${OUT}/smw_${MODE}_menu.png`,clip:{x:1600-560,y:0,width:560,height:680}});
if(MODE==='after'){
  await p.evaluate(()=>{_ddCloseAll();openSearchMonitor();});
  await p.waitForTimeout(1400);
  const info=await p.evaluate(()=>{const t=document.querySelectorAll('#smw-body tbody tr').length;const s=(document.getElementById('smw-sum')||{}).innerText||'';
    const chips=Array.from(document.querySelectorAll('#smw-flt .ana-chip')).map(b=>b.textContent.trim());
    return {rows:t,chips,sum:s.slice(0,160)};});
  console.log('modal(관련 기본):',JSON.stringify(info));
  await p.screenshot({path:`${OUT}/smw_after_modal.png`});
  await p.evaluate(()=>{_smwSetFlt('all');});
  await p.waitForTimeout(250);
  const all=await p.evaluate(()=>{const trs=Array.from(document.querySelectorAll('#smw-body tbody tr'));
    return {rows:trs.length,dim:trs.filter(t=>t.getAttribute('style').indexOf('opacity:.55')>=0).length};});
  console.log('modal(전체):',JSON.stringify(all));
  await p.screenshot({path:`${OUT}/smw_after_modal_all.png`});
  // 판매 추이 상세 — KOPIS 유관 타지역 줄
  await p.evaluate(()=>{closeSearchMonitor();var o=_ryDrillOrder();var k=o.filter(x=>String(x).indexOf('perf:')===0)[0]||o[0];_ryDrillOpen(k,true);});
  await p.waitForTimeout(1200);
  const rel=await p.evaluate(()=>{const b=document.getElementById('ry-kopis-rel');
    return {shown:!!(b&&b.style.display!=='none'),txt:b?b.innerText.slice(0,140):''};});
  console.log('drill(KOPIS 유관):',JSON.stringify(rel));
  await p.screenshot({path:`${OUT}/smw_after_drill.png`,clip:{x:790,y:60,width:810,height:700}});
}
await b.close();
console.log(JSON.stringify({mode:MODE,errs:errs.slice(0,4)}));
