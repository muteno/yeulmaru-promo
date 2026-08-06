// [260807-10] 2열 임계 실측 — 폭을 훑으며 「우 열 안에서 표가 넘치는가」를 잰다(현행 코드 무패치).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');
const WIDTHS=(process.argv[2]||'1200,1201,1240,1270,1275,1278,1280,1281,1282,1285,1290,1300,1320').split(',').map(Number);
const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await b.newPage({viewport:{width:WIDTHS[0],height:900}});
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
  if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
    try{ return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'}); }
    catch(e){ return r.fulfill({status:500,body:String(e)}); }}
  if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
  return r.abort();});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
await page.waitForTimeout(1500);
await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(2400);
console.log('  W    wide  표폭   칸폭   넘침   제목칸  매출열');
for(const W of WIDTHS){
  await page.setViewportSize({width:W,height:900});
  await page.waitForTimeout(500);
  const wide=await page.evaluate(`(typeof _bizBookWide==='function')?_bizBookWide():null`);
  if(wide){ try{ const SL=await page.evaluate(`_bizSlides().map(s=>s.p+(s.d?'d':''))`);
      const i=SL.findIndex(s=>s.startsWith('3')&&s.endsWith('d'));
      if(i>=0){ await page.evaluate(`_bizmTo(${i+1})`); await page.waitForTimeout(1600); } }catch(e){} }
  else { try{ await page.evaluate(`(function(){ if(window._bizmState)_bizmState.page=3; if(typeof _bizInlineRender==='function')_bizInlineRender(); })()`); }catch(e){}
    await page.waitForTimeout(1600); }
  const m=await page.evaluate(()=>{
    const t=[...document.querySelectorAll('table')].filter(x=>(x.innerText||'').indexOf('오픈석')>=0)[0];
    if(!t)return null;
    let sc=t.parentElement; while(sc&&sc.scrollWidth<=sc.clientWidth&&sc!==document.body)sc=sc.parentElement;
    const box=t.parentElement;
    const tw=t.getBoundingClientRect().width, bw=box.clientWidth;
    const hd=[...t.querySelectorAll('thead td')];
    const nameTd=t.querySelector('tbody tr td:nth-child(2)');
    const rev=hd[6]?hd[6].getBoundingClientRect():null;
    const boxR=box.getBoundingClientRect();
    return { tw:Math.round(tw*10)/10, bw:Math.round(bw*10)/10,
             over:Math.round((box.scrollWidth-box.clientWidth)*10)/10,
             name:nameTd?Math.round(nameTd.getBoundingClientRect().width*10)/10:null,
             revVisible: rev? (rev.right<=boxR.right+0.5) : null };
  });
  if(!m){ console.log(String(W).padStart(5),' (표 없음)'); continue; }
  console.log(String(W).padStart(5), String(wide).padStart(6), String(m.tw).padStart(7), String(m.bw).padStart(6),
              String(m.over).padStart(6), String(m.name).padStart(8), String(m.revVisible).padStart(7));
}
await b.close();
