import {chromium} from 'playwright-core';
import fs from 'fs';
const exe='/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const b=await chromium.launch({executablePath:fs.existsSync(exe)?exe:undefined,args:['--no-sandbox']});
const errs=[];
for (const [w,h,tag] of [[1280,900,'desktop'],[430,932,'phone']]){
  const p=await b.newPage({viewport:{width:w,height:h},deviceScaleFactor:2});
  p.on('pageerror',e=>errs.push(`[${tag}] pageerror ${e.message}`));
  p.on('console',m=>{if(m.type()==='error')errs.push(`[${tag}] console ${m.text()}`)});
  p.on('request',r=>{const u=r.url(); if(!u.startsWith('file:')&&!u.startsWith('data:'))errs.push(`[${tag}] EXTERNAL ${u}`)});
  await p.goto('file:///home/user/yeulmaru-promo/docs/reports/20260804_홍보전략_9-10월기획공연.html',{waitUntil:'load'});
  // details 전부 펼쳐 실측
  const m=await p.evaluate(()=>{
    const de=document.documentElement;
    const overflow=de.scrollWidth-de.clientWidth;
    const bars=[...document.querySelectorAll('.bar')].map(b=>{
      const r=b.getBoundingClientRect(); return {w:Math.round(r.width),x:Math.round(r.left)};
    });
    const band=document.querySelector('.band').getBoundingClientRect();
    return {overflow, bars, band:{x:Math.round(band.left),w:Math.round(band.width)},
            details:document.querySelectorAll('details').length,
            tables:document.querySelectorAll('table').length,
            h2:document.querySelectorAll('h2').length};
  });
  console.log(tag, JSON.stringify(m));
  await p.screenshot({path:`${process.env.SP}/shot_${tag}_closed.png`,fullPage:false});
  await p.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
  await p.waitForTimeout(250);
  const m2=await p.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  console.log(tag,'details 펼친 뒤 가로넘침 =',m2);
  await p.screenshot({path:`${process.env.SP}/shot_${tag}_full.png`,fullPage:true});
  await p.close();
}
await b.close();
console.log(errs.length? 'ERRORS:\n'+errs.join('\n') : '✅ JS 에러 0 · 외부 요청 0');
