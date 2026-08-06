// [260807-10] 배선 후 실화면 촬영 — ①폭별 전체 화면(2열 하한 검증) ②판매현황 상세 표(오픈석 잉크)
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const OUT=process.argv[2]||'/tmp/shots/';
async function shot(out,W,H,mode){
  const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
  const page=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:2});
  await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
    if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
      try{ return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'}); }
      catch(e){ return r.fulfill({status:500,body:String(e)}); }}
    if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
    return r.abort();});
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1800);
  await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(2600);
  const wide=await page.evaluate(`(typeof _bizBookWide==='function')?_bizBookWide():true`);
  if(wide){ try{ const SL=await page.evaluate(`_bizSlides().map(s=>s.p+(s.d?'d':''))`);
      const i=SL.findIndex(s=>s.startsWith('3')&&s.endsWith('d'));
      if(i>=0){ await page.evaluate(`_bizmTo(${i+1})`); await page.waitForTimeout(2400); } }catch(e){} }
  else { try{ await page.evaluate(`(function(){ if(window._bizmState)_bizmState.page=3; if(typeof _bizInlineRender==='function')_bizInlineRender(); })()`); }catch(e){}
    await page.waitForTimeout(2600); }
  if(mode==='full'){
    try{ await page.evaluate(`(function(){var t=[...document.querySelectorAll('table')].filter(x=>(x.innerText||'').indexOf('오픈석')>=0)[0]; if(t)t.scrollIntoView({block:'center'});})()`); await page.waitForTimeout(700); }catch(e){}
    await page.screenshot({path:out}); }
  else { const el=await page.evaluateHandle(()=>[...document.querySelectorAll('table')].filter(t=>(t.innerText||'').indexOf('오픈석')>=0)[0]).then(h=>h.asElement());
         if(el)await el.screenshot({path:out}); }
  console.log(out.split('/').pop().padEnd(28),'wide='+wide);
  await b.close();
}
await shot(OUT+'a_full_1201.png',1201,860,'full');
await shot(OUT+'a_full_1365.png',1365,860,'full');
await shot(OUT+'a_tbl_1920.png',1920,1080,'tbl');
