// [260813-6] 전/후 보고서 — docs/reports/260813_사업개요_연도단일_일자순_전후.html
//   ① 연도 선택 = 그 해만(사업 결과 비교 형태) ② 분야별 표 = 공연 일자 순
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const OUTF=join(ROOT,'docs','reports','260813_사업개요_연도단일_일자순_전후.html');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const at=(rev,p)=>execFileSync('git',['-C',ROOT,'show',`${rev}:${p}`],{encoding:'utf8',maxBuffer:1<<28});
const OLD={'/index.html':at('HEAD','index.html')};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const OPS=`(()=>{
  const mk=(nm,m,d,paid,seat)=>({'공연명':nm,'년도':'2025','월':String(m),'일':String(d),
    '발권유료':String(paid),'기본좌석':String(seat),'공연구분':'기획','장르1':'클래식','회차':'1'});
  return {sheet:'세부운영관리대장(정리)',headers:[],rows:[
    mk('2025 신년음악회',1,10,464,900), mk('뮤지컬 <시카고>',2,14,540,900),
    mk('뮤지컬 <시카고>',2,16,510,900), mk('백건우와 모차르트',3,7,300,900)]};
})()`;
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const shot={},st={},mock={};
for(const old of [true,false]){
  const tag=old?'b':'a';
  const page=await br.newPage({viewport:{width:1440,height:790},deviceScaleFactor:1});
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
  const SNAP=`(()=>{
    const g=document.getElementById('bizov-chart');
    return {머리줄:(document.querySelector('#biz-main .bizm-card .ct')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim(),
      x축:g?[...g.querySelectorAll('.xaxislayer-above .xtick text')].map(t=>t.textContent.trim()):[],
      표머리:[...document.querySelectorAll('#sales-rail .bizm-card table thead td')].map(t=>t.textContent.trim().split('(')[0].trim()),
      표부제:(document.querySelector('#sales-rail .bizm-card .ct .sub')||{textContent:''}).textContent.trim(),
      표앞8:[...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6).slice(0,8)
             .map(t=>t.cells[0].textContent.trim()+' | '+t.cells[1].textContent.trim().slice(0,24))};
  })()`;
  for(const yr of [2026,2025]){
    await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('ov'); _bizOvYear=${yr}; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{});
    await page.waitForTimeout(3200);
    shot[tag+yr]=(await page.screenshot({type:'jpeg',quality:82})).toString('base64');
    st[tag+yr]=await page.evaluate(SNAP);
  }
  await page.evaluate(`(()=>{ _bizState.raw=${OPS}; _bizOvYear=2025; try{_finIdxClear();}catch(e){} _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{});
  await page.waitForTimeout(3200);
  mock[tag]=await page.evaluate(SNAP);
  st[tag+'err']=es.length?es:0;
  await page.close();
}
await br.close();
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const list=a=>a&&a.length?a.map(x=>'<code>'+esc(x)+'</code>').join(' · '):'<span class="ok">0건</span>';
const rows=a=>(a||[]).map(x=>'<div><code>'+esc(x)+'</code></div>').join('');
const pair=(no,yr)=>`<h2><span class="no">${no}</span>${yr}년 — 전 / 후</h2>
<div class="ba"><div class="card"><span class="tag b">전</span><img alt="${yr} 전" src="data:image/jpeg;base64,${shot['b'+yr]}"></div>
<div class="card"><span class="tag a">후</span><img alt="${yr} 후" src="data:image/jpeg;base64,${shot['a'+yr]}"></div></div>`;
writeFileSync(OUTF,`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>사업 개요 — 연도 단일 차트 · 공연 일자 순 (260813)</title>
<style>
:root{--accent:#4A4DE7;--accent-light:#E8E8FD;--peach-text:#D88455;--green:#1A6B3C;--text:#1A1A2E;
 --dim:#888;--neutral-text:#6B6B7B;--border:rgba(0,0,0,.09);--border2:rgba(0,0,0,.12);
 --bg:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);--surface:#fff;--radius:16px}
*{box-sizing:border-box}
body{margin:0;padding:34px 22px 70px;background:var(--bg);color:var(--text);
 font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic","맑은 고딕",sans-serif;line-height:1.65}
.wrap{max-width:1180px;margin:0 auto}
h1{font-size:23px;margin:0 0 6px;letter-spacing:-.3px}
.lede{color:var(--neutral-text);font-size:13.5px;margin:0 0 26px}
h2{font-size:16px;margin:38px 0 4px;padding-top:16px;border-top:1px solid var(--border2)}
h2 .no{color:var(--accent);font-weight:800;margin-right:7px}
.why{color:var(--neutral-text);font-size:12.5px;margin:0 0 14px}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:14px;box-shadow:0 8px 32px rgba(74,77,231,.07)}
.ba{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:900px){.ba{grid-template-columns:1fr}}
.tag{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.4px;padding:3px 10px;border-radius:999px;margin-bottom:9px}
.tag.b{background:rgba(0,0,0,.06);color:var(--neutral-text)}
.tag.a{background:var(--accent-light);color:var(--accent)}
img{width:100%;display:block;border-radius:10px;border:1px solid var(--border)}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:10px}
th,td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
th{color:var(--dim);font-size:11.5px;font-weight:600}
code{background:rgba(0,0,0,.04);padding:1px 6px;border-radius:5px;font-size:12px}
.ok{color:var(--green);font-weight:700}
.note{font-size:12px;color:var(--neutral-text);margin-top:10px;padding-left:14px;border-left:2px solid var(--accent-light)}
</style></head><body><div class="wrap">
<h1>사업 개요 — 연도 단일 차트 · 공연 일자 순</h1>
<p class="lede">260813 · 「전」 = 머지된 main · 「후」 = 이번 판. pageerror 전/후 ${JSON.stringify(st.berr)} / ${JSON.stringify(st.aerr)}.</p>

<h2><span class="no">①</span>차트 = 고른 해만 (판매현황 · 사업 결과 비교와 같은 형태)</h2>
<p class="why">구판은 2012~2026 열다섯 해를 한 판에 그려서 <b>연도 선택자가 차트에 아무 영향이 없었다</b>. 이제 「사업 결과 비교」의 정본 그림(1~12월 시간축 · 사업별 막대 · 막대 자리 = 공연 일자 · 색 = 분야)을 같은 함수(<code>_bizDrawSalesBars</code>)로 부른다.</p>
<div class="card"><table><thead><tr><th></th><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>x축 (2026)</td><td>${list(st.b2026.x축.slice(0,3).concat(['…']).concat(st.b2026.x축.slice(-2)))}</td><td>${list(st.a2026.x축.slice(0,3).concat(['…']).concat(st.a2026.x축.slice(-2)))}</td></tr>
<tr><td>카드 머리줄 (2026)</td><td>${esc(st.b2026.머리줄)}</td><td>${esc(st.a2026.머리줄)}</td></tr>
</tbody></table>
<p class="note">범례는 <b>실제로 막대가 선 분야만</b> 적는다. 전시·교육은 사업비 원장에 진행월이 없어 시간축에 세울 자리가 없다 — 그 건수는 머리줄에 「일자 미상 N건 제외」로 적고, 사업 자체는 오른쪽 분야별 표가 그대로 들고 있다.</p></div>

<h2><span class="no">②</span>분야별 표 = 공연 일자 순</h2>
<p class="why">「공연 NO를 대체해서 공연 일자로 나열」 — 첫 열이 일자가 되고 정렬도 일자 순. 일자는 <b>등록된 공연</b>에서 가져온다(사업비 원장엔 날짜가 없다). 못 이으면 원장이 아는 진행월을 그대로 적는다.</p>
<div class="card"><table><thead><tr><th></th><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>표 머리</td><td>${list(st.b2025.표머리)}</td><td>${list(st.a2025.표머리)}</td></tr>
<tr><td>카드 부제</td><td>${esc(st.b2025.표부제)}</td><td>${esc(st.a2025.표부제)}</td></tr>
<tr><td>앞 8줄 (2025)</td><td>${rows(st.b2025.표앞8)}</td><td>${rows(st.a2025.표앞8)}</td></tr>
</tbody></table></div>

<h2><span class="no">③</span>운영대장이 실리면 일자가 정확해진다</h2>
<p class="why">위 ②는 네트워크를 막은 실측이라 운영대장이 없다(= 진행월로 물러난 상태). 목 운영대장 4줄을 넣으면 그 공연들만 <code>M/D</code>로 바뀐다 — 회차가 여럿이면 <b>처음~마지막</b>(<code>2/14-16</code>).</p>
<div class="card"><table><thead><tr><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>${rows(mock.b.표앞8)}</td><td>${rows(mock.a.표앞8)}</td></tr>
</tbody></table></div>

${pair('④',2026)}
${pair('⑤',2025)}
</div></body></html>`);
console.log('→',OUTF,(readFileSync(OUTF).length/1048576).toFixed(2)+'MB');
console.log(JSON.stringify({b2026:st.b2026.머리줄,a2026:st.a2026.머리줄,표머리:[st.b2025.표머리,st.a2025.표머리],mock:mock.a.표앞8,err:[st.berr,st.aerr]},null,1));
