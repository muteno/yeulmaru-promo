import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
async function run(w,h,label,shot){
  const ctx = await b.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2, hasTouch:w<800 });
  await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  const p = await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  await p.goto('file:///home/user/yeulmaru-promo/index.html?qa=1#cal',{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(4000);
  const m0 = await p.textContent('#nav-month');
  await p.click('.cal-arrow.next'); await p.waitForTimeout(600);
  const m1 = await p.textContent('#nav-month');
  await p.click('.cal-arrow.prev'); await p.waitForTimeout(300);
  await p.click('.cal-arrow.prev'); await p.waitForTimeout(600);
  const m2 = await p.textContent('#nav-month');
  const geo = await p.evaluate(()=>{
    const g=el=>{const r=el.getBoundingClientRect();return [Math.round(r.left),Math.round(r.right),Math.round(r.top)];};
    return {prev:g(document.querySelector('.cal-arrow.prev')),next:g(document.querySelector('.cal-arrow.next')),
      overflowX: document.documentElement.scrollWidth-document.documentElement.clientWidth, vw: innerWidth,
      biz: (()=>{const s=getComputedStyle(document.querySelector('.cal-arrow.prev'));return s.display+'/'+s.backdropFilter;})()};
  });
  if(shot) await p.screenshot({path:shot});
  console.log(label, '| month:', m0,'→',m1,'→',m2, '|', JSON.stringify(geo), '| errors:', errs.slice(0,3).join('|')||'none');
  await ctx.close();
}
await run(1440,900,'desktop','/tmp/claude-0/-home-user-yeulmaru-promo/0d780e78-82cc-5409-afae-9e9eaf9e8a18/scratchpad/after_desktop.png');
await run(390,844,'mobile ','/tmp/claude-0/-home-user-yeulmaru-promo/0d780e78-82cc-5409-afae-9e9eaf9e8a18/scratchpad/after_mobile.png');
await b.close();
