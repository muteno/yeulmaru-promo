#!/usr/bin/env node
// [260813-5] 첫 화면 접힘/중간/펼침 캡처 — 운영자 창(칩 3행이던 좁은 열) 재현용으로 열 폭도 좁힌다.
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W=+(process.env.PW_W||1500), H=+(process.env.PW_H||1000), OUT=process.argv[2];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
function findChromium(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b)){if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}}return null;}
// ⚠ 클립 전이 하나만 세우면 안 된다 — 같이 도는 `cbRiseTop`(대화 위로 넘김)은 계속 흘러서
//   캡처가 끝날 즈음엔 이미 넘어가 있고, 그 결과 「중간 = 텅 빈 판」이라는 **가짜 증상**이 찍힌다(실제로 겪었다).
//   → 카드 아래 모든 애니메이션을 **같은 절대 시각**으로 세운다.
const PAUSE=p=>`(()=>{const c=document.getElementById('mem-ai-card-m');if(!c)return null;
  const cl=c.getAnimations({subtree:true}).find(x=>x.transitionProperty==='clip-path');if(!cl)return 'anim없음';
  const t=${p}*cl.effect.getTiming().duration;
  c.getAnimations({subtree:true}).forEach(a=>{a.pause();a.currentTime=Math.min(t,a.effect.getTiming().duration+(a.effect.getTiming().delay||0));});
  return Math.round(t)+'ms/'+Math.round(cl.effect.getTiming().duration)+'ms · 세운 것 '+c.getAnimations({subtree:true}).length+'개';})()`;
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
  // PW_NARROW = 운영자 캡처(칩 3행) 재현 — 열 폭만 좁힌다(정본 CSS 무접촉 · 인라인 style로 그 자리만)
  if(process.env.PW_NARROW) await page.evaluate(`(()=>{const c=document.getElementById('mem-ai-log-m').parentElement.parentElement;c.style.flex='0 0 ${process.env.PW_NARROW}px';c.style.minWidth='0';})()`);
  await page.evaluate(`(()=>{_memAiHist=[];_memAiPaint('m');})()`); await page.waitForTimeout(400);
  const col=async()=>{const h=await page.evaluateHandle(`document.getElementById('mem-ai-log-m').parentElement.parentElement`);return h.asElement();};
  const chips=await page.evaluate(`(()=>{const r=[...document.querySelectorAll('#mem-ai-log-m .cb-chip')].map(c=>Math.round(c.getBoundingClientRect().top));return {n:r.length,rows:new Set(r).size};})()`);
  const geo=await page.evaluate(`(()=>{const l=document.getElementById('mem-ai-log-m'),c=l.parentElement,cr=c.getBoundingClientRect();
    const m=getComputedStyle(c).clipPath.match(/100% - ([\\d.]+)px/); const clip=m?cr.bottom-parseFloat(m[1]):cr.top;
    const a=l.querySelector('.cb-ava'); return {clip:+clip.toFixed(1),ava:a?+a.getBoundingClientRect().top.toFixed(1):null,colW:+cr.width.toFixed(0)};})()`);
  const shift=await page.evaluate(`(()=>{const c=document.getElementById('mem-ai-card-m');return {sh:c.style.getPropertyValue('--rise-shift'),t:getComputedStyle(c.parentElement).getPropertyValue('--rise-t')};})()`);
  console.log('[접힘] 칩 '+chips.n+'개/'+chips.rows+'행 · 열폭 '+geo.colW+' · 클립선 '+geo.clip+' · 아바타top '+geo.ava+' · 여백 '+(+(geo.ava-geo.clip).toFixed(1))+' · --rise-shift '+shift.sh+' · --rise-t'+shift.t);
  await (await col()).screenshot({path:OUT+'_접힘.png'});
  await page.hover('#mem-ai-q-m'); await page.waitForTimeout(170);
  for(const p of (process.env.PW_MID||'0.35').split(',')){
    await page.evaluate(`(()=>{document.getElementById('mem-ai-card-m').getAnimations({subtree:true}).forEach(a=>{a.cancel();});})()`);
    await page.mouse.move(10,10); await page.waitForTimeout(700);
    await page.hover('#mem-ai-q-m'); await page.waitForTimeout(140);
    const info=await page.evaluate(PAUSE(+p));
    const g=await page.evaluate(`(()=>{const l=document.getElementById('mem-ai-log-m'),c=l.parentElement,cr=c.getBoundingClientRect();
      const m=getComputedStyle(c).clipPath.match(/([\\d.]+)px\\)? 0px 0px/); const a=l.querySelector('.cb-ava');
      const cl=getComputedStyle(c).clipPath; const top=cr.top+(parseFloat((cl.match(/inset\\(([\\d.]+)px/)||[])[1])||0);
      return {보이는윗선:+top.toFixed(1),아바타top:a?+a.getBoundingClientRect().top.toFixed(1):null};})()`);
    console.log('[중간 '+p+'] '+info+' · 보이는 윗선 '+g.보이는윗선+' · 아바타top '+g.아바타top+' · 아바타가 윗선보다 '+(+(g.아바타top-g.보이는윗선).toFixed(1))+'px 아래');
    await (await col()).screenshot({path:OUT+'_중간'+p.replace('0.','')+'.png'});
  }
  await page.evaluate(`(()=>{const c=document.getElementById('mem-ai-card-m');c.getAnimations({subtree:true}).forEach(a=>{a.play();a.finish();});})()`);
  await page.waitForTimeout(200);
  const g2=await page.evaluate(`(()=>{const l=document.getElementById('mem-ai-log-m'),c=l.parentElement,cr=c.getBoundingClientRect();
    const a=l.querySelector('.cb-ava');return {clip:+cr.top.toFixed(1),ava:a?+a.getBoundingClientRect().top.toFixed(1):null};})()`);
  console.log('[펼침] 카드top '+g2.clip+' · 아바타top '+g2.ava+' · 여백 '+(+(g2.ava-g2.clip).toFixed(1)));
  await (await col()).screenshot({path:OUT+'_펼침.png'});
}finally{await browser.close();}
