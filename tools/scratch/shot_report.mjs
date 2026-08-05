import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { chromium } from 'playwright-core';
const ROOT='/home/user/yeulmaru-promo';
const REL=process.argv[2], OUT=process.argv[3];
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const chrome=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const browser=await chromium.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await browser.newPage({viewport:{width:1240,height:1200},deviceScaleFactor:2});
await page.route('**/*',route=>{const u=new NodeURL(route.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);
    try{return route.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return route.fulfill({status:404,body:'nf'});}}
  return route.abort();});
await page.goto('https://app.local/'+REL,{waitUntil:'networkidle',timeout:30000});
await page.waitForTimeout(400);
if(process.argv[4]){ await page.locator(process.argv[4]).screenshot({path:OUT}); }
else { await page.screenshot({path:OUT,fullPage:true}); }
console.log('shot →',OUT);
await browser.close();
