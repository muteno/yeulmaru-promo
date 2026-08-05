// 정본 실측 — 일반(비-flex) .modal 안에서 .modal-x가 앉는 자리(창 모서리 기준 offset)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const chrome=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
  return route.abort();});
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForTimeout(2000);
const r = await page.evaluate(()=>{
  document.body.insertAdjacentHTML('beforeend',
   '<div id="__t" class="modal-bg show"><div class="modal" style="width:min(760px,94vw)">'
   +'<button class="modal-x">&times;</button>'
   +'<div style="font-size:17px;font-weight:800;padding:2px 0 10px">AI 홍보 · 점검</div>'
   +'<div style="height:200px">body</div></div></div>');
  const m=document.querySelector('#__t .modal').getBoundingClientRect();
  const x=document.querySelector('#__t .modal-x').getBoundingClientRect();
  const t=document.querySelector('#__t .modal>div:nth-child(2)').getBoundingClientRect();
  const o={fromRight:+(m.right-x.right).toFixed(2), fromTop:+(x.top-m.top).toFixed(2),
           w:+x.width.toFixed(1), h:+x.height.toFixed(1),
           titleTopFromModal:+(t.top-m.top).toFixed(2)};
  document.getElementById('__t').remove();
  return o;
});
console.log('정본 .modal-x 자리:', JSON.stringify(r));
await browser.close();
