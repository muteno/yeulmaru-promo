// [260813] 사업 개요 차트 전/후 실측 — 단위·소수점·최저 콜아웃·겹침(전 = git HEAD · 후 = 작업 트리)
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
  const page=await br.newPage({viewport:{width:1440,height:790},deviceScaleFactor:1});
  const errs=[];page.on('pageerror',e=>errs.push(String(e&&e.message||e)));
  await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
    if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
    if(u.hostname!=='app.local')return r.abort();
    let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
    if(old&&OLD[p])return r.fulfill({status:200,body:OLD[p],contentType:'text/html; charset=utf-8'});
    try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
  await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(5200);
  await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
  await page.evaluate(`(()=>{ _bizDeckGo('ov'); _bizOvYear=2026; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{});
  await page.waitForTimeout(3000);
  out[old?'before':'after']=await page.evaluate(`(()=>{
    const g=document.getElementById('bizov-chart'); if(!g)return {err:'no chart'};
    const gb=g.getBoundingClientRect();
    const A=[...g.querySelectorAll('.annotation .annotation-text-g, .annotation text')].filter((e,i,arr)=>!arr.some(o=>o!==e&&o.contains(e)));   // 칩(글상자)만 — annotation 통째는 리더선까지 물어 겹침이 헛나온다
    const xb=[...g.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>t.getBoundingClientRect());
    const hitX=A.filter(a=>{const r=a.getBoundingClientRect();return xb.some(b=>!(r.bottom<b.top||r.top>b.bottom||r.right<b.left||r.left>b.right));}).map(a=>a.textContent.trim());
    const clip=A.filter(a=>{const r=a.getBoundingClientRect();return r.top<gb.top-0.5||r.bottom>gb.bottom+0.5||r.left<gb.left-0.5||r.right>gb.right+0.5;}).map(a=>a.textContent.trim());
    const ovl=[];for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){const r=A[i].getBoundingClientRect(),q=A[j].getBoundingClientRect();
      if(!(r.bottom<q.top||r.top>q.bottom||r.right<q.left||r.left>q.right))ovl.push(A[i].textContent.trim()+' ↔ '+A[j].textContent.trim());}
    return {y축:[...g.querySelectorAll('.yaxislayer-above .ytick text')].map(t=>t.textContent.trim()),
            주석:A.map(a=>a.textContent.trim()), 점라벨:[...g.querySelectorAll('.scatterlayer text')].map(t=>t.textContent.trim()).filter(Boolean),
            x축가림:hitX, 칸밖으로잘림:clip, 주석끼리포갬:ovl,
            머리줄:(document.querySelector('#biz-main .bizm-card .ct')||{}).textContent.replace(/\\s+/g,' ').trim()};
  })()`);
  out[(old?'before':'after')+'/err']=errs.length?errs:0;
  await page.close();
}
await br.close();
console.log(JSON.stringify(out,null,1));
