// [260813] 관람·수강 추이(인원 · 정본) 무회귀 실측 — 전(HEAD) vs 후(작업 트리).
//   `_yrDrawChart(true,'yrm',_YRM_ST)`를 임시 칸에 그려 축 눈금·점 라벨·콜아웃 문구와 **콜아웃 위·아래**를 잰다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const at=(rev,p)=>execFileSync('git',['-C',ROOT,'show',`${rev}:${p}`],{encoding:'utf8',maxBuffer:1<<28});
const OLD={'/index.html':at('HEAD','index.html')};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const out={};
for(const old of [true,false]){
  const page=await br.newPage({viewport:{width:1440,height:900}});
  const errs=[];page.on('pageerror',e=>errs.push(String(e&&e.message||e)));
  await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
    if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
    if(u.hostname!=='app.local')return r.abort();
    let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
    if(old&&OLD[p])return r.fulfill({status:200,body:OLD[p],contentType:'text/html; charset=utf-8'});
    try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
  await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(5200);
  out[old?'before':'after']=await page.evaluate(`(async()=>{
    var d=document.createElement('div'); d.id='yrm-chart'; d.style.cssText='width:860px;height:560px;position:fixed;left:0;top:0;background:#fff;z-index:99999';
    document.body.appendChild(d);
    _yrDrawChart(true,'yrm',_YRM_ST);
    await new Promise(r=>setTimeout(r,2200));
    var g=document.getElementById('yrm-chart');
    var yt=[...g.querySelectorAll('.yaxislayer-above .ytick text')].map(t=>t.textContent.trim());
    var pt=[...g.querySelectorAll('.scatterlayer text')].map(t=>t.textContent.trim()).filter(Boolean);
    var an=[...g.querySelectorAll('.annotation')].map(a=>{
      var r=a.getBoundingClientRect();
      return {t:a.textContent.trim(), top:Math.round(r.top), left:Math.round(r.left)};
    });
    var CH=[...g.querySelectorAll('.annotation .annotation-text-g, .annotation text')].filter((e,i,arr)=>!arr.some(o=>o!==e&&o.contains(e)));
    var ovl=[];for(var i=0;i<CH.length;i++)for(var j=i+1;j<CH.length;j++){var r=CH[i].getBoundingClientRect(),q=CH[j].getBoundingClientRect();
      if(!(r.bottom<q.top||r.top>q.bottom||r.right<q.left||r.left>q.right))ovl.push(CH[i].textContent.trim()+' ↔ '+CH[j].textContent.trim());}
    var gb=g.getBoundingClientRect();
    var clip=CH.filter(function(e){var r=e.getBoundingClientRect();return r.top<gb.top-0.5||r.bottom>gb.bottom+0.5||r.left<gb.left-0.5||r.right>gb.right+0.5;}).map(e=>e.textContent.trim());
    var xb=[...g.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>t.getBoundingClientRect());
    var hit=[...g.querySelectorAll('.annotation')].filter(a=>{var r=a.getBoundingClientRect();
      return xb.some(b=>!(r.bottom<b.top||r.top>b.bottom||r.right<b.left||r.left>b.right));}).map(a=>a.textContent.trim());
    return {y축:yt, 점라벨:pt.slice(0,12), 주석:an, x축가림:hit, 주석끼리포갬:ovl, 칸밖으로잘림:clip};
  })()`);
  out[(old?'before':'after')+'/err']=errs.length?errs:0;
  await page.close();
}
await br.close();
console.log(JSON.stringify(out,null,1));
