#!/usr/bin/env node
// 고객 분류 표 개정(260812) 실측 검증 — 2단 머리 기하 · sticky · 칸 클릭 · CSV 값 · 홍보 표 회귀.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { URL as NodeURL } from 'node:url';
import { join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';
const PROMO_MOCK = readFileSync('/home/user/yeulmaru-promo/tools/scratch/_promo_mock.js', 'utf8');

const ROOT = '/home/user/yeulmaru-promo';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; }
  return null;
}
const fails = [], ok = [];
const T = (cond, msg) => (cond ? ok : fails).push(msg);

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).split('\n')[0]));
await page.route('**/*', route => {
  const u = new NodeURL(route.request().url());
  if (u.hostname === 'app.local') {
    let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
    try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
    catch { return route.fulfill({ status: 404, body: 'nf' }); }
  }
  if (u.hostname === 'cdn.plot.ly') { const c = join(ROOT, 'tools', 'vendor', 'plotly-basic-2.27.0.min.js'); if (existsSync(c)) return route.fulfill({ status: 200, body: readFileSync(c), contentType: 'text/javascript' }); }
  return route.abort();
});
await page.addInitScript(INIT_SCRIPT);
await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2200);
await page.evaluate(FEED_SCRIPT);
await page.waitForTimeout(300);

// ── 순수 함수 계약 (표기 정본) ────────────────────────────────────────────
const pure = await page.evaluate(`(()=>({
  man:[_segMan(3844200),_segMan(720000),_segMan(1),_segMan(10000),_segMan(0)],
  dayK:[_segDayK('20201016:1'),_segDayK('2020-10-16'),_segDayK('2020.10.16'),_segDayK(''),_segDayK('없음')],
  dayIso:[_segDayIso('20201016:1'),_segDayIso('2020-10-16')],
  sido:[_segSido('전남광주통합특별시'),_segSido('서울특별시'),_segSido('경기도'),_segSido('부산광역시'),_segSido('경상남도'),_segSido('제주특별자치도')],
  ph:[_segPhoneMask({'휴대폰정규화':'01088001299'}),_segPhoneFull({'휴대폰정규화':'01088001299'}),
      _segPhoneMask({'휴대폰정규화':'010-8800-1299'}),_segPhoneFull({'휴대폰정규화':'010-8800-1299'})]
}))()`);
console.log('pure =', JSON.stringify(pure, null, 1));
T(JSON.stringify(pure.man) === JSON.stringify([385, 72, 1, 1, 0]), '금액 만원 올림: 3,844,200→385 · 720,000→72 · 1원→1 · 10,000→1 · 0→0');
T(pure.dayK[0] === '20년 10월 16일' && pure.dayK[1] === '20년 10월 16일' && pure.dayK[2] === '20년 10월 16일', '날짜 3표기(20201016:·2020-10-16·2020.10.16) 모두 「20년 10월 16일」');
T(pure.dayK[3] === '' && pure.dayK[4] === '없음', '못 읽는 날짜는 원문 그대로(창작 0)');
T(pure.dayIso[0] === '2020-10-16' && pure.dayIso[1] === '2020-10-16', 'CSV 날짜 = ISO 정규화');
T(JSON.stringify(pure.sido) === JSON.stringify(['전남광주', '서울', '경기', '부산', '경남', '제주']), '시도 줄임말 6종');
T(pure.ph[0] === '010-****-1299' && pure.ph[1] === '010-8800-1299' && pure.ph[2] === '010-****-1299' && pure.ph[3] === '010-8800-1299', '휴대폰 가림/원본 (하이픈 유무 둘 다)');

// ── 고객 분류 표 ─────────────────────────────────────────────────────────
await page.evaluate(`openPromoCheck()`); await page.waitForTimeout(400);
await page.evaluate(`_pcTab('seg')`); await page.waitForTimeout(300);
await page.evaluate(`(function(){document.getElementById('seg-span').value='all';_segSpanToggle();document.getElementById('seg-min').value='1';})()`);
await page.evaluate(`_segRun()`); await page.waitForTimeout(800);

const geo = await page.evaluate(`(()=>{
  const t=document.querySelector('#seg-result table'), tr=[...t.tHead.rows];
  const r=e=>{const b=e.getBoundingClientRect();return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),h:+b.height.toFixed(1)};};
  const row1=[...tr[0].cells], row2=[...tr[1].cells];
  const span=row1.filter(c=>c.rowSpan===2), grp=row1.find(c=>c.colSpan===2);
  return {n1:row1.length,n2:row2.length,nSpan:span.length,
    grpTxt:grp?grp.textContent.trim():null, grpColspan:grp?grp.colSpan:0,
    grp:r(grp), sub:r(row2[0]), spanBox:r(span[0]),
    valign:getComputedStyle(span[0]).verticalAlign,
    stickyTop:[getComputedStyle(grp).top,getComputedStyle(row2[0]).top],
    pos:[getComputedStyle(grp).position,getComputedStyle(row2[0]).position],
    tdMid:(()=>{const td=t.tBodies[0].rows[0].cells[0];return r(td);})()};
})()`);
console.log('geo =', JSON.stringify(geo));
T(geo.n1 === 9 && geo.n2 === 2 && geo.nSpan === 8, '머리 2단 = 1행 9칸(rowspan2 8 + 묶음 1) · 2행 2칸');
T(geo.grpTxt === '관람(단위: 회)' && geo.grpColspan === 2, '묶음 머리 「관람(단위: 회)」 colspan 2');
T(geo.valign === 'middle', 'rowspan 2 칸 = 1+2행 높이의 한가운데 정렬(vertical-align:middle)');
T(Math.abs(geo.sub.t - geo.grp.b) <= 0.6, `2단 이음매 Δ${(geo.sub.t - geo.grp.b).toFixed(1)}px — 2행 상단 == 1행 하단`);
T(Math.abs(geo.spanBox.h - (geo.grp.h + geo.sub.h)) <= 0.6, `rowspan 칸 높이 == 1행+2행 합 (Δ${(geo.spanBox.h - geo.grp.h - geo.sub.h).toFixed(1)}px)`);
T(geo.stickyTop[0] === '0px' && geo.stickyTop[1] === geo.grp.h + 'px', `sticky 2단 top = 0px / ${geo.stickyTop[1]} (1행 실측 높이 ${geo.grp.h}px와 일치)`);

// 스크롤해도 머리 두 줄이 겹치지 않는가
const st = await page.evaluate(`(()=>{
  const box=document.querySelector('#seg-result table').parentElement; box.scrollTop=200;
  return new Promise(r=>setTimeout(()=>{
    const tr=[...document.querySelector('#seg-result table').tHead.rows];
    const g=tr[0].cells[3].getBoundingClientRect(), s=tr[1].cells[0].getBoundingClientRect();
    const bx=box.getBoundingClientRect();
    r({gap:+(s.top-g.bottom).toFixed(1), inBox:+(g.top-bx.top).toFixed(1)});
  },250));
})()`);
console.log('sticky scroll =', JSON.stringify(st));
T(Math.abs(st.gap) <= 0.6 && Math.abs(st.inBox) <= 1.5, `스크롤 중에도 머리 2단 이음매 Δ${st.gap}px · 상자 상단 밀착 Δ${st.inBox}px`);

// 칸 클릭 — 번호 열기 / 이력 펼치기
const tap = await page.evaluate(`(()=>{
  const rows=()=>[...document.querySelectorAll('#seg-result tbody tr')];
  const ph=rows()[0].cells[1], before=ph.textContent;
  ph.click(); const opened=ph.textContent;
  ph.click(); const closed=ph.textContent;
  const d=rows()[0].cells[7]; d.click();
  const hist=document.querySelector('#seg-result tr.seg-hist');
  const histTxt=hist?hist.textContent.trim():null, cs=hist?hist.cells[0].colSpan:0;
  rows()[2].cells[8].click();
  const only=document.querySelectorAll('#seg-result tr.seg-hist').length;
  return {before,opened,closed,cs,only,histHead:histTxt?histTxt.slice(0,40):null,prog:/프로그램명은 예매집계에 없어요/.test(histTxt||'')};
})()`);
console.log('tap =', JSON.stringify(tap));
T(/\*\*\*\*/.test(tap.before) && /^010-\d{4}-/.test(tap.opened) && tap.closed === tap.before, '휴대폰 칸 = 기본 가림 → 누르면 열림 → 다시 누르면 가림');
T(tap.cs === 10 && tap.only === 1, `관람 이력 = colspan ${tap.cs} · 동시 1개만(${tap.only}개)`);
T(tap.prog, '이력에 「프로그램명은 예매집계에 없어요」 한계 명시(없는 값 창작 0)');

// 필터·정렬 → CSV가 같은 것을 본다
const csv = await page.evaluate(`(()=>{
  _segLast.f={area:['서울 강남구']}; _segLast.sort={by:'amt',dir:'desc'}; _segRender();
  const view=_segLast._view;
  const screenNames=[...document.querySelectorAll('#seg-result tbody tr')].filter(r=>r.cells.length>2).map(r=>r.cells[0].textContent);
  const build=(mask)=>{_segLast.mask=mask;return view.map(x=>({p:mask?_segPhoneMask(x.m):_segPhoneFull(x.m),sido:x.m['주소1'],amt:x.rec.amt,d:_segDayIso(x.rec.first)}));};
  return {n:view.length,screenNames,viewNames:view.map(x=>x.m['이름']),
    masked:build(true)[0],raw:build(false)[0],
    dot:!!document.querySelector('#seg-result th[data-col="area"]').textContent.match(/●/),
    arrow:document.querySelector('#seg-result th[data-col="amt"]').textContent,
    resetBtn:!!document.evaluate("//button[contains(.,'필터·정렬 초기화')]",document,null,9,null).singleNodeValue};
})()`);
console.log('csv =', JSON.stringify(csv));
T(csv.n === 3 && JSON.stringify(csv.screenNames) === JSON.stringify(csv.viewNames), 'CSV가 쓰는 배열 == 화면에 그린 행(필터·정렬 반영)');
T(csv.masked.p.includes('****') && /^010-\d{4}-\d{4}$/.test(csv.raw.p), 'CSV 번호 = 체크에 따라 가림/원본');
T(csv.raw.sido === '전남광주통합특별시' || csv.raw.sido === '서울특별시', `CSV 시도 = 원 표기 그대로(${csv.raw.sido}) · 금액 원 단위(${csv.raw.amt})`);
T(csv.dot && /▼/.test(csv.arrow), '머리 표식 = 필터 걸린 열 ● · 정렬 중인 열 ▼');
T(csv.resetBtn, '「필터·정렬 초기화」 버튼 노출');

// 새 조회 = 필터 초기화
const reset = await page.evaluate(`(()=>{_segRun();return new Promise(r=>setTimeout(()=>r({f:Object.keys(_segLast.f).length,s:_segLast.sort.by,n:_segLast._view.length}),600));})()`);
console.log('reset =', JSON.stringify(reset));
T(reset.f === 0 && reset.s === '' && reset.n === 12, '새 조회 = 앞 조회의 열 필터·정렬을 물려받지 않는다');

// ── [260813] 연도 2자리 + 표 잡고 끌기 ────────────────────────────────────
const y2 = await page.evaluate(`(()=>({
  k:[_segDayK('20201016:1'),_segDayK('2020-10-16'),_segDayK('2026-01-05')],
  iso:_segDayIso('20201016:1'),
  ord:[_segKDayNum('20년 10월 16일'),_segKDayNum('25년 9월 3일'),_segKDayNum('2020년 10월 16일'),_segKDayNum('없음')]
}))()`);
console.log('y2 =', JSON.stringify(y2));
T(y2.k[0] === '20년 10월 16일' && y2.k[1] === '20년 10월 16일' && y2.k[2] === '26년 1월 5일', '화면 연도 = 뒤 2자리(20년 10월 16일)');
T(y2.iso === '2020-10-16', 'CSV 날짜는 네 자리 그대로(2020-10-16)');
T(y2.ord[0] === 20201016 && y2.ord[1] === 20250903 && y2.ord[2] === 20201016 && y2.ord[3] === 0, '필터 목록 날짜 정렬 키 = 2자리/4자리 둘 다 · 못 읽으면 0');

const pan = await page.evaluate(`(()=>{
  _segClear();
  document.getElementById('seg-result').style.width='520px';      // 좁은 창 재현 = 표(min-width 860)가 상자를 넘는다
  _segRender();
  const b2=document.getElementById('seg-scroll'); if(!b2)return {no:1};
  const over=b2.scrollWidth>b2.clientWidth+1;
  const cur0=b2.style.cursor;
  const pd=(t,x)=>{const e=new PointerEvent(t,{clientX:x,clientY:300,button:0,pointerId:1,pointerType:'mouse',bubbles:true});b2.dispatchEvent(e);};
  pd('pointerdown',900); pd('pointermove',898); const early=b2.scrollLeft;   // 2px = 아직 안 끈다
  pd('pointermove',700); const after=b2.scrollLeft;                          // 200px 끌기
  const curDrag=b2.style.cursor;
  pd('pointerup',700);
  // 끌고 난 직후의 click 한 번은 삼켜지나
  let fired=0; const th=document.querySelector('#seg-result th[data-col="name"]');
  const spy=()=>{fired++;}; th.addEventListener('click',spy);
  th.click(); const first=fired;
  th.click(); const second=fired;
  th.removeEventListener('click',spy);
  return {over,cur0,early,after,curDrag,curEnd:b2.style.cursor,first,second,pop:!!document.getElementById('colf-pop')};
})()`);
console.log('pan =', JSON.stringify(pan));
T(pan.over && pan.cur0 === 'grab', '숨은 열이 있으면 상자에 grab 커서');
T(pan.early === 0, '2px 흔들림은 끌기로 안 친다(오작동 방지 문턱 4px)');
T(pan.after === 200, `우측으로 당기면 표가 따라온다(scrollLeft ${pan.after}px)`);
T(pan.curDrag === 'grabbing' && pan.curEnd === 'grab', '끄는 중 grabbing → 떼면 grab 복귀');
T(pan.first === 0 && pan.second === 1, '끈 직후 click 1회는 삼키고, 그 다음 click은 정상 통과');

// ⚠ 이 표는 1500×1050 기본 창에서도 숨은 열이 있다(10열 · min-width 860 + 2단 머리) — 그래서 「넘치지 않는 상태」는
//   폭을 넉넉히 줘서 일부러 만든다. 안 그러면 「거짓말 0」 계약이 실제로 밟히는지 한 번도 못 잰다.
const noover = await page.evaluate(`(()=>{document.getElementById('seg-result').style.width='1600px';_segRender();const b=document.getElementById('seg-scroll');
  const r={over:b.scrollWidth>b.clientWidth+1, cur:b.style.cursor};
  document.getElementById('seg-result').style.width=''; _segRender(); return r;})()`);
console.log('noover =', JSON.stringify(noover));
T(!noover.over && !noover.cur, '숨은 열이 없으면 grab 커서를 안 붙인다(거짓말 0)');

// ── 회귀: 홍보 신청·확인 표의 엑셀식 컬럼 필터(같은 팝업 정본) ──────────────
await page.evaluate(PROMO_MOCK);
const promo = await page.evaluate(`(()=>{
  document.querySelectorAll('.modal-bg.show').forEach(e=>e.classList.remove('show'));
  openPromoBoard();
  return new Promise(r=>setTimeout(()=>{
    const th=document.querySelector('#promo-board th[data-col="platform"]');
    if(!th)return r({open:false});
    th.click();
    setTimeout(()=>{
      const pop=document.getElementById('colf-pop');
      const cbs=[...document.querySelectorAll('#colf-pop .colf-cb')];
      const first=cbs[0]?cbs[0].value:null;
      cbs.forEach((cb,i)=>cb.checked=(i===0));
      const btn=document.querySelector('#colf-pop button[onclick*="applyColFilter"]');
      if(btn)btn.click();
      setTimeout(()=>{
        r({open:true,pop:!!pop,nVals:cbs.length,first,
           applied:JSON.stringify(_promoFilter.colFilters),
           dot:!!(document.querySelector('#promo-board th[data-col="platform"]')||{textContent:''}).textContent.match(/●/),
           closed:!document.getElementById('colf-pop')});
      },400);
    },350);
  },1400));
})()`);
console.log('promo regression =', JSON.stringify(promo));
T(promo.open && promo.pop && promo.nVals > 0, `홍보 표 컬럼 머리 클릭 → 같은 팝업 열림(값 ${promo.nVals}개)`);
T(promo.applied && promo.applied.includes('platform') && promo.dot && promo.closed, '홍보 표 필터 적용 → colFilters 반영 · 머리 ● · 팝업 닫힘');
// 정렬 버튼 회귀
const psort = await page.evaluate(`(()=>{
  document.querySelector('#promo-board th[data-col="platform"]').click();
  return new Promise(r=>setTimeout(()=>{
    const b=document.querySelector('#colf-pop button[onclick*="desc"]'); if(b)b.click();
    setTimeout(()=>r({by:_promoFilter.sortBy,dir:_promoFilter.sortDir}),400);
  },350));
})()`);
console.log('promo sort =', JSON.stringify(psort));
T(psort.by === 'platform' && psort.dir === 'desc', '홍보 표 팝업 ▼ 내림차순 = sortBy/sortDir 반영');

console.log('\n── 결과 ──');
ok.forEach(s => console.log('  ✔ ' + s));
fails.forEach(s => console.log('  ✘ ' + s));
console.log('pageerror:', errs.length ? errs : 'none');
await browser.close();
process.exit(fails.length || errs.length ? 1 : 0);
