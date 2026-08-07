#!/usr/bin/env node
// [260813] 고객 분류 자연어 조건 파서 + 새 엔진 축(전용·거주지·기간 지정) 실측.
//   LLM 왕복은 **API 경계에서 목**으로 세운다 — 여기서 재는 건 「앱이 조건을 올바로 만들고 폼에 채우고 계산하는가」다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT='/home/user/yeulmaru-promo';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jfif':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2'};
function fc(){const b=process.env.PLAYWRIGHT_BROWSERS_PATH||'/opt/pw-browsers';for(const d of readdirSync(b))if(d.startsWith('chromium-')&&!d.includes('headless')){const p=join(b,d,'chrome-linux','chrome');if(existsSync(p))return p;}return null;}
const fails=[],ok=[];const T=(c,m)=>(c?ok:fails).push(m);
const {chromium}=await import('playwright-core');
const browser=await chromium.launch({executablePath:fc(),headless:true,args:['--no-sandbox','--no-proxy-server']});
const page=await browser.newPage({viewport:{width:1500,height:1050}});
const errs=[];page.on('pageerror',e=>errs.push(String(e.message||e).split('\n')[0]));
await page.route('**/*',r=>{const u=new NodeURL(r.request().url());
 if(u.hostname==='app.local'){let p=decodeURIComponent(u.pathname);if(p==='/')p='/index.html';
  try{return r.fulfill({status:200,body:readFileSync(join(ROOT,p)),contentType:MIME[extname(p)]||'application/octet-stream'});}catch{return r.fulfill({status:404,body:'nf'});}}
 if(u.hostname==='cdn.plot.ly'){const c=join(ROOT,'tools','vendor','plotly-basic-2.27.0.min.js');if(existsSync(c))return r.fulfill({status:200,body:readFileSync(c),contentType:'text/javascript'});}
 return r.abort();});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin',{waitUntil:'domcontentloaded'});
await page.waitForTimeout(2200); await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(300);
await page.evaluate(`openPromoCheck()`); await page.waitForTimeout(400);
await page.evaluate(`_pcTab('seg')`); await page.waitForTimeout(400);
await page.evaluate(`(async()=>{await _bkLoad(false);await _memLoad(false);_segFillRegions();})()`); await page.waitForTimeout(600);

// ── ① 조건 스키마 정규화 ────────────────────────────────────────────────
const norm=await page.evaluate(`(()=>({
  bad:_segQNorm({span:'zzz',n:999,u:'x',thr:0,g:'없는장르',only:true}),
  onlyNeedsG:_segQNorm({g:null,only:true}).only,
  ok:_segQNorm({span:'range',from:'2023-01',to:'2024-12',g:'클래식',only:true,region:'여수시',thr:3})
}))()`);
console.log('norm =',JSON.stringify(norm));
T(norm.bad.span==='n'&&norm.bad.n===99&&norm.bad.u==='년'&&norm.bad.thr===1&&norm.bad.g===null,'조건 정규화 — 범위 밖·모르는 장르는 안전한 기본값으로');
T(norm.onlyNeedsG===false,'장르 없으면 「그 장르만」은 꺼진다(뜻이 없는 조건 차단)');
T(norm.ok.g==='클래식'&&norm.ok.only===true&&norm.ok.region==='여수시'&&norm.ok.thr===3,'정상 조건은 그대로 통과');

// ── ② 새 엔진 축 ───────────────────────────────────────────────────────
const eng=await page.evaluate(`(()=>{
  const by=_bkState.by,k=Object.keys(by);
  const rec=by[k[0]];
  const all=_bkCount(rec,null,null), cls=_bkCount(rec,null,'클래식'), oth=_bkCountOther(rec,null,'클래식');
  // 전용 조회 = 그 장르만 본 사람 수 ≤ 그 장르를 본 사람 수 (부분집합이어야 한다)
  _segCompute({span:'all',g:'클래식',thr:1}); const nAny=_segLast.rows.length;
  _segCompute({span:'all',g:'클래식',only:true,thr:1}); const nOnly=_segLast.rows.length, skipped=_segLast.notonly;
  const onlyOk=_segLast.rows.every(x=>_bkCountOther(x.rec,null,'클래식')===0);
  // 거주지
  const city=_segCities()[0];
  _segCompute({span:'all',thr:1,region:city}); const nReg=_segLast.rows.length, regOk=_segLast.rows.every(x=>_segRegionOf(x.m)===city);
  _segCompute({span:'all',thr:1}); const nAll=_segLast.rows.length;
  // 기간 지정
  const w=_bkWinRange('2024-01','2025-12');
  _segCompute({span:'range',from:'2024-01',to:'2025-12',thr:1}); const nRange=_segLast.rows.length;
  return {all,cls,oth,nAny,nOnly,skipped,onlyOk,city,nReg,regOk,nAll,winLabel:w&&w.label,nRange,label:_segQLabel({span:'range',from:'2024-01',to:'2025-12',g:'클래식',only:true,region:city,thr:3})};
})()`);
console.log('eng =',JSON.stringify(eng));
T(eng.oth===eng.all-eng.cls,`「다른 장르」 = 전체 − 그 장르 (${eng.all}−${eng.cls}=${eng.oth})`);
T(eng.nOnly<=eng.nAny&&eng.onlyOk,`「클래식만」 ${eng.nOnly}명 ⊆ 「클래식」 ${eng.nAny}명 · 전건 다른 장르 0회`);
T(eng.skipped>0,`「~만」에 걸려 빠진 사람 수를 세어 밝힌다(${eng.skipped}명)`);
T(eng.nReg<eng.nAll&&eng.regOk,`거주지 「${eng.city}」 ${eng.nReg}명 ⊂ 전체 ${eng.nAll}명 · 전건 그 지역`);
T(!!eng.winLabel&&eng.nRange>0,`기간 지정(달력) 창 = ${eng.winLabel} · ${eng.nRange}명`);
T(/여수|서울|광양|순천/.test(eng.label)&&eng.label.indexOf('클래식만')>=0,`조건 문장 한 벌 — "${eng.label}"`);

// ── ③ 자연어 로컬 해석(0초 · LLM 미호출) ─────────────────────────────────
const loc=await page.evaluate(`(()=>{
  const c=_segCities();
  const t=(s)=>{const r=_segParseLocal(s);return r?{q:r.q,why:r.why,label:_segQLabel(r.q)}:null;};
  return {a:t('3년간 클래식만 본 사람 3회 이상'),
          b:t('최근 3개월 클래식 예매한 사람 중 '+c[0]+' 거주자'),
          c:t('23~24년 뮤지컬 2회 이상'),
          d:t('안녕'), e:t('클래식'), cities:c.slice(0,4)};
})()`);
console.log('loc =',JSON.stringify(loc,null,1));
T(loc.a&&loc.a.q.g==='클래식'&&loc.a.q.only===true&&loc.a.q.thr===3&&loc.a.q.span==='n'&&loc.a.q.n===3,'「3년간 클래식만 본 사람 3회 이상」 → 기간3년·클래식·전용·3회');
T(loc.b&&loc.b.q.g==='클래식'&&loc.b.q.region===loc.cities[0]&&loc.b.q.u==='개월'&&loc.b.q.n===3,'「최근 3개월 클래식 … 거주자」 → 3개월·클래식·거주지');
T(loc.c&&loc.c.q.g==='뮤지컬'&&loc.c.q.thr===2&&loc.c.q.span==='range','「23~24년 뮤지컬 2회 이상」 → 구간·뮤지컬·2회');
T(loc.d===null&&loc.e===null,'축이 0~1개면 로컬이 「읽었다」고 하지 않는다 → LLM에 넘긴다');

// ── ④ PII 가드 ─────────────────────────────────────────────────────────
const guard=await page.evaluate(`(()=>({
  ok:[_segAiSafe('3년간 클래식 본 여수 사람'),_segAiSafe('20대 30명')],
  no:[_segAiSafe('010-8800-1299 이사람'),_segAiSafe('01088001299 조회'),_segAiSafe('010 8800 1299')]
}))()`);
console.log('guard =',JSON.stringify(guard));
T(guard.ok.every(Boolean)&&guard.no.every(v=>v===false),'전화번호가 섞이면 밖으로 안 보낸다(공개 저장소 경로 보호)');

// ── ⑤ LLM 왕복 — API 경계 목 ────────────────────────────────────────────
const ai=await page.evaluate(`(()=>{
  window.__disp=null; let polls=0;
  const real=window.api;
  window.api=async function(m,p,b){
    if(p==='/api/blog/dispatch'){window.__disp=b;return {ok:true};}
    if(p.indexOf('/api/blog/draft')===0){ polls++;
      if(polls<2)throw new Error('404 아직');
      return {ready:true,draft:{ok:true,cond:{span:'n',n:5,u:'년',g:'뮤지컬',only:true,region:_segCities()[0],thr:4}}}; }
    return real.apply(this,arguments);
  };
  document.getElementById('seg-nl').value='뮤지컬 외에는 안 본 사람 중에 5년 안에 네 번 넘게 온 사람';
  _segNlGo();
  return new Promise(r=>{
    const t0=Date.now();
    const iv=setInterval(()=>{
      const note=document.getElementById('seg-nl-note').textContent;
      if(note.indexOf('읽은 조건')>=0||note.indexOf('실패')>=0||Date.now()-t0>30000){
        clearInterval(iv); window.api=real;
        r({note, sent:window.__disp, polls,
           form:_segQFromForm(),   // [260814] 폼 상태 = 조건 객체 하나(_segQ) — select/input 6개가 문장 한 줄로 바뀌었다
           lastQ:_segLast&&_segLast.q});
      }
    },300);
  });
})()`);
console.log('ai =',JSON.stringify(ai,null,1));
T(ai.sent&&ai.sent.payload&&ai.sent.payload.segparse===1,'dispatch에 segparse=1로 나간다(예울이 채팅 분기와 분리)');
T(ai.sent&&!/\\d{10,}|010-/.test(JSON.stringify(ai.sent)),'나가는 payload에 개인 식별 문자열 0 — 질문 문장 + 값 목록뿐');
T(ai.polls>=2,`404(아직 안 나옴)는 계속 폴링한다(${ai.polls}회)`);
T(ai.form.g==='뮤지컬'&&ai.form.only===true&&ai.form.n===5&&ai.form.thr===4,'LLM 조건이 **폼에 채워진다** — 무엇으로 이해했는지 눈에 보인다');
T(ai.lastQ&&ai.lastQ.g==='뮤지컬'&&ai.lastQ.only===true,'그 조건 그대로 계산까지 이어진다');
T(ai.note.indexOf('읽은 조건')>=0,`해석 문장 표시 — "${ai.note.slice(0,60)}"`);

// ── ⑥ 예울이 채팅 ↔ 명단 같은 조건 ──────────────────────────────────────
const chat=await page.evaluate(`(()=>{
  // ① 「~만」을 채팅도 읽는가 (인원이 0이어도 조건 해석은 참이어야 한다)
  _bkAnswer('3년간 클래식만 본 사람 3회 이상 몇 명이야?');
  const askOnly=JSON.parse(JSON.stringify(_bkAsk));
  // ② 사람이 실제로 잡히는 질문에서 「명단 보기」가 뜨는가 — 0명일 땐 안 뜨는 게 맞다(빈 명단으로 넘기지 않는다)
  const txt=_bkAnswer('전 기간 클래식 2회 이상 본 사람 몇 명이야?');
  const ask=JSON.parse(JSON.stringify(_bkAsk));
  const n=(txt.match(/<b>([\\d,]+)명<\\/b>/)||[])[1];
  _segCompute(_bkAsk); const listN=_segLast.rows.length;
  const zero=_bkAnswer('3년간 클래식만 본 사람 9회 이상 몇 명이야?');
  return {n, ask, askOnly, listN, hasBtn:txt.indexOf('명단 보기')>=0,
          zeroBtn:zero.indexOf('명단 보기')>=0, label:_segQLabel(askOnly)};
})()`);
console.log('chat =',JSON.stringify(chat));
T(chat.askOnly&&chat.askOnly.g==='클래식'&&chat.askOnly.only===true&&chat.askOnly.thr===3,`채팅도 같은 파서를 쓴다 — 「~만」을 이제 읽는다("${chat.label}")`);
T(chat.hasBtn&&!chat.zeroBtn,'사람이 잡히면 「명단 보기」가 뜨고, 0명이면 안 뜬다(빈 명단으로 안 넘긴다)');
T(Number(String(chat.n).replace(/,/g,''))>=chat.listN,`채팅 인원 ${chat.n}명 ≥ 명단 ${chat.listN}명(명단은 회원 연결분만 = 하한)`);

console.log('\n── 결과 ──');
ok.forEach(s=>console.log('  ✔ '+s));
fails.forEach(s=>console.log('  ✘ '+s));
console.log('pageerror:',errs.length?errs:'none');
await browser.close();
process.exit(fails.length||errs.length?1:0);
