#!/usr/bin/env node
// [260813-5] 접힘 칸에서 「무엇이 잘리는가」 실측 — 클립선 vs 아바타/말풍선/칩 행 좌표.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const W=+(process.env.PW_W||1500), H=+(process.env.PW_H||1000);
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const OUT=process.argv[2];
function findChromium(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b)){if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}}return null;}
const GEO=`(()=>{
  const log=document.getElementById('mem-ai-log-m'); if(!log)return null;
  const card=log.parentElement, col=card.parentElement, bar=col.firstElementChild;
  const cr=card.getBoundingClientRect();
  const cs=getComputedStyle(card).clipPath;
  const m=cs.match(/100% - ([\\d.]+)px/);
  const clipTop = m ? cr.bottom - parseFloat(m[1]) : cr.top;   // 보이기 시작하는 선
  const r=e=>{const b=e.getBoundingClientRect();return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),h:+b.height.toFixed(1)};};
  const ava=log.querySelector('.cb-ava'), chiprow=log.querySelector('.cb-chiprow');
  const chips=[...log.querySelectorAll('.cb-chip')].map(c=>{const b=c.getBoundingClientRect();return {t:+b.top.toFixed(1),txt:c.textContent.slice(0,14)};});
  const rows=[...new Set(chips.map(c=>c.t))];
  return {clipTop:+clipTop.toFixed(1), cardTop:+cr.top.toFixed(1), cardBot:+cr.bottom.toFixed(1),
    logPadTop:getComputedStyle(log).paddingTop,
    ava:ava?r(ava):null, avaCut: ava? +(clipTop - ava.getBoundingClientRect().top).toFixed(1) : null,
    firstChild: log.firstElementChild? r(log.firstElementChild):null,
    chiprow: chiprow?r(chiprow):null, chipRows: rows.length,
    chips: chips.map(c=>c.txt+' @'+c.t), bar:r(bar)};
})()`;
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:findChromium(),headless:true,args:['--no-sandbox','--no-proxy-server']});
try{
  const page=await browser.newPage({viewport:{width:W,height:H}});
  await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
    if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
      try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
    return route.abort();});
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(2000); await page.evaluate(FEED_SCRIPT);
  await page.evaluate('openMemberOverview()'); await page.waitForTimeout(900);
  await page.evaluate(`(()=>{_memAiHist=[];_memAiPaint('m');})()`); await page.waitForTimeout(300);
  console.log('[첫화면·접힘] '+JSON.stringify(await page.evaluate(GEO),null,1));
  if(OUT){const h=await page.evaluateHandle(`document.getElementById('mem-ai-log-m').parentElement.parentElement`);await h.asElement().screenshot({path:OUT+'_쉼.png'});}
  await page.hover('#mem-ai-q-m'); await page.waitForTimeout(1000);
  console.log('[첫화면·펼침] '+JSON.stringify(await page.evaluate(GEO),null,1));
  if(OUT){const h=await page.evaluateHandle(`document.getElementById('mem-ai-log-m').parentElement.parentElement`);await h.asElement().screenshot({path:OUT+'_펼침.png'});}
  // 대화가 있는 상태
  await page.mouse.move(10,10); await page.waitForTimeout(900);
  await page.evaluate(`(()=>{_memAiHist=[{u:'여수 30대 회원 몇 명이야?'},{b:'여수시 30대 회원은 <b>1,842명</b>이에요 · 여수 전체의 12.5%',t:'오후 04:13'}];_memAiPaint('m');})()`);
  await page.waitForTimeout(300);
  console.log('[대화1·접힘] '+JSON.stringify(await page.evaluate(GEO),null,1));
  if(OUT){const h=await page.evaluateHandle(`document.getElementById('mem-ai-log-m').parentElement.parentElement`);await h.asElement().screenshot({path:OUT+'_대화_쉼.png'});}
  await page.hover('#mem-ai-q-m'); await page.waitForTimeout(1000);
  console.log('[대화1·펼침] '+JSON.stringify(await page.evaluate(GEO),null,1));
  if(OUT){const h=await page.evaluateHandle(`document.getElementById('mem-ai-log-m').parentElement.parentElement`);await h.asElement().screenshot({path:OUT+'_대화_펼침.png'});}
}finally{await browser.close();}
