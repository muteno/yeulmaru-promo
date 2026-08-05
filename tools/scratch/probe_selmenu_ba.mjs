// [260805] 다중선택 중 우클릭 메뉴 — 전/후 촬영 + 메뉴 항목 DOM 실측.
// 하네스 골격 = smoke_layout.mjs 계승(가상호스트 서빙 + ?qa=admin 목데이터 · 실API·실데이터·PII 미접촉).
// 「전」 = 지정 리비전(기본 HEAD)의 index.html 을 그대로 서빙 = 같은 시나리오를 두 판본에서 돌린다.
// 실행: node tools/scratch/probe_selmenu_ba.mjs <출력디렉터리> [전_리비전]   (예: … docs/reports/x 1f56bc5)
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = process.argv[2] || join(ROOT, 'docs', 'reports', '260805_선택메뉴_전후');
mkdirSync(OUT, { recursive: true });
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const chrome = (() => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers'; for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; })();

// 목 records — 형태만 재현(8/6에 예정 3건 + 8/7 예정 1건 + 8/10 보류 1건 = 삭제가 뜨는 상태 확인용)
const MOCK = `(()=>{
  var recs=[],ri=100;
  function R(date,time,plat,title,st){ recs.push({_rowIndex:ri++, '날짜':date, '입력시간(KST)':date+' '+time,
    '프로그램':title, '콘텐츠 제목':title, '플랫폼 1':plat, '플랫폼 2':'-', '진행 상태':st, '신청자':'홍보팀', '임시저장':'N'}); }
  R('2026-08-06','14:00','카카오톡','티켓오픈 안내','예정');
  R('2026-08-06','14:30','카카오톡','티켓오픈 리마인드','예정');
  R('2026-08-06','15:00','인스타그램','티켓오픈 카드뉴스','예정');
  R('2026-08-07','11:00','블로그·맘카페','9월 공연 소개','예정');
  R('2026-08-10','10:00','인스타그램','보류된 카드뉴스','보류');
  records=recs;
  if(typeof renderCal==='function')renderCal();
  return records.length;
})()`;

// 메뉴 항목 실측 — 클릭 가능한 줄(.ccm-item)과 안내/머리 블록을 순서대로 뽑는다
const READ_MENU = `(()=>{ var m=document.getElementById('cell-context-menu'); if(!m)return null;
  return {items:[].map.call(m.querySelectorAll('.ccm-item'),function(e){return e.textContent.trim();}),
          lines:[].map.call(m.children,function(e){return (e.className||'div')+' | '+e.textContent.trim().replace(/\\s+/g,' ');}),
          rect:(function(r){return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};})(m.getBoundingClientRect())}; })()`;

async function shotMenu(page, file) {
  const r = await page.evaluate(`(()=>{var m=document.getElementById('cell-context-menu');if(!m)return null;var b=m.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height};})()`);
  if (!r) { console.log('  ⚠ 메뉴 없음 — 촬영 건너뜀:', file); return; }
  const pad = 14;
  await page.screenshot({ path: join(OUT, file), clip: { x: Math.max(0, r.x - pad), y: Math.max(0, r.y - pad), width: r.w + pad * 2, height: r.h + pad * 2 } });
}

const BEFORE_REF = process.argv[3] || 'HEAD';   // 변경 전 판본 = 이 리비전의 index.html
const beforeHtml = execFileSync('git', ['-C', ROOT, 'show', `${BEFORE_REF}:index.html`], { maxBuffer: 1 << 28 });
const afterHtml = readFileSync(join(ROOT, 'index.html'));

const browser = await chromium.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const report = {};
for (const [tag, html] of [['before', beforeHtml], ['after', afterHtml]]) {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.log(`  [${tag}] pageerror:`, e.message));
  await page.route('**/*', route => {
    const u = new NodeURL(route.request().url());
    if (u.hostname === 'app.local') {
      let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
      if (p === '/index.html') return route.fulfill({ status: 200, body: html, contentType: MIME['.html'] });
      try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); } catch { return route.fulfill({ status: 404, body: 'nf' }); }
    }
    return route.abort();
  });
  await page.goto('https://app.local/index.html?qa=admin#cal', { waitUntil: 'domcontentloaded', timeout: 30000 });   // #cal = 캘린더 화면 직행(QA 딥링크)
  await page.waitForTimeout(3000);
  console.log(`[${tag}] 목 records = ${await page.evaluate(MOCK)}건`);
  await page.waitForTimeout(400);
  report[tag] = {};

  // ① 선택 0 — 예정 블록 단건 우클릭(회귀 확인: 전/후 동일해야 한다)
  await page.click('.ev[data-ri="100"]', { button: 'right' });
  await page.waitForTimeout(250);
  report[tag].single = await page.evaluate(READ_MENU);
  await shotMenu(page, `${tag}_ctx_single.png`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ② 선택 3건 — 선택된 블록 우클릭 (시나리오마다 선택을 명시 세팅 = 두 판본에 같은 입력)
  await page.evaluate(`(()=>{ _evSel.clear(); [100,101,102].forEach(function(ri){_evSel.add(ri);}); _evSelPaint(); return _evSel.size; })()`);
  await page.waitForTimeout(200);
  await page.click('.ev[data-ri="100"]', { button: 'right' });
  await page.waitForTimeout(250);
  report[tag].sel3 = await page.evaluate(READ_MENU);
  await shotMenu(page, `${tag}_ctx_sel3.png`);
  // 캘린더 전체(선택 링 + 선택 바 + 메뉴)
  await page.screenshot({ path: join(OUT, `${tag}_ctx_sel3_full.png`), clip: { x: 0, y: 60, width: 1500, height: 720 } });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ③ 선택 3건 + 선택 **밖** 블록 우클릭(무간섭 확인)
  await page.evaluate(`(()=>{ _evSel.clear(); [100,101,102].forEach(function(ri){_evSel.add(ri);}); _evSelPaint(); return _evSel.size; })()`);
  await page.click('.ev[data-ri="103"]', { button: 'right' });
  await page.waitForTimeout(250);
  report[tag].outside = await page.evaluate(READ_MENU);
  await shotMenu(page, `${tag}_ctx_outside.png`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  // ④ 선택 3건 유지 + **보류 건**(삭제가 있는 상태)을 강제로 선택에 넣고 우클릭 = 상태별 분기 보존 확인
  await page.evaluate(`(()=>{ _evSel.clear(); [100,101,102].forEach(function(ri){_evSel.add(ri);}); _evSelPaint(); _evSel.add(104); return _evSel.size; })()`);
  await page.evaluate(`(()=>{ onEvContextMenu({preventDefault:function(){},stopPropagation:function(){},clientX:500,clientY:300},104,'2026-08-10'); })()`);
  await page.waitForTimeout(250);
  report[tag].hold = await page.evaluate(READ_MENU);
  await shotMenu(page, `${tag}_ctx_hold.png`);

  // ⑤ Esc 규약 — 1회 = 메뉴만 닫힘(선택 유지) · 2회 = 선택 해제
  await page.evaluate(`(()=>{ closeCellContextMenu(); _evSel.clear(); [100,101,102].forEach(function(ri){_evSel.add(ri);}); _evSelPaint(); })()`);
  await page.click('.ev[data-ri="100"]', { button: 'right' });
  await page.waitForTimeout(200);
  const escOpen = await page.evaluate(`(()=>({menu:!!document.getElementById('cell-context-menu'),sel:_evSel.size}))()`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const esc1 = await page.evaluate(`(()=>({menu:!!document.getElementById('cell-context-menu'),sel:_evSel.size}))()`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const esc2 = await page.evaluate(`(()=>({menu:!!document.getElementById('cell-context-menu'),sel:_evSel.size}))()`);
  report[tag].esc = { open: escOpen, esc1, esc2 };

  await page.close();
}
await browser.close();

for (const tag of ['before', 'after']) {
  console.log(`\n══ ${tag} ══`);
  for (const k of ['single', 'sel3', 'outside', 'hold']) {
    const r = report[tag][k];
    console.log(` ${k.padEnd(8)} : ${r ? r.items.join(' / ') : '(메뉴 없음)'}`);
    if(r&&r.lines.some(l=>l.startsWith('div |')))console.log(`          (머리/캡션: ${r.lines.filter(l=>l.startsWith('div |')).join(' ⟂ ')})`);
  }
  const e = report[tag].esc;
  if (e) console.log(` esc      : 메뉴 열림 선택 ${e.open.sel} → Esc1 메뉴=${e.esc1.menu} 선택 ${e.esc1.sel} → Esc2 메뉴=${e.esc2.menu} 선택 ${e.esc2.sel}`);
}
writeFileSync(join(OUT, '_measure.json'), JSON.stringify(report, null, 2));
console.log('\n출력 =', OUT);
