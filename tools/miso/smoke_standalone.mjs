#!/usr/bin/env node
/* 이식판 스모크 — 이관본/standalone.html이 「PIN(0510)부터 시작 → 진입 → 오프라인(번들 폴백)
   상태에서 캘린더에 실데이터 렌더」를 만족하는지 헤드리스 실측.
   전제: ① node tools/miso/build_standalone.mjs 선실행 ② 로컬 HTTPS 서버가 레포 루트를 서빙
   사용: node tools/miso/smoke_standalone.mjs [https://127.0.0.1:8443/이관본/standalone.html]
   fail-soft: playwright-core/chromium 미비 = SKIP(rc 0) — 단정 실패만 rc 1 (레포 스모크 관례 계승) */
import { existsSync } from 'node:fs';

const URL_ = process.argv[2] || 'https://127.0.0.1:8443/' + encodeURIComponent('이관본') + '/standalone.html';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';

let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch { console.log('SKIP: playwright-core 없음'); process.exit(0); }
if (!existsSync(CHROME)) { console.log('SKIP: chromium 없음 (' + CHROME + ')'); process.exit(0); }

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
  const st = await page.evaluate(() => ({
    records: typeof records !== 'undefined' ? records.length : 0,
    perfs: typeof PERFS !== 'undefined' ? PERFS.length : 0,
    special: typeof PROMO_SPECIAL !== 'undefined' ? PROMO_SPECIAL.length : 0,
    bizHtml: (document.getElementById('biz-main') || { innerHTML: '' }).innerHTML.length,
    calHtml: (document.getElementById('cal') || { innerHTML: '' }).innerHTML.length,
    bodyLen: document.body.innerHTML.length,
  }));
  if (st.records < 500) fail.push('records 로드 부족: ' + st.records);
  if (st.perfs < 10) fail.push('PERFS 로드 부족: ' + st.perfs);
  if (st.special < 500) fail.push('특별일정 로드 부족: ' + st.special);
  if (st.bizHtml < 20000) fail.push('사업실적 본문 빈약: ' + st.bizHtml);
  if (st.calHtml < 5000) fail.push('캘린더 빈약: ' + st.calHtml);
  if (st.bodyLen < 500000) fail.push('본문 렌더 빈약: ' + st.bodyLen);
  // 5) JS 에러 0 (외부 리소스 차단 환경이라 네트워크 오류는 허용, pageerror만 계수)
  if (errors.length) fail.push('pageerror ' + errors.length + '건: ' + errors.slice(0, 3).join(' | '));
} catch (e) { fail.push('흐름 실패: ' + e.message); }
await browser.close();

if (fail.length) { console.error('❌ 이식판 스모크 실패:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('✅ 이식판 스모크 통과 — PIN 게이트→0510 진입→오프라인 번들 렌더 정상');
