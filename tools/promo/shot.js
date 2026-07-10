#!/usr/bin/env node
// 홍보 산출물 렌더러 — 템플릿 HTML에 브랜드 토큰(index.html :root)을 주입해 @2x PNG로 뽑는다.
// 사용: node shot.js <템플릿.html> [출력.png] [--width=816]
// 규칙: 값 SSOT = index.html :root 2블록을 렌더 시 자동 주입(제1 절대명령 계승 강제).
//       템플릿에는 토큰 사본·raw 색을 두지 않는다 — var()만. 단독 오픈 시 무색 = 정상.
// 환경(최초 1회): 이 폴더에서 npm i  ·  한글 폰트 apt-get install -y fonts-noto-cjk
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dir = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
    if (dir) {
      const p = path.join(base, dir, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* 아래 공통 에러로 */ }
  return null;
}

(async () => {
  const flags = {};
  const pos = [];
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--(\w+)=(.+)$/);
    if (m) flags[m[1]] = m[2]; else pos.push(a);
  }
  if (!pos[0]) {
    console.error('사용: node shot.js <템플릿.html> [출력.png] [--width=816]');
    process.exit(1);
  }
  const tplPath = path.resolve(pos[0]);
  const width = parseInt(flags.width || '816', 10);
  const outPath = path.resolve(pos[1] || path.join(__dirname, 'out', path.basename(tplPath, '.html') + '.png'));

  // 값 SSOT 주입분 추출 — 실패 = 즉시 중단(사본 폴백 금지)
  const indexPath = path.resolve(__dirname, '../../index.html');
  const tokens = (fs.readFileSync(indexPath, 'utf8').match(/:root\s*\{[^}]*\}/g) || []).join('\n');
  if (!tokens) {
    console.error('index.html에서 :root 블록을 못 찾음 — 값 SSOT 확인 필요');
    process.exit(1);
  }

  const exe = findChromium();
  if (!exe) {
    console.error('크로미움 실행 파일을 못 찾음 — CHROMIUM_PATH=/경로/chrome 으로 지정');
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu'] });
  let fail = null;
  try {
    // 초기 높이는 최소로 — fullPage가 콘텐츠 높이만큼 찍는다(템플릿에 vh 금지 전제)
    const page = await browser.newPage({ viewport: { width, height: 200 }, deviceScaleFactor: 2 });
    let jsErr = null;
    page.on('pageerror', e => { jsErr = jsErr || e; });
    await page.goto('file://' + tplPath);
    await page.addStyleTag({ content: tokens });
    await page.evaluate(() => document.fonts.ready);
    const hasKo = await page.evaluate(() => document.fonts.check('16px "Noto Sans CJK KR"') || document.fonts.check('16px "Noto Sans KR"'));
    if (!hasKo) console.warn('⚠ 한글 폰트 미검출 — apt-get install -y fonts-noto-cjk 후 재실행 권장');
    if (jsErr) {
      fail = '템플릿 JS 에러: ' + jsErr.message;
    } else {
      await page.screenshot({ path: outPath, fullPage: true });
      const h = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
      console.log('완료: ' + outPath + ' (' + width + 'x' + h + ' @2x = ' + width * 2 + 'x' + h * 2 + ')');
    }
  } finally {
    await browser.close();
  }
  if (fail) {
    console.error(fail);
    process.exit(1);
  }
})();
