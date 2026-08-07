#!/usr/bin/env node
// [260814] 고객 분류 「조회가 제대로 안 된다」 — 재현 + 고친 뒤 실측.
//   ① 재현: 운영자 실사용 질문(휴대폰 끝자리)이 왜 전건 명단이 되는가 = 「해석 실패」가 조건 기본값으로 뭉개져
//      그대로 계산까지 흘러간다. 구판은 그걸 「읽은 조건」이라 부르고 조회까지 했다(실측 10,119명).
//   ② 고친 뒤: 못 다루는 축은 왕복 전에 말하고 / 아무 축도 안 좁힌 조건은 조회하지 않는다.
//   ③ 새 축(이상·이하 · 거주지 묶음)과 조건 문장 한 줄(변수 5개)이 실제로 도는가.
//   LLM은 API 경계에서 목 — 재는 대상은 「해석 실패가 어디로 흘러가는가」이지 모델 품질이 아니다.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const ROOT = '/home/user/yeulmaru-promo';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function fc() { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; }
const fails = [], ok = []; const T = (c, m) => (c ? ok : fails).push(m);
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: fc(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errs = []; page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.route('**/*', r => {
  const u = new NodeURL(r.request().url());
  if (u.hostname === 'app.local') { let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return r.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); } catch { return r.fulfill({ status: 404, body: 'nf' }); } }
  if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return r.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
  return r.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2200); await page.evaluate(FEED_SCRIPT); await page.waitForTimeout(300);
await page.evaluate(`openPromoCheck()`); await page.waitForTimeout(400);
await page.evaluate(`_pcTab('seg')`); await page.waitForTimeout(400);
await page.evaluate(`(async()=>{await _bkLoad(false);await _memLoad(false);_segFillRegions();})()`); await page.waitForTimeout(600);

// ── ① 재현 — 「아무 축도 안 좁힌 조건」은 전건이다 ────────────────────────
const rep = await page.evaluate(`(()=>{
  const blank=_segQNorm({span:'all',thr:1});
  _segCompute(blank); const n=_segLast.rows.length;
  const total=Object.keys(_bkState.by).length;
  return {label:_segQLabel(blank),n,total,isBlank:_segQBlank(blank),
    notBlank:[_segQBlank({span:'all',thr:2}),_segQBlank({span:'all',g:'클래식',thr:1}),_segQBlank({span:'n',n:3,thr:1}),_segQBlank({span:'all',region:'여수시',thr:1})]};
})()`);
console.log('재현 =', JSON.stringify(rep));
T(rep.n === rep.total, `전 기간·전 장르·1회 이상 = 전건(${rep.n}/${rep.total}명) — 이 조건이 「읽은 조건」으로 통과하면 안 된다`);
T(rep.isBlank === true, '_segQBlank가 그 조건을 「안 좁힌 조건」으로 잡는다');
T(rep.notBlank.every(v => v === false), '축이 하나라도 좁혀지면 blank가 아니다(2회 이상·장르·기간·거주지 4종)');

// ── ② 없는 축을 짚은 질문 = 왕복 전에 그 자리에서 말한다 ─────────────────
const noax = await page.evaluate(`(()=>({
  phone:_segNoAxis('0789 끝자리인 번호로 예매한 이력을 확인해줘'),
  age:_segNoAxis('20대 고객 뽑아줘'), amt:_segNoAxis('금액 많이 쓴 사람'),
  none:_segNoAxis('3년 이내 클래식 5회 이상 본 여수 사람')
}))()`);
console.log('없는 축 =', JSON.stringify(noax));
T(noax.phone === '휴대폰 번호', '「끝자리 번호로…」 = 휴대폰 번호 축(이 도구에 없음)으로 잡힌다');
T(noax.age === '연령대' && noax.amt === '구매 금액', '연령·금액도 없는 축으로 잡힌다');
T(noax.none === null, '정상 조건 질문은 안 걸린다(오탐 0)');

const run1 = await page.evaluate(`(async()=>{
  _segLast=null; document.getElementById('seg-nl').value='0789 끝자리인 번호로 예매한 이력을 확인해줘';
  let dispatched=0; const real=window.api;
  window.api=async(m,u,b)=>{ if(String(u).indexOf('/api/blog/dispatch')>=0)dispatched++; return real(m,u,b); };
  await _segNlGo(); window.api=real;
  return {note:document.getElementById('seg-nl-note').textContent, ran:!!_segLast, dispatched};
})()`);
console.log('run1 =', JSON.stringify(run1));
T(/못 걸러요/.test(run1.note) && /휴대폰 번호/.test(run1.note), `없는 축은 그 자리에서 말한다 — "${run1.note.slice(0, 48)}…"`);
T(run1.ran === false, '**조회를 안 한다** — 구판은 여기서 전건 명단을 그렸다');
T(run1.dispatched === 0, '예울이(Actions)에 안 보낸다 — 30초~2분 기다려도 답이 없는 축이다');

// ── ③ 예울이가 기본값만 돌려준 경우 = 「못 찾았다」로 끝난다 ──────────────
const run2 = await page.evaluate(`(async()=>{
  _segLast=null; document.getElementById('seg-nl').value='우리 공연 자주 오는 그 분들 있잖아 그거';
  const real=window.api;
  window.api=async(m,u,b)=>{ if(String(u).indexOf('/api/blog/dispatch')>=0)return {ok:true};
    if(String(u).indexOf('/api/blog/draft')>=0)return {ready:true,draft:{ok:true,cond:{span:'all',thr:1}}};
    return real(m,u,b); };
  await _segNlGo(); window.api=real;
  return {note:document.getElementById('seg-nl-note').textContent, ran:!!_segLast};
})()`);
console.log('run2 =', JSON.stringify(run2));
T(/조건을 못 찾았어요/.test(run2.note), `기본값만 온 해석 = 「못 찾았다」로 말한다 — "${run2.note.slice(0, 44)}…"`);
T(run2.ran === false, '그 경우에도 조회를 안 한다(전건 방지)');

const run3 = await page.evaluate(`(async()=>{
  _segLast=null; document.getElementById('seg-nl').value='우리 공연 자주 오는 그 분들 있잖아 그거';
  const real=window.api;
  window.api=async(m,u,b)=>{ if(String(u).indexOf('/api/blog/dispatch')>=0)return {ok:true};
    if(String(u).indexOf('/api/blog/draft')>=0)return {ready:true,draft:{ok:true,cond:{ok:false,why:'휴대폰 번호로는 못 찾아요'}}};
    return real(m,u,b); };
  await _segNlGo(); window.api=real;
  return {note:document.getElementById('seg-nl-note').textContent, ran:!!_segLast};
})()`);
console.log('run3 =', JSON.stringify(run3));
T(/해석 실패/.test(run3.note) && /못 찾아요/.test(run3.note), '모델이 {ok:false}로 답하면 그 사유를 그대로 보여준다');
T(run3.ran === false, '그 경우에도 조회 0');

// ── ④ 새 축 — 이상/이하 · 거주지 묶음 ────────────────────────────────────
const ax = await page.evaluate(`(()=>{
  _segCompute({span:'all',thr:3}); const gte=_segLast.rows.length, gteOk=_segLast.rows.every(x=>x.c>=3);
  _segCompute({span:'all',thr:3,op:'lte'}); const lte=_segLast.rows.length, lteOk=_segLast.rows.every(x=>x.c>=1&&x.c<=3);
  _segCompute({span:'all',thr:1}); const all=_segLast.rows.length;
  const cities=['여수시','순천시','광양시'].map(c=>{_segCompute({span:'all',thr:1,region:c});return _segLast.rows.length;});
  _segCompute({span:'all',thr:1,region:'@ysgy'}); const grp=_segLast.rows.length;
  const grpOk=_segLast.rows.every(x=>['여수시','순천시','광양시'].indexOf(_segRegionOf(x.m))>=0);
  _segCompute({span:'all',thr:1,region:'@nope'}); const bad=_segLast.rows.length;
  return {gte,gteOk,lte,lteOk,all,cities,grp,grpOk,bad,
    label:_segQLabel({span:'all',thr:3,op:'lte',region:'@capi'}), tally:_segRegionTally()['@ysgy'],
    gtally:_segGenreTally(null)};
})()`);
console.log('축 =', JSON.stringify(ax));
T(ax.lteOk && ax.lte >= 1, `「N회 이하」 = 1회 이상 N회 이하(${ax.lte}명 전건 1~3회) — 안 본 사람은 안 들어온다`);
T(ax.gte + ax.lte >= ax.all && ax.gteOk, `이상(${ax.gte}) + 이하(${ax.lte}) ≥ 전체(${ax.all}) — 경계값(3회)만 겹친다`);
T(ax.grp === ax.cities.reduce((a, b) => a + b, 0) && ax.grpOk, `묶음 「여수·순천·광양」 ${ax.grp}명 = ${ax.cities.join('+')} · 전건 그 세 시`);
T(ax.bad === ax.all, '모르는 묶음 키는 조건 없음으로 떨어진다(있는 척 0)');
T(/이하/.test(ax.label) && /수도권/.test(ax.label), `조건 문장이 새 축을 말한다 — "${ax.label}"`);
T(ax.tally === ax.grp, `목록에 뜨는 회원 수(${ax.tally})가 실제 조회 인원과 같은 축을 센다`);

// ── ⑤ 조건 문장 = 변수 5개 · 한 줄 · 눌러서 바뀐다 ───────────────────────
const line = await page.evaluate(`(()=>{
  const c=document.getElementById('seg-cond'); const toks=[...c.querySelectorAll('.ry-yr-tg')];
  // 「한 줄인가」 = 자식 상자들의 **합집합 높이**가 가장 큰 자식 높이와 같은가(접히면 두 배가 된다).
  //   ⚠ top만 모아 세면 안 된다 — align-items:center라 높이가 다른 자식은 같은 줄에서도 top이 다르다.
  const rs=[...c.children].map(e=>e.getBoundingClientRect());
  const uni=Math.max(...rs.map(r=>r.bottom))-Math.min(...rs.map(r=>r.top)), tall=Math.max(...rs.map(r=>r.height));
  const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  const ink=toks.map(t=>getComputedStyle(t).color);
  return {n:toks.length, keys:toks.map(t=>t.dataset.k), uni:+uni.toFixed(1), tall:+tall.toFixed(1), rows:(uni<=tall+1?1:2), ink:[...new Set(ink)], accent,
    txt:c.textContent.replace(/\\s+/g,' ').trim(), sel:!!document.querySelector('#seg-cond select,#seg-cond input')};
})()`);
console.log('문장 =', JSON.stringify(line));
T(line.n === 5 && line.keys.join(',') === 'span,genre,thr,op,region', '변수 5개 = 기간·장르·횟수·이상/이하·거주지(운영자 지목 그대로)');
T(line.rows === 1, `조건 줄이 **한 줄**이다(운영자 「1줄로 말끔히」) — 합집합 높이 ${line.uni}px ≤ 가장 큰 자식 ${line.tall}px`);
T(line.ink.length === 1, `변수 잉크 한 갈래 = 강조색 ${line.ink[0]}`);
T(line.sel === false, '조건 줄에 select/input 0 — 문장 자체가 폼이다(운영자 「알약 안에 안 넣을게」)');

const clicked = await page.evaluate(`(async()=>{
  _segCompute({span:'all',thr:1}); _segRender();
  const before=_segLast.rows.length;
  document.querySelector('#seg-cond .ry-yr-tg[data-k="region"]').click();
  await new Promise(r=>setTimeout(r,120));
  const items=[...document.querySelectorAll('#dd-pop button')].map(b=>b.textContent.replace(/[0-9,]+명$/,'').trim());
  const y=[...document.querySelectorAll('#dd-pop button')].find(b=>b.textContent.indexOf('여수시')===0);
  y.click(); await new Promise(r=>setTimeout(r,600));
  return {before, after:_segLast.rows.length, txt:document.getElementById('seg-cond').textContent.replace(/\\s+/g,' ').trim(),
    items, open:!!document.getElementById('dd-pop')};
})()`);
console.log('클릭 =', JSON.stringify(clicked));
T(/여수시/.test(clicked.txt), `누르면 문장이 바뀐다 — "${clicked.txt.slice(0, 46)}…"`);
T(clicked.after < clicked.before, `바뀐 조건으로 **그 자리에서 다시 센다**(${clicked.before} → ${clicked.after}명)`);
T(clicked.open === false, '고르면 목록이 닫힌다(_ddOpen 동시 1개 규약)');
const want = ['거주지 전체', '여수시', '순천시', '광양시', '여수·순천·광양', '전남·광주', '수도권(서울·경기·인천)', '영·호남', '기타 광역시'];
T(want.every(w => clicked.items.indexOf(w) >= 0), '거주지 후보 = 운영자가 준 목록 그대로 ' + JSON.stringify(want));

console.log('\n── 결과 ──');
ok.forEach(m => console.log('  ✔ ' + m));
fails.forEach(m => console.log('  ✘ ' + m));
console.log('pageerror:', errs.length ? errs : 'none');
await browser.close();
process.exit(fails.length || errs.length ? 1 : 0);
