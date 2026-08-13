// [260813] 사업 개요 차트 단위·라벨 실측 — 백만원/정수 · 최저 콜아웃 위치 · 관람 차트 무회귀
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await br.newPage({viewport:{width:1440,height:790},deviceScaleFactor:2});
const errs=[];page.on('pageerror',e=>errs.push(String(e&&e.message||e)));
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  if(u.hostname!=='app.local')return r.abort();
  let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
  try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(5200);
await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
await page.evaluate(`(()=>{ _bizDeckGo('ov'); _bizOvYear=2026; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{});
await page.waitForTimeout(3000);
const probe = sel => `(()=>{
  const g=document.querySelector('${sel}');
  if(!g)return {err:'no chart'};
  const ax=[...g.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>t.textContent.trim());
  const yt=[...g.querySelectorAll('.yaxislayer-above .ytick text')].map(t=>t.textContent.trim());
  const an=[...g.querySelectorAll('.annotation text')].map(t=>({t:t.textContent.trim(),y:Math.round(t.getBoundingClientRect().top)}));
  const pt=[...g.querySelectorAll('.scatterlayer text')].map(t=>t.textContent.trim()).filter(Boolean);
  // x축 라벨 띠와 겹치는 주석 = 「연도를 가리는 칩」
  const xb=[...g.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>t.getBoundingClientRect());
  const hit=[...g.querySelectorAll('.annotation')].filter(a=>{const r=a.getBoundingClientRect();
    return xb.some(b=>!(r.bottom<b.top||r.top>b.bottom||r.right<b.left||r.left>b.right));})
    .map(a=>a.textContent.trim());
  const gb=g.getBoundingClientRect();
  const clip=[...g.querySelectorAll('.annotation')].filter(a=>{const r=a.getBoundingClientRect();
    return r.top<gb.top-0.5||r.bottom>gb.bottom+0.5||r.left<gb.left-0.5||r.right>gb.right+0.5;}).map(a=>a.textContent.trim());
  const ovl=[];const A=[...g.querySelectorAll('.annotation')];
  for(let i=0;i<A.length;i++)for(let j=i+1;j<A.length;j++){const r=A[i].getBoundingClientRect(),q=A[j].getBoundingClientRect();
    if(!(r.bottom<q.top||r.top>q.bottom||r.right<q.left||r.left>q.right))ovl.push(A[i].textContent.trim()+' ↔ '+A[j].textContent.trim());}
  return {x축:ax.slice(0,4).concat(['…']).concat(ax.slice(-2)), y축:yt, 주석:an.map(o=>o.t), 점라벨:pt.slice(0,10), x축가림:hit, 칸밖으로잘림:clip, 주석끼리포갬:ovl};
})()`;
console.log('■ 사업 개요(매출)', JSON.stringify(await page.evaluate(probe('#bizov-chart')),null,1));
console.log('머리줄:', await page.evaluate(`(()=>{const c=document.querySelector('#biz-main .bizm-card .ct');return c?c.textContent.replace(/\\s+/g,' ').trim():null;})()`));
// 판매 현황(관람·수강 = 인원) 무회귀
await page.evaluate(`(()=>{ _bizDeckGo('sales'); })()`).catch(()=>{});
await page.waitForTimeout(3200);
await page.evaluate(`(()=>{ try{_railYrmRender();}catch(e){} })()`).catch(()=>{});
await page.waitForTimeout(3400);
console.log('deck 후 yrm 존재:', await page.evaluate(`!!document.getElementById('yrm-chart')`));
console.log('■ 판매 현황(인원)', JSON.stringify(await page.evaluate(probe('#yrm-chart')),null,1));
console.log('pageerror:',errs.length?errs:0);
mkdirSync(join(ROOT,'docs','reports','shots'),{recursive:true});
await br.close();
