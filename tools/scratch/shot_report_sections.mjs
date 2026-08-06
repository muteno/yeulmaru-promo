// [260807-9] 리포트 섹션을 그대로 PNG로 — 「전후는 링크 말고 이미지」 규칙 충족용
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname, dirname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.css':'text/css','.js':'text/javascript'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const PAGE = process.argv[2] || 'docs/reports/260807_결정대기_2건_전후.html';
const OUT  = process.argv[3] || (ROOT+'/docs/reports/');
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:1660,height:1200},deviceScaleFactor:2});
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname!=='app.local')return r.abort();
  const p=decodeURIComponent(u.pathname).replace(/^\//,'');
  try{ return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'}); }
  catch(e){ return r.fulfill({status:404,body:String(e)}); }});
await page.goto('https://app.local/'+PAGE,{waitUntil:'networkidle',timeout:30000});
await page.waitForTimeout(600);
// 3번째 인자 = "id:파일명,id:파일명" (생략 시 260807-9 기본값)
const PAIRS=(process.argv[4]||'d1:260807_결정1_2열임계_설명.png,d2:260807_결정2_오픈석잉크_설명.png').split(',').map(s=>s.split(':'));
for(const [id,name] of PAIRS){
  const el=await page.$('#'+id); if(!el){console.log('missing #'+id);continue;}
  await el.screenshot({path:join(OUT,name)});
  const bx=await el.boundingBox(); console.log(name, Math.round(bx.width)+'x'+Math.round(bx.height));
}
await b.close();
