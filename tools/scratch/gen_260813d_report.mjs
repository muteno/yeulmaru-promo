// [260813-7] 전/후 보고서 — 일자 원천 사다리 · 「데이터 없음」 · 도착하면 자동으로 채워짐
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
const ROOT='/home/user/yeulmaru-promo';
const OUTF=join(ROOT,'docs','reports','260813_일자원천사다리_전후.html');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
const at=(rev,p)=>execFileSync('git',['-C',ROOT,'show',`${rev}:${p}`],{encoding:'utf8',maxBuffer:1<<28});
const OLD={'/index.html':at('HEAD','index.html')};
const exe=(()=>{const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;})();
const EXM=`(()=>{
  const iso=(m,d)=>'2025-'+('0'+m).slice(-2)+'-'+('0'+d).slice(-2);
  const mk=(nm,s,e,id)=>({'전시ID':id,'전시명':nm,'연도':'2025','상태':'종료','시작일':iso(s[0],s[1]),'종료일':iso(e[0],e[1]),
    '최종유료':'1200','최종총인원':'1500','목표관객':'2000','최종매출':'12000000','운영일수':'40'});
  return {sheet:'전시마스터',headers:[],rows:[
    mk('어린이 미술전 <냠냠>',[3,15],[6,29],'EX1'),
    mk('장도 기획전시 <HELLO, 고래야>',[7,5],[9,28],'EX2'),
    mk('금호 협력기획전',[10,2],[11,30],'EX3')]};
})()`;
const {chromium}=await import('playwright-core');
const br=await chromium.launch({executablePath:exe,headless:true,args:['--no-sandbox','--no-proxy-server']});
const shot={},snap={},err={};
const SNAP=`(()=>{
  const g=document.getElementById('bizov-chart');
  return {머리줄:(document.querySelector('#biz-main .bizm-card .ct')||{textContent:''}).textContent.replace(/\\s+/g,' ').trim(),
    막대:g?g.querySelectorAll('.barlayer .point').length:0,
    표:[...document.querySelectorAll('#sales-rail .bizm-card table tbody tr')].filter(t=>t.cells.length>=6)
       .map(t=>t.cells[0].textContent.trim()+'  ·  '+t.cells[1].textContent.trim().slice(0,24))};
})()`;
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
  const go=async(cat)=>{ await page.evaluate(`(()=>{ userRole='admin'; sessionStorage.setItem('isAcct','1'); _bizDeckGo('ov'); _bizOvYear=2025; _bizOvCat=${JSON.stringify(cat)}; _bizInlineRender(); _railYrmRender(); })()`).catch(()=>{}); await page.waitForTimeout(3000); };
  await go('전시');
  snap[tag+'없음']=await page.evaluate(SNAP);
  shot[tag+'없음']=(await page.screenshot({type:'jpeg',quality:82})).toString('base64');
  await page.evaluate(`(()=>{ if(typeof _anaState==='undefined'||!_anaState)_anaState={}; _anaState._exMaster=${EXM}; _anaState._exDaily={sheet:'전시일일',headers:[],rows:[]}; window._bizmExFail=0; })()`);
  await go('전시');
  snap[tag+'도착']=await page.evaluate(SNAP);
  shot[tag+'도착']=(await page.screenshot({type:'jpeg',quality:82})).toString('base64');
  err[tag]=es.length?es:0;
  await page.close();
}
await br.close();
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const rows=a=>(a||[]).map(x=>'<div><code>'+esc(x)+'</code></div>').join('');
writeFileSync(OUTF,`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>일자 원천 사다리 — 데이터 없음 · 도착하면 자동으로 (260813)</title>
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
pre{background:rgba(0,0,0,.035);padding:12px 14px;border-radius:10px;overflow-x:auto;font-size:12.5px;line-height:1.6;margin:10px 0 0}
.note{font-size:12px;color:var(--neutral-text);margin-top:10px;padding-left:14px;border-left:2px solid var(--accent-light)}
</style></head><body><div class="wrap">
<h1>일자 원천 사다리 — 「데이터 없음」 + 도착하면 자동으로 채워짐</h1>
<p class="lede">260813 · 운영자 「데이터를 가능한 끌어와보고 안 되는 건 데이터 없음으로 채우고 · 공연 기준으로 틀을 만들어 놓고 추후 데이터를 가져왔을 때 배선하기 쉽게」. pageerror 전/후 ${JSON.stringify(err.b)} / ${JSON.stringify(err.a)}.</p>

<h2><span class="no">①</span>원천을 표 한 곳에 세운다 — 늘릴 땐 한 칸만 더한다</h2>
<p class="why">사업비 원장엔 날짜 칸이 없다. 「이 사업이 어느 프로그램인가」를 이미 세워 둔 연결(<code>_finOf</code>)로 물어 그쪽 일자를 가져온다. 원천 목록은 <b>이 표 하나</b>고, 소비처(분야별 표·사업별 매출 차트)는 <code>_finDateOf</code>만 부른다.</p>
<div class="card"><pre>var _FIN_DATE_SRC=[
  {k:'공연', rows:function(year){ …운영대장 등록 공연… }},
  {k:'전시', rows:function(year){ return _bizExhibRows(year); }},
  {k:'교육', rows:function(year){ return _bizEduMonthRows(year); }}
];   // ← 새 원천은 여기 한 칸. {name, start, end} 셋만 맞추면 붙는다.</pre>
<p class="note">위에서부터 먼저 답하는 원천이 이긴다. 목록이 <code>null</code>이면 「아직 안 왔다」지 「없다」가 아니다 — 그 사업은 다음 칸(진행월)으로 내려가고, 데이터가 도착하면 그 면이 다시 그려진다.</p></div>

<h2><span class="no">②</span>못 찾은 일자 = 빈칸이 아니라 「데이터 없음」</h2>
<p class="why">2025 전시 · 원천이 아직 없는 상태. 빈칸으로 두면 「0일」인지 「모름」인지 사람이 못 가른다.</p>
<div class="card"><table><thead><tr><th>전</th><th>후</th></tr></thead><tbody>
<tr><td>${rows(snap['b없음'].표)}</td><td>${rows(snap['a없음'].표)}</td></tr>
</tbody></table>
<p class="note">차트 머리줄 — 전 <code>${esc(snap['b없음'].머리줄)}</code> / 후 <code>${esc(snap['a없음'].머리줄)}</code></p></div>

<h2><span class="no">③</span>원천이 도착하면 배선 없이 채워진다</h2>
<p class="why">전시마스터 3건을 넣은 순간 — 표의 「데이터 없음」이 실제 일자로 바뀌고, <b>차트에 전시 막대가 자동으로 서고</b>, 범례에 전시가 붙는다. 코드는 한 줄도 안 고쳤다.</p>
<div class="card"><table><thead><tr><th></th><th>원천 없음</th><th>전시마스터 3건 도착</th></tr></thead><tbody>
<tr><td>막대 수</td><td><code>${snap['a없음'].막대}</code></td><td><code>${snap['a도착'].막대}</code></td></tr>
<tr><td>머리줄</td><td><code>${esc(snap['a없음'].머리줄)}</code></td><td><code>${esc(snap['a도착'].머리줄)}</code></td></tr>
<tr><td>표</td><td>${rows(snap['a없음'].표)}</td><td>${rows(snap['a도착'].표)}</td></tr>
</tbody></table></div>

<h2><span class="no">④</span>화면 — 전시 원천 없음 / 도착</h2>
<div class="ba">
 <div class="card"><span class="tag b">원천 없음</span><img alt="없음" src="data:image/jpeg;base64,${shot['a없음']}"></div>
 <div class="card"><span class="tag a">전시마스터 도착</span><img alt="도착" src="data:image/jpeg;base64,${shot['a도착']}"></div>
</div>
</div></body></html>`);
console.log('→',OUTF,(readFileSync(OUTF).length/1048576).toFixed(2)+'MB');
console.log(JSON.stringify({없음:snap['a없음'].머리줄,도착:snap['a도착'].머리줄,막대:[snap['a없음'].막대,snap['a도착'].막대],err},null,1));
