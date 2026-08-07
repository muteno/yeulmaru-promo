#!/usr/bin/env node
// [260813-8] ① 접힘 창에서 「마지막 예울이 줄」이 맨 위에 오는지 ② 예시 자동입력이 채워지는지 실측.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W=+(process.env.PW_W||1500), H=+(process.env.PW_H||1250), OUT=process.argv[2];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
function findChromium(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b)){if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}}return null;}
const GEO=`(()=>{const log=document.getElementById('mem-ai-log-m'),card=log.parentElement,cr=card.getBoundingClientRect();
  const pr=document.createElement('div');pr.style.cssText='position:absolute;width:0;visibility:hidden;height:var(--rise-h)';card.appendChild(pr);const rh=pr.offsetHeight;pr.remove();
  const cut=cr.top+card.offsetHeight-rh;                       // 접힘 창이 시작하는 선(화면 좌표)
  const lines=log.querySelectorAll('.cb-line');const t=lines.length?lines[lines.length-1]:log.firstElementChild;
  const ava=t.querySelector('.cb-ava')||t;
  return {클립선:+cut.toFixed(1),마지막예울이줄top:+t.getBoundingClientRect().top.toFixed(1),
    아바타top:+ava.getBoundingClientRect().top.toFixed(1),
    riseDown:card.style.getPropertyValue('--rise-down'),riseShift:card.style.getPropertyValue('--rise-shift'),
    로그밑선:+log.getBoundingClientRect().bottom.toFixed(1)};})()`;
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:findChromium(),headless:true,args:['--no-sandbox','--no-proxy-server']});
try{
  const page=await browser.newPage({viewport:{width:W,height:H}});
  page.on('pageerror',e=>console.log('❌ pageerror: '+e.message));
  await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
    if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
      try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
    return route.abort();});
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(2000); await page.evaluate(FEED_SCRIPT);
  await page.evaluate('openMemberOverview()'); await page.waitForTimeout(900);
  if(process.env.PW_NARROW) await page.evaluate(`(()=>{const c=document.getElementById('mem-ai-log-m').parentElement.parentElement;c.style.flex='0 0 ${process.env.PW_NARROW}px';c.style.minWidth='0';})()`);
  const col=async()=>{const h=await page.evaluateHandle(`document.getElementById('mem-ai-log-m').parentElement.parentElement`);return h.asElement();};
  // ── ① 긴 답변(운영자 캡처와 같은 모양) 접힘 상태
  await page.evaluate(`(()=>{_memAiHist=[{u:'여수 30대 회원 중 클래식 공연 2회 이상 관람한 회원'},{b:'2020~2025년 · 여수시 거주 · 클래식 공연 2회 이상 관람한 회원은 <b>741명</b>이에요 · 이분들 누적 9,685매<br><br>※ 예매기록에 회원이 확정 연결된 10,119명 기준이라 <b>하한</b>이에요 · 전체 구매회원으로 환산하면 약 1,134명(×1.53)',t:'오후 02:37'}];_memAiPaint('m');})()`);
  await page.waitForTimeout(900);
  const g=await page.evaluate(GEO);
  console.log('[긴답변·접힘] '+JSON.stringify(g)+' → 아바타가 클립선보다 '+(+(g.아바타top-g.클립선).toFixed(1))+'px 아래');
  if(OUT)await (await col()).screenshot({path:OUT+'_긴답변_접힘.png'});
  await page.hover('#mem-ai-q-m'); await page.waitForTimeout(900);
  const g2=await page.evaluate(GEO);
  console.log('[긴답변·펼침] 아바타top '+g2.아바타top+' · 카드윗선에서 '+(+(g2.아바타top-(g2.클립선-(g2.클립선-0))).toFixed(1)));
  if(OUT)await (await col()).screenshot({path:OUT+'_긴답변_펼침.png'});
  await page.mouse.move(10,10); await page.waitForTimeout(900);
  // ── ② 첫 화면 무회귀
  await page.evaluate(`(()=>{_memAiHist=[];_memAiPaint('m');})()`); await page.waitForTimeout(900);
  const g3=await page.evaluate(GEO);
  console.log('[첫화면·접힘] 아바타가 클립선보다 '+(+(g3.아바타top-g3.클립선).toFixed(1))+'px 아래 · --rise-down '+g3.riseDown);
  if(OUT)await (await col()).screenshot({path:OUT+'_첫화면_접힘.png'});
  // ── ③ 예시 자동입력
  for(const t of ['여수','재','거주지','ㅁ']){
    await page.evaluate(`(()=>{var i=document.getElementById('mem-ai-q-m');i.value='';i._memNoAuto=0;})()`);
    await page.focus('#mem-ai-q-m');
    await page.type('#mem-ai-q-m',t,{delay:20});
    const r=await page.evaluate(`(()=>{var i=document.getElementById('mem-ai-q-m');return {값:i.value,선택:i.value.slice(i.selectionStart,i.selectionEnd)};})()`);
    console.log('[자동입력] 「'+t+'」 → 「'+r.값+'」 (선택된 부분 = 「'+r.선택+'」)');
  }
  // 지우는 중엔 안 채우는지
  await page.evaluate(`(()=>{var i=document.getElementById('mem-ai-q-m');i.value='';i._memNoAuto=0;})()`);
  await page.focus('#mem-ai-q-m'); await page.type('#mem-ai-q-m','여수',{delay:20});
  await page.keyboard.press('Backspace');
  console.log('[자동입력·Backspace] → 「'+await page.evaluate(`document.getElementById('mem-ai-q-m').value`)+'」');
  await page.keyboard.press('Backspace');
  console.log('[자동입력·Backspace 2회] → 「'+await page.evaluate(`document.getElementById('mem-ai-q-m').value`)+'」');
}finally{await browser.close();}
