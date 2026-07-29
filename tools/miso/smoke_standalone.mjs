#!/usr/bin/env node
/* 이식판 스모크 — 이관본/standalone.html이 「PIN(0510)부터 시작 → 진입 → 오프라인(번들 폴백)
   상태에서 실데이터 렌더 + 단일파일 서빙 시 자산 404 없음」을 만족하는지 헤드리스 실측.
   ⚠️ MISO는 standalone.html 하나만 서빙한다 — 반드시 파일을 빈 디렉터리에 격리 복사해 서빙해야
   image/·data/ 형제 경로 404(로고 깨짐·교육기관 마커 소실)를 재현·검출한다(레포 루트 서빙은 이걸 놓침).
   전제: node tools/miso/build_standalone.mjs 선실행. 인자 없으면 격리 dir을 자동 생성해 8444로 서빙.
   fail-soft: playwright-core/chromium 미비 = SKIP(rc 0) — 단정 실패만 rc 1 (레포 스모크 관례 계승) */
import { existsSync, mkdtempSync, copyFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const SRC = join(process.cwd(), '이관본', 'standalone.html');

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('SKIP: playwright-core 없음'); process.exit(0); }
if (!existsSync(CHROME)) { console.log('SKIP: chromium 없음 (' + CHROME + ')'); process.exit(0); }
if (!existsSync(SRC)) { console.log('SKIP: 이관본/standalone.html 없음 (build 먼저)'); process.exit(0); }

// 격리 서빙 — 빈 dir에 standalone.html 하나만 두고 8444로 서빙(MISO 단일파일 서빙 재현)
const dir = mkdtempSync(join(tmpdir(), 'miso-smoke-'));
copyFileSync(SRC, join(dir, 'standalone.html'));
const four04 = [];
const srv = createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'standalone.html';
  const fp = join(dir, name);
  if (name === 'standalone.html' && existsSync(fp)) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(fp)); }
  else { four04.push(name); res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(8444, '127.0.0.1', r));
const URL_ = process.argv[2] || 'http://127.0.0.1:8444/standalone.html';

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-proxy-server', '--ignore-certificate-errors'] });
const page = await (await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));

let fail = [];
try {
  await page.goto(URL_, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // 1) 첫 화면 = PIN 입력(계정 단계 없음)
  await page.waitForSelector('#pin-step', { state: 'visible', timeout: 15000 });
  const acct = await page.$eval('#account-step', el => el.style.display).catch(() => 'none');
  if (acct !== 'none') fail.push('account-step이 보임(팀즈 단계가 떠 있음)');
  // 2) 오답 PIN → 에러 문구
  for (const d of '1111') await page.keyboard.type(d);
  await page.waitForTimeout(600);
  const msg = await page.$eval('#login-msg', el => el.textContent).catch(() => '');
  if (!/올바르지/.test(msg)) fail.push('오답 PIN 에러 문구 없음: "' + msg + '"');
  // 3) 0510 → 앱 진입
  for (const d of '0510') await page.keyboard.type(d);
  await page.waitForSelector('#app', { state: 'visible', timeout: 15000 });
  // 4) 데이터 렌더(오프라인 번들 폴백) — 기본 진입 = biz-mode(사업 실적) 실질 지표로 단정
  await page.waitForTimeout(9000); // 오프라인 래치 전환 + 렌더 여유
  // 값은 Worker 빈행 필터 미러 후 실측치(records 137·special 34·perfs 30) 기준 — 온라인과 동일해야 함
  const st = await page.evaluate(() => ({
    records: typeof records !== 'undefined' ? records.length : 0,
    perfs: typeof PERFS !== 'undefined' ? PERFS.length : 0,
    special: typeof PROMO_SPECIAL !== 'undefined' ? PROMO_SPECIAL.length : 0,
    edu: (window.EDU_INSTITUTIONS || []).length,
    brokenImg: Array.from(document.images).filter(i => i.complete && i.naturalWidth === 0 && i.style.display !== 'none').length,
    bizHtml: (document.getElementById('biz-main') || { innerHTML: '' }).innerHTML.length,
    calHtml: (document.getElementById('cal') || { innerHTML: '' }).innerHTML.length,
    bodyLen: document.body.innerHTML.length,
  }));
  if (st.records < 100) fail.push('records 로드 부족: ' + st.records + ' (기대 137)');
  if (st.perfs < 20) fail.push('PERFS 로드 부족: ' + st.perfs + ' (기대 30)');
  if (st.special < 20) fail.push('특별일정 로드 부족: ' + st.special + ' (기대 34)');
  if (st.edu < 499) fail.push('교육기관 마커 손실: ' + st.edu + ' (기대 499 — 번들 주입 실패)');
  if (st.brokenImg > 0) fail.push('깨진 이미지 ' + st.brokenImg + '개 (자산 인라인 누락)');
  if (st.bizHtml < 20000) fail.push('사업실적 본문 빈약: ' + st.bizHtml);
  if (st.calHtml < 5000) fail.push('캘린더 빈약: ' + st.calHtml);
  if (st.bodyLen < 500000) fail.push('본문 렌더 빈약: ' + st.bodyLen);
  // 5) 단일파일 서빙 404 — image/·data/ 형제 경로가 하나라도 요청되면 인라인 누락(apple-touch 등 비시각 제외)
  const bad404 = four04.filter(n => /^(image|data)\//.test(n) && !/apple-touch/.test(n));
  if (bad404.length) fail.push('자산 404 ' + bad404.length + '건: ' + bad404.slice(0, 5).join(', '));
  // 6) JS 에러 0
  if (errors.length) fail.push('pageerror ' + errors.length + '건: ' + errors.slice(0, 3).join(' | '));
} catch (e) { fail.push('흐름 실패: ' + e.message); }
await browser.close();
srv.close();

if (fail.length) { console.error('❌ 이식판 스모크 실패:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('✅ 이식판 스모크 통과 — PIN 게이트→0510 진입→오프라인 번들 렌더 정상');
