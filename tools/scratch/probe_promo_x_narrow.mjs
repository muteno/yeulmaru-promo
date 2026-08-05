// 좁은 화면(.modal{padding:18px !important}) 회귀 — X가 정본 자리(모달 우변/상변)에 그대로 앉는가.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const chrome=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const MOCK = readFileSync(join(ROOT,'tools','scratch','_promo_mock.js'),'utf8');
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--no-proxy-server']});
for (const [W,H] of [[1920,1080],[1440,1000],[1024,900],[390,844],[360,740]]) {
  const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
  await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
    if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
      try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
    return route.abort();});
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(2200);
  await page.evaluate(MOCK);
  await page.evaluate('openPromoCheck()');
  await page.waitForTimeout(350);
  const r = await page.evaluate(()=>{
    const m=document.querySelector('#promo-check .modal').getBoundingClientRect();
    const x=document.querySelector('#promo-check .modal-x').getBoundingClientRect();
    const t=document.querySelector('#promo-check .modal>div:first-of-type>div').getBoundingClientRect();
    const cards=[...document.querySelectorAll('#promo-check .bizm-card')];
    const gaps=[]; for(let i=1;i<cards.length;i++) gaps.push(+(cards[i].getBoundingClientRect().top-cards[i-1].getBoundingClientRect().bottom).toFixed(1));
    const pad=getComputedStyle(document.querySelector('#promo-check .modal')).paddingTop;
    return {pad, fromRight:+(m.right-x.right).toFixed(1), fromTop:+(x.top-m.top).toFixed(1),
            겹침: +(x.left - t.right).toFixed(1), gaps,
            가로넘침: document.documentElement.scrollWidth-document.documentElement.clientWidth};
  });
  console.log(`${W}x${H}  padding=${r.pad}  X: 우변 ${r.fromRight}px · 상변 ${r.fromTop}px  |  제목↔X 틈 ${r.겹침}px  |  카드간격 ${JSON.stringify(r.gaps)}  |  가로넘침 ${r.가로넘침}`);
  await page.close();
}
await browser.close();
