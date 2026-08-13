// [260813-8] 고객 분석 빈 화면이 **왜** 비었는지 말하는가 — 네 갈래 실측(빈 시트·401·403·네트워크)
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const at=(rev,p)=>execFileSync('git',['-C',ROOT,'show',`${rev}:${p}`],{encoding:'utf8',maxBuffer:1<<28});
const OLD={'/index.html':at('HEAD','index.html')};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const CASES=[
  ['빈 시트',   `(()=>({rows:[],headers:[],note:'시트 0행'}))()`, null],
  ['401 만료',  null, '401 unauthorized'],
  ['403 권한',  null, '403 forbidden'],
  ['네트워크',  null, 'Failed to fetch'],
  ['정상',      `(()=>{ var r=[],SI=['전라남도','서울특별시'],GU=['여수시','강남구'];
      for(var i=0;i<60;i++)r.push({'이름':'회원'+i,'휴대폰정규화':'0101234'+(1000+i),'연령대':(20+(i%5)*10)+'대',
        '주소1':SI[i%2],'주소2':GU[i%2],'주소3':'동'+(i%7),'주소4':'','우편번호':'5960'+(i%9)});
      return {rows:r,headers:['이름','휴대폰정규화','연령대','주소1','주소2','주소3','주소4','우편번호']}; })()`, null],
];
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const out={};
for(const old of [true,false]){
  const tag=old?'전':'후';
  for(const [lab,ok,err] of CASES){
    const page=await br.newPage({viewport:{width:1600,height:900},deviceScaleFactor:1});
    const es=[];page.on('pageerror',e=>es.push(String(e&&e.message||e)));
    await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
      if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
      if(u.hostname!=='app.local')return r.abort();
      let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
      if(old&&OLD[p])return r.fulfill({status:200,body:OLD[p],contentType:'text/html; charset=utf-8'});
      try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}});
    await page.goto('https://app.local/index.html',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(5200);
    await page.evaluate(`(()=>{var t=document.getElementById('toast');if(t)t.className='toast';})()`);
    // api()를 회원 시트에서만 목으로 가로챈다 — 나머지 경로는 그대로
    await page.evaluate(`(()=>{
      window.userRole='admin';
      var _orig=window.api;
      window.api=function(m,u){
        if(String(u).indexOf('sheet=')>=0&&decodeURIComponent(String(u)).indexOf('회원')>=0){
          ${err?`return Promise.reject(new Error(${JSON.stringify(err)}));`:`return Promise.resolve(${ok});`}
        }
        return _orig.apply(this,arguments);
      };
      _memState=null; try{_memErr=null;}catch(e){}
    })()`);
    await page.evaluate(`(()=>{ _bizDeckGo('sales'); })()`).catch(()=>{});
    await page.waitForTimeout(2000);
    await page.evaluate(`(()=>{ _bizmTo(4); })()`).catch(()=>{});
    await page.waitForTimeout(3200);
    out[tag+'/'+lab]=await page.evaluate(`(()=>{
      var r=document.getElementById('rail-yrm');
      return {글자:(r?r.textContent:'').replace(/\\s+/g,' ').trim().slice(0,160),
              다시시도:!!(r&&[...r.querySelectorAll('button')].some(b=>b.textContent.trim()==='다시 시도'))};
    })()`);
    if(es.length)out[tag+'/'+lab].err=es.slice(0,2);
    await page.close();
  }
}
await br.close();
for(const k of Object.keys(out))console.log(k.padEnd(14), JSON.stringify(out[k]));
