// AI 홍보 세부메뉴(3종)·탭 개명·갈래 칩 삭제 전/후 실측 — 정본 하네스 로딩 문법(smoke_layout) 계승
//   BEFORE = env INDEX_OVERRIDE로 origin/main의 index.html을 먹인다(작업 트리 무접촉).
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { URL as NodeURL } from 'node:url';
import { INIT_SCRIPT, FEED_SCRIPT } from './../qa_mock_ops.mjs';
const MODE=process.argv[2]||'after';
const OVR=process.env.INDEX_OVERRIDE||'';
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
    const path=(f==='/index.html'&&OVR)?OVR:join(ROOT,f);
    try{return route.fulfill({status:200,body:readFileSync(path),contentType:MIME[extname(f)]||'application/octet-stream'});}
    catch{return route.fulfill({status:404,body:'nf'});}}
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');
    if(existsSync(c))return route.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  return route.abort();
});
await p.addInitScript(INIT_SCRIPT);
await p.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await p.waitForTimeout(4500);
await p.evaluate(FEED_SCRIPT);
await p.waitForTimeout(300);

// ① 상단 대메뉴 「AI 홍보」 호버 → 세부 드롭다운
const nav=await p.$('.nav-btn[data-mid="aipromo"]');
if(nav){ await nav.hover(); await p.waitForTimeout(700); }
const dd=await p.evaluate(()=>{const m=document.querySelector('#dd-pop .dd-menu');
  return {open:!!m,items:m?Array.from(m.querySelectorAll('button')).map(x=>x.innerText.replace(/\s+/g,' ').trim()):[]};});
console.log('nav 세부:',JSON.stringify(dd));
await p.screenshot({path:`${OUT}/aip_${MODE}_menu.png`,clip:{x:380,y:0,width:700,height:330}});

// ② 모달 탭 이름 + 키워드 모니터링 탭 진입(칩 유무)
await p.evaluate(()=>{try{_ddCloseAll();}catch(e){} openPromoCheck();});
await p.waitForTimeout(900);
const tabs=await p.evaluate(()=>Array.from(document.querySelectorAll('#pc-tabs .prog-tab')).map(b=>b.innerText.trim()));
console.log('탭:',JSON.stringify(tabs));
await p.screenshot({path:`${OUT}/aip_${MODE}_tabs.png`,clip:{x:420,y:40,width:760,height:300}});
await p.evaluate(()=>_pcTab('sm'));
await p.waitForTimeout(1200);
const sm=await p.evaluate(()=>{const r=document.getElementById('sm-ready');
  return {readyBox:!!r,readyTxt:r?r.innerText.replace(/\s+/g,' ').trim().slice(0,90):'',
    badges:Array.from(document.querySelectorAll('#pc-view-sm .ana-badge')).map(x=>x.innerText.trim()).slice(0,6)};});
console.log('키워드 모니터링 갈래칩:',JSON.stringify(sm));
await p.screenshot({path:`${OUT}/aip_${MODE}_sm.png`,clip:{x:420,y:40,width:760,height:560}});

// ③ 세부메뉴 항목이 그 탭으로 바로 여는지(after 전용 — before엔 드롭다운 자체가 없다)
if(MODE==='after'){
  await p.evaluate(()=>{closePromoCheck();openPromoCheck('sm');});
  await p.waitForTimeout(900);
  const jump=await p.evaluate(()=>{const on=document.querySelector('#pc-tabs .prog-tab.active');
    const v=document.getElementById('pc-view-sm');
    return {active:on?on.innerText.trim():'',smVisible:!!(v&&v.style.display!=='none')};});
  console.log('세부 진입(키워드 모니터링):',JSON.stringify(jump));
}
await b.close();
console.log(JSON.stringify({mode:MODE,errs:errs.slice(0,4)}));
