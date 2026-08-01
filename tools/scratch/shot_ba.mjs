import {chromium} from 'playwright-core';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p=await b.newPage({viewport:{width:1400,height:1200},deviceScaleFactor:2});
const errs=[];p.on('pageerror',e=>errs.push(String(e)));
await p.goto('file:///home/user/yeulmaru-promo/docs/reports/260731_공연접속통계_전후.html');
await p.waitForTimeout(500);
await p.screenshot({path:'docs/reports/260731_공연접속통계_전후.png',fullPage:true});
console.log('errors:',errs.join('|')||'none');
await b.close();
