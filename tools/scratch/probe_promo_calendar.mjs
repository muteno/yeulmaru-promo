import {chromium} from 'playwright-core';
const F='file:///home/user/yeulmaru-promo/docs/reports/20260804_홍보캘린더_반영안_9-10월.html';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',args:['--no-sandbox']});
const errs=[];
for (const [w,h,tag] of [[1280,900,'desktop'],[430,932,'phone']]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(`[${tag}] ${e.message}`));
  p.on('console',m=>{if(m.type()==='error')errs.push(`[${tag}] ${m.text()}`)});
  p.on('request',r=>{const u=r.url(); if(!u.startsWith('file:')&&!u.startsWith('data:'))errs.push(`[${tag}] EXTERNAL ${u}`)});
  await p.goto(F,{waitUntil:'load'});
  const m=await p.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    cals:document.querySelectorAll('.cal').length,
    cells:document.querySelectorAll('.cell:not(.blank)').length,
    evs:document.querySelectorAll('.ev').length,
    rows:document.querySelectorAll('tbody tr').length,
    ng:document.querySelectorAll('.ng').length,
    spill:[...document.querySelectorAll('.cell')].filter(c=>c.scrollHeight>c.clientHeight+1).length,
    scriptLen:(document.getElementById('cs')||{textContent:''}).textContent.length,
    entries:((document.getElementById('cs')||{textContent:''}).textContent.match(/\{d:"/g)||[]).length,
  }));
  console.log(tag, JSON.stringify(m));
  // 복사 버튼 실클릭
  await p.locator('#cpbtn').click();
  await p.waitForTimeout(300);
  console.log(tag,'복사버튼 메시지 =', JSON.stringify(await p.locator('#cpmsg').textContent()));
  if(tag==='desktop') await p.locator('#cs').scrollIntoViewIfNeeded(), await p.screenshot({path:`${process.env.SP}/cal_script.png`});
  await p.close();
}
await b.close();
console.log(errs.length? 'ERRORS:\n'+errs.join('\n') : '✅ JS 에러 0 · 외부 요청 0');
