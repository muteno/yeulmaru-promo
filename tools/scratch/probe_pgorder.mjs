#!/usr/bin/env node
// 프로그램 관리 나열 순서 — 전/후 실렌더 + 스샷.
// 「후」 = index.html 의 진짜 buildProgramListHtml 을 그대로 떼어 실행.
// 「전」 = 같은 함수에서 _pgSortRows 만 항등함수로 되돌린 상태(= 개정 직전 코드 경로와 동일).
// 표본 = 운영자 스크린샷 1~8행 그대로(창작 0 · 9행은 잘려 제외).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const SRC = readFileSync('/home/user/yeulmaru-promo/index.html', 'utf8');

// 최상위 function 한 개를 이름으로 떼어낸다(따옴표 안 중괄호 무시).
function grab(name) {
  const at = SRC.indexOf('\nfunction ' + name + '(');
  if (at < 0) throw new Error('not found: ' + name);
  // 따옴표·주석·정규식 리터럴을 건너뛰며 중괄호만 센다.
  //   주석 = 안의 따옴표(구 '전시' 등)에 안 속게 · 정규식 = /[<>&"']/g 의 따옴표와 /^(\d{4})/ 의 중괄호에 안 속게.
  const RE_PREV = '(,=:[!&|?+-*%~^{};\n';
  let i = SRC.indexOf('{', at), d = 0, q = null, prev = '';
  for (let j = i; j < SRC.length; j++) {
    const c = SRC[j];
    if (q) { if (c === '\\') j++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") { q = c; prev = c; continue; }
    if (c === '/' && SRC[j + 1] === '/') { j = SRC.indexOf('\n', j) - 1; continue; }
    if (c === '/' && RE_PREV.includes(prev)) {                       // 정규식 리터럴 — 끝 '/'까지 통째 skip
      for (let k = j + 1, cls = 0; k < SRC.length; k++) {
        if (SRC[k] === '\\') { k++; continue; }
        if (SRC[k] === '[') cls = 1; else if (SRC[k] === ']') cls = 0;
        else if (SRC[k] === '/' && !cls) { j = k; break; }
      }
      prev = '/'; continue;
    }
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return SRC.slice(at + 1, j + 1); }
    if (c.trim()) prev = c;
  }
  throw new Error('unbalanced: ' + name);
}

const FNS = ['escapeHtml', 'excelSerialToISO', 'excelDateDisplay', 'excelDateInputValue', 'isFlagOn',
  '_pgIsRentalRow', '_pgIsSyncRow', '_pgCatOrder', '_pgCatRank', '_pgSortRows',
  '_progSpanDays', '_progRounds', '_progRunTxt', 'buildProgramListHtml'];

// 운영자 스크린샷 실측 8행 (NO/구분/풀네임/줄임말/홍보/판매/진행/담당/장소)
const ROWS = [
  ['1', '공연', '2026 신년음악회', '신년음악회', '2025-12-01', '2026-01-08', '2026-01-09', '2026-01-09', '강명희', '대극장'],
  ['2', '공연', '뮤지컬 <미세스 다웃파이어>', '다웃파이어', '2025-12-01', '2026-01-23', '2026-01-24', '2026-01-25', '강명희', '대극장'],
  ['3', '전시', '어린이미술전 <우리 SUM 타볼래?>', '우리 SUM', '2026-02-27', '2026-06-28', '2026-02-27', '2026-06-28', '고아라', '7층 전시실'],
  ['4', '전시', "기획전시 '섬냥이 in 장도'", '섬냥이', '2026-03-27', '2026-06-21', '2026-03-27', '2026-06-21', '김해진', '장도 전시실'],
  ['5', '공연', '2026 브런치 콘서트 I <클래식과 함께 하는 미술관 여행 I>', '브런치 I', '2026-02-01', '2026-05-01', '2026-04-09', '2026-04-09', '강명희', '대극장'],
  ['6', '공연', '2026 실내악페스티벌 <실내악, 그 이상의 세계>', '실내악', '2026-02-01', '2026-05-02', '2026-04-16', '2026-04-19', '강명희', '대극장'],
  ['7', '공연', '김영욱×콜레기움 무지쿰 서울 <8 Seasons>', '김영욱', '2026-02-01', '2026-05-01', '2026-05-07', '2026-05-07', '이지은', '대극장'],
  ['8', '공연', '어린이 뮤지컬 <100층짜리 집>', '백층집', '2026-02-01', '2026-05-01', '2026-05-14', '2026-05-16', '강명희', '대극장'],
].map(r => ({
  NO: r[0], 콘텐츠구분: r[1], 풀네임: r[2], 줄임말: r[3],
  판매시작일: r[4], 판매종료일: r[5], 시작일: r[6], 종료일: r[7],
  담당자: r[8], 장소: r[9], 프로그램ID: 'P' + r[0], 장르: '', 회차: '',
  홍보시작일: '2026-01-01', 홍보노출: 'ON', _rowIndex: Number(r[0]) + 1,
}));

function render(sorted) {
  const ctx = vm.createContext({
    CONTENT_TYPES: ['공연', '전시', '예술교육', '대관', '기타'],
    GCAL_SYNC_RE: /^R\d{6}_[0-9a-z]{4}$/,
    _pgKind: '전체', _pgRentals: [], _pgRentalYear: 2026, _pgRentalErr: '',
    userRole: 'admin', _ldHtml: () => '', Date, Math, Number, String, isNaN, parseInt,
  });
  vm.runInContext(FNS.map(grab).join('\n'), ctx);
  if (!sorted) vm.runInContext('_pgSortRows=function(r){return (r||[]).slice();}', ctx);
  return vm.runInContext('buildProgramListHtml(ROWS)', Object.assign(ctx, { ROWS }));
}

const before = render(false), after = render(true);
const order = h => [...h.matchAll(/<td>(\d+)<\/td><td>(공연|전시|예술교육|대관|기타)<\/td>/g)].map(m => m[1] + m[2]);
console.log('전:', order(before).join(' '));
console.log('후:', order(after).join(' '));

const CSS = `*{box-sizing:border-box}
:root{--accent:#4A4DE7;--accent-light:#E8E8FD;--peach-text:#D88455;
--bg:linear-gradient(135deg,#FDF6F3 0%,#F0EBF5 50%,#EBF0F8 100%);--surface-solid:#fff;
--glass:rgba(255,255,255,0.55);--glass-surface:rgba(255,255,255,.78);--glass-bd:var(--glass);
--glass-shadow:0 8px 32px rgba(74,77,231,0.08),0 2px 8px rgba(0,0,0,0.04);
--border:rgba(0,0,0,0.09);--text:#1A1A2E;--dim:#888;--muted:#bbb;--neutral:#EEEDF3;--neutral-text:#6B6B7B;
--green:#1A6B3C;--danger:#E24B4A;--danger-btn:#E24B4A;--radius:16px;--radius-lg:20px}
body{margin:0;background:var(--bg);color:var(--text);font-family:'Pretendard',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;line-height:1.6}
.wrap{max-width:1180px;margin:0 auto;padding:26px 20px 60px}
.shot{background:var(--surface-solid);border-radius:var(--radius-lg);padding:22px 24px 26px;margin:0 0 20px}
.shot>h2{margin:0 0 14px;font-size:15px;font-weight:800}
.shot.b>h2{color:var(--danger-btn)}.shot.a>h2{color:var(--green)}
.shot>h2 small{display:block;font-size:11.5px;font-weight:600;color:var(--neutral-text);margin-top:3px}
.adm-tbl{width:100%;border-collapse:collapse;font-size:13px}
.adm-tbl thead th{background:var(--accent);padding:11px 10px;text-align:left;font-weight:700;border-bottom:none;font-size:12px;color:#fff;letter-spacing:0.5px;white-space:nowrap}
.adm-tbl thead th:first-child{border-radius:8px 0 0 0}
.adm-tbl thead th:last-child{border-radius:0 8px 0 0}
.adm-tbl tbody td{padding:10px;border-bottom:1px solid #f0f0f0;vertical-align:middle;text-align:left}
.adm-btn{padding:4px 10px;border:1px solid var(--accent);background:#fff;color:var(--accent);border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;margin-left:4px}
.adm-btn-del{border-color:var(--danger-btn);color:var(--danger-btn)}
.fbar-seg{display:flex;align-items:center;gap:6px;font-size:12px}
.fbar-seg .fbar-lbl{color:var(--neutral-text);font-weight:700;margin-right:4px}
.fbar-seg button{padding:5px 13px;border:1px solid var(--border);background:#fff;color:var(--neutral-text);border-radius:999px;font-size:12px;font-weight:700;cursor:pointer}
.fbar-seg button.on{background:var(--accent);border-color:var(--accent);color:#fff}
h3{font-size:17px;margin:0}
.mark{outline:2px solid var(--peach-text);outline-offset:-2px}`;

const page = (title, body) => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${title}</title><style>${CSS}</style></head><body><div class="wrap">${body}</div></body></html>`;

const half = (cls, head, sub, tbl) =>
  `<div class="shot ${cls}" id="shot-${cls}"><h2>${head}<small>${sub}</small></h2>${tbl}</div>`;

const B = half('b', '전 — 정렬 없음(시트 행 순서 그대로)', '공연 사이에 전시(NO 3·4)가 끼어 있다 = 운영자 스크린샷과 같은 상태', before);
const A = half('a', '후 — 구분 묶음 → 진행 시작일 오름차순', '공연 6건이 붙고(01-09 → 05-14) 전시 2건이 뒤로 모인다(02-27 → 03-27)', after);

const dir = '/home/user/yeulmaru-promo/docs/reports/';
writeFileSync('/tmp/pg_before.html', page('전', B));
writeFileSync('/tmp/pg_after.html', page('후', A));

const findChrome = () => {
  const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
};
const { chromium } = await import('playwright-core');
const br = await chromium.launch({ executablePath: findChrome(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const errs = [];
for (const [file, out, sel] of [['/tmp/pg_before.html', '260808_프로그램관리_나열순서_전.png', '#shot-b'],
                                ['/tmp/pg_after.html', '260808_프로그램관리_나열순서_후.png', '#shot-a']]) {
  const pg = await br.newPage({ viewport: { width: 1160, height: 800 }, deviceScaleFactor: 2 });
  pg.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await pg.goto('file://' + file, { waitUntil: 'load' });
  await (await pg.$(sel)).screenshot({ path: dir + out });
  console.log('shot', out);
  await pg.close();
}
await br.close();
console.log('PAGE ERRORS:', errs.length ? errs : 0);
writeFileSync(dir + '260808_프로그램관리_나열순서_전후.html',
  page('프로그램 관리 나열 순서 — 구분 묶음 + 일자 순 (260808)',
    `<h3 style="margin:0 0 4px">프로그램 관리 — 나열 순서 개정 전후</h3>
<p style="font-size:12.5px;color:var(--neutral-text);margin:0 0 18px">
표본 = 운영자 스크린샷 1~8행 실측(9행은 잘려 제외) · 화면 = <code>index.html buildProgramListHtml</code> 실코드를
그대로 떼어 헤드리스 렌더(<code>전</code> = 같은 함수에서 <code>_pgSortRows</code>만 항등으로 되돌린 개정 직전 경로).
실API·PII 미접촉.</p>${B}${A}
<div class="shot"><h2 style="color:var(--accent)">무엇이 바뀌었나</h2>
<ul style="font-size:13px;margin:0;padding-left:18px">
<li><b>NO는 시트(DB)에 박힌 값이 맞다</b> — 등록할 때 <code>max(NO)+1</code>로 찍히고, 목록은 그 <code>NO</code> 칸을 그대로 출력한다.</li>
<li>종전 나열 순서 = <b>정렬 코드 자체가 없었다</b>. Worker <code>handleGetSheet</code>가 시트 행 번호 순으로 주는 걸 그대로 뿌려서, 등록 순서(≒NO 순서)가 곧 화면 순서였다.</li>
<li>이제 <b>구분 묶음(콘텐츠 시트 순서: 공연→전시→예술교육→대관→기타) → 같은 구분 안 진행 시작일 오름차순</b>. 시작일 없는 행은 그 구분 맨 뒤(원래 순서 유지).</li>
<li>기획/대관 상위 축은 무접촉 — 「전체」 탭은 여전히 기획 전부 → 대관 전부 순이고, 대관 안에서도 같은 규칙으로 일자 정렬된다.</li>
<li>NO 칸은 이제 연속하지 않는다(1·2·5·6·7·8 → 3·4). 나열 축이 등록 순서가 아니라 구분·일자로 바뀐 결과다.</li>
</ul></div>`));
console.log('report written');
