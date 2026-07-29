#!/usr/bin/env node
/* MISO 통짜 이식판 빌더 — index.html 원본 무변(사본 변환) + 데이터 내장 = 이관본/standalone.html
   운영자 요구(Q.26): 디자인·기능·버튼·출력·UIUX 전부 동일 작동. 원리 = 재구현이 아니라 이식:
   ① 원본 코드를 그대로 쓰고 ② 진입만 PIN(0510 슈퍼키)부터 ③ Worker API는 네트워크 우선,
   실패 시 내장 번들 폴백(온라인이면 실서버 CRUD까지 완전 동일, 오프라인이면 조회 동일+저장 안내).
   팀즈/MS 인증 의존 기능은 후순위(운영자 확정) — MSAL 자동 흐름은 공식 차단 스위치(_pinActive)로 봉인.
   사용: node tools/miso/build_db.mjs && node tools/miso/build_standalone.mjs
   ⚠️ 산출물 = 기계산출물(손편집 금지). 원본(index.html)을 고치고 재실행. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'index.html');
const DB = join(ROOT, '이관본', 'miso_db.json');
const OUT = join(ROOT, '이관본', 'standalone.html');
const HOLIDAYS = [join(ROOT, 'tools', 'miso', 'holidays_2026.json'), join(ROOT, 'tools', 'miso', 'holidays_2027.json')];

let html = readFileSync(SRC, 'utf8');
const db = JSON.parse(readFileSync(DB, 'utf8'));

// 이식판 데이터: 세션 감사 로그(Claude_Log)만 제외 — 나머지는 전부 내장(동일 작동)
delete db.datasets.Claude_Log;
db.holidays = {};
for (const p of HOLIDAYS) if (existsSync(p)) { const h = JSON.parse(readFileSync(p, 'utf8')); db.holidays[String(h.year)] = h; }
db.meta.standalone = { builtAt: new Date().toISOString(), note: 'MISO 이식판 — 기계산출물(손편집 금지)' };

function replaceOnce(name, from, to) {
  const n = html.split(from).length - 1;
  if (n !== 1) { console.error(`ABORT: 치환 [${name}] 매치 ${n}회(1회여야 함) — index.html 구조 변경 여부 확인`); process.exit(1); }
  html = html.replace(from, to);
}

// ── T1. 데이터 + pre-shim 주입(head 최상단, https 승격 스크립트보다 먼저)
const dbJson = JSON.stringify(db).replace(/<\//g, '<\\/');
const preShim = `<script id="miso-db" type="application/json">${dbJson}</script>
<script>/* MISO 이식판 pre-shim (기계산출물) — 진입 봉인 + API 네트워크우선/번들폴백 */
(function(){
  window._MISO=1; window._pinActive=true; /* _pinActive = initLoginScreen 공식 차단 스위치(원본 L3416) */
  var DB={}; try{ DB=JSON.parse(document.getElementById('miso-db').textContent); }catch(e){ console.error('[MISO] DB 파싱 실패',e); }
  window._MISO_DB=DB;
  var API_HOST='yeulmaru-promo-api.yeulmarumaster.workers.dev';
  var SLUG={platform:'platforms',content:'contents',manager:'managers',program:'programs',special:'special',applysettings:'applysettings',log:'logs'};
  function ds(n){ return (DB.datasets&&DB.datasets[n])||null; }
  function rowsIdx(n){ var d=ds(n); if(!d)return []; return d.rows.map(function(r,i){ var o={}; for(var k in r)o[k]=r[k]; o._rowIndex=i+2; return o; }); }
  function J(o,st){ return new Response(JSON.stringify(o),{status:st||200,headers:{'Content-Type':'application/json'}}); }
  function offline(u,method){
    try{
      var url=new URL(u,location.href), p=url.pathname, q=url.searchParams;
      if(method!=='GET'){
        if(p==='/api/presence'||p==='/api/memo')return J({ok:true});
        return J({error:'이식판 오프라인 — 저장은 서버 연결 시에만 가능합니다'},503);
      }
      if(p==='/api/records')return J({records:rowsIdx('records')});
      if(p==='/api/programs')return J({programs:(ds('programs')||{rows:[]}).rows});
      var m=p.match(/^\\/api\\/sheet\\/([^\\/]+)$/);
      if(m){ var n=SLUG[m[1]]||m[1], d=ds(n); if(!d)return J({headers:[],rows:[]}); return J({headers:d.headers,rows:rowsIdx(n)}); }
      if(p==='/api/ops'){
        var sh=q.get('sheet');
        if(!sh)return J({sheets:Object.keys(DB.datasets||{}).filter(function(k){return k.indexOf('ops_')===0;}).map(function(k){return {name:'운영_'+k.slice(4)};})});
        var map={'전시일일':'exhib_daily','전시마스터':'exhib_master'}, n2=map[sh]||('ops_'+sh), d2=ds(n2);
        if(!d2)return J({sheet:'운영_'+sh,headers:[],rows:[],count:0,note:'시트 없음 (미동기화)'});
        return J({sheet:'운영_'+sh,headers:d2.headers,rows:d2.rows,count:d2.rows.length});
      }
      if(p==='/api/holidays'){ var y=q.get('year'), H=(DB.holidays||{})[y]; return J(H||{year:+y,days:[]}); }
      if(p==='/api/config')return J({pets_visible:false,lock_minutes:240});
      if(p==='/api/messages')return J({messages:rowsIdx('messages')});
      if(p==='/api/lastmod')return J({lastModified:(DB.meta&&DB.meta.generatedAt)||'',eTag:'miso-standalone',serverTs:Date.now()});
      if(p==='/api/presence')return J({now:Date.now(),users:[]});
      if(p==='/api/memo')return J({user:q.get('user')||'',text:''});
      if(p==='/api/chatbot/faq')return J({faq:(ds('chatbot_faq')||{rows:[]}).rows});
      if(p==='/api/chatbot/rules')return J({rules:(ds('rules')||{rows:[]}).rows});
      if(p==='/api/qa')return J({qa:[]});
      if(p==='/api/diagrams')return J({diagrams:[]});
      if(p==='/api/health')return J({status:'ok',ts:Date.now()});
      return J({error:'이식판 미지원 경로: '+p},503);
    }catch(e){ return J({error:String(e)},500); }
  }
  var _f=window.fetch.bind(window);
  /* 오프라인 래치 — GET 연속 2회 실패하면 이후 GET은 즉시 번들(호출마다 5초 대기 방지). 60초마다 1회 재탐침해 서버가 살아나면 자동 복귀. */
  var _miss=0,_retryAt=0;
  window.fetch=function(input,init){
    var u=(typeof input==='string')?input:((input&&input.url)||'');
    if(u.indexOf(API_HOST)===-1)return _f(input,init);
    var method=((init&&init.method)||(input&&input.method)||'GET').toUpperCase();
    if(method==='GET'&&_miss>=2&&Date.now()<_retryAt)return Promise.resolve(offline(u,method));
    return new Promise(function(res){
      var done=false;
      /* GET = 5초 타임아웃 폴백 · 쓰기 = 실서버 응답만 신뢰(거부될 때만 폴백 — 이중 저장 방지) */
      var t=(method==='GET')?setTimeout(function(){ if(!done){done=true;_miss++;_retryAt=Date.now()+60000;res(offline(u,method));} },5000):null;
      _f(input,init).then(function(r){ if(done)return; done=true; if(t)clearTimeout(t); _miss=0; res(r); },
        function(){ if(done)return; done=true; if(t)clearTimeout(t); _miss++; _retryAt=Date.now()+60000; res(offline(u,method)); });
    });
  };
})();</script>
`;
replaceOnce('pre-shim 주입', '<meta charset="UTF-8">\n', '<meta charset="UTF-8">\n' + preShim);

// ── T2. https 강제 승격을 이식판에서 무효화(호스팅 환경 미지 — http 사내 호스팅도 허용)
replaceOnce('https 승격 조건화',
  `<script>if(location.protocol==='http:')location.replace(`,
  `<script>if(!window._MISO&&location.protocol==='http:')location.replace(`);

// ── T3. post-shim 주입(메인 스크립트 뒤) — PIN 0510 슈퍼키 게이트, 원본 함수·연출 재사용
const postShim = `<script>/* MISO 이식판 post-shim (기계산출물) — PIN 슈퍼키 진입(원본 UI·연출 재사용) */
(function(){
  if(!window._MISO)return;
  var SUPER='0510';
  window.tryLogin=async function(){
    try{
      var pin=Array.from(pins).map(function(p){return p.value;}).join('');
      if(pin.length!==4)return;
      var lm=document.getElementById('login-msg');
      if(pin===SUPER){
        try{ sessionStorage.setItem('pw','0510'); sessionStorage.setItem('role','user'); sessionStorage.setItem('myApplicant',''); sessionStorage.setItem('myUserDept',''); }catch(e){}
        password='0510'; userRole='user';
        try{
          var _pw=document.querySelector('.pin-wrap'), _rm=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
          if(_pw&&!_rm){
            pins.forEach(function(p){ clearTimeout(p._at); p.type='password'; p.classList.remove('lit','err'); p.classList.add('filled'); });
            if(typeof _pinFirstHintStop==='function')_pinFirstHintStop();
            _pw.classList.add('success'); setTimeout(function(){ _enterApp(); },780);
          } else { _enterApp(); }
        }catch(e){ _enterApp(); }
      } else {
        if(lm){ lm.classList.remove('lm-hint'); lm.textContent='PIN이 올바르지 않습니다'; }
        _pinClear(false); if(typeof _pinFocusFirst==='function')_pinFocusFirst();
      }
    }catch(e){ console.error('[MISO tryLogin]',e); }
  };
  try{ _loginEmail='MISO 이식판'; }catch(e){}
  if(!sessionStorage.getItem('pw')){ try{ _enterPinInputStep(); }catch(e){ console.error('[MISO enter]',e); } }
})();</script>
`;
replaceOnce('post-shim 주입', '</script>\n</body>\n</html>', '</script>\n' + postShim + '</body>\n</html>');

writeFileSync(OUT, html, 'utf8');
console.log(`✅ 이관본/standalone.html — ${(html.length / 1048576).toFixed(1)}MB (데이터셋 ${Object.keys(db.datasets).length}개 내장, 공휴일 ${Object.keys(db.holidays).join('/') || '없음'})`);
