// [260807-6] 운영자 결정용 전후 비교 렌더 — ①1201~1281px 2열 넘침 띠 ②오픈석 잉크 --dim vs --neutral-text
//   ⚠ 「후보」 화면은 index.html을 **디스크에서 고치지 않고** 서빙 단계에서 문자열 치환해 그린다(작업트리 무접촉).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '/home/user/yeulmaru-promo/tools/qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
let exe=null; for(const d of readdirSync('/opt/pw-browsers')) if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join('/opt/pw-browsers',d,'chrome-linux','chrome'); if(existsSync(p))exe=p;}
const { chromium } = await import('playwright-core');

// patch: null | 'wide1281' | 'ink'
async function shot(out,W,H,patch,sel){
  const b=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
  const page=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:2});
  await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
    if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
      try{ let body=readFileSync(join(ROOT,p));
        if(p==='/index.html'&&patch){ let h=body.toString('utf8');
          if(patch==='wide1281'){ const a='function _bizBookWide(){ return window.innerWidth>1200; }';
            const m=h.match(/function _bizBookWide\(\)\{[^}]*\}/); if(!m)throw new Error('wide fn 미발견');
            h=h.replace(m[0],'function _bizBookWide(){ return window.innerWidth>1281; }'); }
          if(patch==='ink'){ const a="text-align:right;color:var(--dim);white-space:nowrap;font-variant-numeric:tabular-nums\">'+(g.seat>0";
            if(h.indexOf(a)<0)throw new Error('오픈석 셀 미발견');
            h=h.replace(a,a.replace('var(--dim)','var(--neutral-text)')); }
          body=Buffer.from(h,'utf8'); }
        return r.fulfill({status:200,body:body,contentType:MIME[extname(p)]||'application/octet-stream'});
      }catch(e){ return r.fulfill({status:500,body:String(e)}); }}
    if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js'); if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
    return r.abort();});
  await page.addInitScript(INIT_SCRIPT);
  await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded',timeout:30000});
  await page.waitForTimeout(1800);
  await page.evaluate(FEED_SCRIPT);
  await page.waitForTimeout(2600);
  const wide=await page.evaluate(`(typeof _bizBookWide==='function')?_bizBookWide():true`);
  if(wide){ try{ const SL=await page.evaluate(`_bizSlides().map(s=>s.p+(s.d?'d':''))`);
      const i=SL.findIndex(s=>s.startsWith('3')&&s.endsWith('d'));
      if(i>=0){ await page.evaluate(`_bizmTo(${i+1})`); await page.waitForTimeout(2400); } }catch(e){} }
  else { // 좁은 화면 한 열 = 3면을 현재 면으로 두고 인라인 렌더러 직접 호출(슬라이드 자리가 다르다)
    try{ await page.evaluate(`(function(){ if(window._bizmState)_bizmState.page=3; if(typeof _bizInlineRender==='function')_bizInlineRender(); })()`); }catch(e){}
    await page.waitForTimeout(2600); }
  const info=await page.evaluate(`(()=>{
    const tb=[...document.querySelectorAll('table')].filter(t=>(t.innerText||'').indexOf('오픈석')>=0)[0];
    if(!tb)return {err:'no table'};
    const sc=tb.parentElement;
    return {wide:(typeof _bizBookWide==='function')?_bizBookWide():null,
      tableW:+tb.getBoundingClientRect().width.toFixed(1), clientW:sc.clientWidth, scrollW:sc.scrollWidth,
      over:sc.scrollWidth-sc.clientWidth,
      hd:[...tb.querySelectorAll('thead td')].map(td=>td.innerText.split('\\n')[0]),
      nameW:+((tb.querySelector('tbody tr')||{}).children?[...tb.querySelectorAll('tbody tr')][0].children[1].getBoundingClientRect().width:0).toFixed(1)};
  })()`);
  const el=await page.$('#biz-main [data-bizmbox]');
  if(el)await el.screenshot({path:out}); else await page.screenshot({path:out});
  console.log(out.split('/').pop().padEnd(38), JSON.stringify(info));
  await b.close();
}
const S='/tmp/claude-0/-home-user-yeulmaru-promo/ddf38944-70fe-52fc-a89a-dabc42b51886/scratchpad/shots/';
await shot(S+'left_biz.png',1920,1080,null);
