#!/usr/bin/env node
// 콘텐츠 제작 최소화(─) 실측 하네스 — 12개 도구 전건: ① 열기 → ② 최소화(보드 숨김 + 독 칩) →
// ③ Esc 가드(숨은 보드 파괴 0) → ④ 메뉴 재진입 = 복원(리셋 아님) → ⑤ 닫기 정리.
// + 전·후 스크린샷(전 = git show HEAD:index.html 서빙본 — 같은 크롭 2판 대조).
// 실행: node tools/scratch/probe_tmin_ba.mjs
import { existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs', 'reports', '260805_콘텐츠제작_최소화_전후');
mkdirSync(OUT, { recursive: true });

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    if (d.startsWith('chromium-') && !d.includes('headless')) {
      const p = join(base, d, 'chrome-linux', 'chrome');
      if (existsSync(p)) return p;
    }
  }
  return null;
}

// [보드 id, 열기 표현식, 라벨]
const TOOLS = [
  ['cm-board', 'openCardMaker()', '카드 제작'],
  ['lm-board', 'openLogoMaker()', '로고 제작'],
  ['km-board', 'openKakaoDesigner()', '카카오 메세지 설계'],
  ['nblog-board', 'openNaverBlogTool()', '네이버 블로그'],
  ['hw-board', 'openHwpEditor()', '한글문서 편집'],
  ['of-board', 'openOfficeEditor()', '오피스문서 편집'],
  ['sl-board', 'openFileSlimmer()', '용량 줄이기'],
  ['dm-board', 'openDocMd()', '문서 → 마크다운'],
  ['lg-board', 'openLinkGrab()', '링크 자료수집'],
  ['ve-board', "openVideoEditor('edit')", '영상 편집기'],
  ['bp-board', 'openBookingProcess()', '도화지'],
  ['enn-bg', 'openEnneagram()', '에니어그램'],
];

async function boot(chromium, exe, url) {
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route('**', r => (r.request().url().startsWith('file:') ? r.continue() : r.abort()));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String((e && e.stack) || e).split('\n')[0]));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);
  return { browser, page, errs };
}

async function main() {
  const { chromium } = await import('playwright-core');
  const exe = findChromium();
  if (!exe) { console.error('chromium 없음'); return 1; }

  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };

  // ── 후(현재 작업본) — 동작 전건 실측 ──────────────────────────────
  const A = await boot(chromium, exe, 'file://' + join(ROOT, 'index.html'));
  const { page } = A;
  for (const [id, open, label] of TOOLS) {
    const r = await page.evaluate(async ([id, open, label]) => {
      const out = { id };
      const $ = i => document.getElementById(i);
      eval(open);
      await new Promise(res => setTimeout(res, 120));
      const el = $(id);
      out.opened = !!(el && el.innerHTML && el.style.display !== 'none');
      // 최소화 버튼 존재·클릭
      const btn = el && el.querySelector('button[title="최소화"]');
      out.hasMinBtn = !!btn;
      if (btn) btn.click();
      out.hidden = !!(el && el.style.display === 'none');
      const chip = document.querySelector('#tmin-dock button');
      out.chip = !!chip && chip.textContent === label;
      // Esc 가드 — 숨은 보드가 파괴되지 않아야 한다
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      await new Promise(res => setTimeout(res, 60));
      out.escSafe = !!($(id) && $(id).innerHTML);
      // 메뉴 재진입 = 복원(리셋이 아니라 「같은 DOM 노드」가 다시 보인다 — innerHTML 재생성이면 노드 동일성이 깨진다)
      const sent = $(id) ? $(id).firstElementChild : null;
      eval(open);
      await new Promise(res => setTimeout(res, 120));
      out.restored = !!($(id) && $(id).style.display !== 'none' && sent && $(id).firstElementChild === sent);
      out.chipGone = !document.querySelector('#tmin-dock');
      return out;
    }, [id, open, label]);
    ok(r.opened, `${label}: 열림 실패`);
    ok(r.hasMinBtn, `${label}: 최소화 버튼 없음`);
    ok(r.hidden, `${label}: 최소화 후 보드가 안 숨음`);
    ok(r.chip, `${label}: 독 칩 없음/라벨 불일치`);
    ok(r.escSafe, `${label}: 최소화 중 Esc가 보드를 파괴`);
    ok(r.restored, `${label}: 재진입 복원 실패(리셋됨/안 보임)`);
    ok(r.chipGone, `${label}: 복원 후 칩 잔존`);
    // 정리 — 보이는 보드 닫기(개별 close가 아니라 X 클릭 = 실경로)
    await page.evaluate((id) => {
      const el = document.getElementById(id);
      const x = el && el.querySelector('button[title="닫기"]');
      if (x) x.click();
    }, id);
    await page.waitForTimeout(80);
  }
  // 도화지 body 스크롤락: 최소화 = 해제, 복원 = 재적용
  const sc = await page.evaluate(async () => {
    const out = {};
    openBookingProcess(); await new Promise(r => setTimeout(r, 150));
    out.openLock = document.body.style.overflow === 'hidden';
    document.querySelector('#bp-board button[title="최소화"]').click();
    out.minUnlock = document.body.style.overflow === '';
    _tminShow('bp-board');
    out.restoreLock = document.body.style.overflow === 'hidden';
    closeBookingProcess();
    return out;
  });
  ok(sc.openLock && sc.minUnlock && sc.restoreLock, `도화지 스크롤락 계약 어긋남 ${JSON.stringify(sc)}`);

  // 다중 최소화 독(칩 3개) — 촬영용으로 남긴다
  await page.evaluate(async () => {
    openCardMaker(); await new Promise(r => setTimeout(r, 100)); _tminHide('cm-board', '카드 제작');
    openHwpEditor(); await new Promise(r => setTimeout(r, 100)); _tminHide('hw-board', '한글문서 편집');
    openLinkGrab(); await new Promise(r => setTimeout(r, 100)); _tminHide('lg-board', '링크 자료수집');
  });
  await page.waitForTimeout(150);
  const nchip = await page.evaluate(() => document.querySelectorAll('#tmin-dock button').length);
  ok(nchip === 3, `다중 최소화 칩 수 ${nchip} ≠ 3`);
  await page.screenshot({ path: join(OUT, 'after_독_칩3.png'), clip: { x: 0, y: 900 - 90, width: 420, height: 90 } });   // 420 = 우측 오류 토스트(헤드리스 망 차단 노이즈) 컷 밖

  // 촬영: 카드 제작 헤더(─·✕), 도화지 헤더(─·⛶·✕)
  await page.evaluate(async () => { _tminShow('cm-board'); await new Promise(r => setTimeout(r, 80)); });
  await page.waitForTimeout(120);
  let bb = await page.evaluate(() => {
    const m = document.querySelector('#cm-board .modal').getBoundingClientRect();
    return { x: m.right - 300, y: m.top, w: 300, h: 62 };
  });
  await page.screenshot({ path: join(OUT, 'after_카드제작_헤더.png'), clip: { x: bb.x, y: bb.y, width: bb.w, height: bb.h } });
  await page.evaluate(() => { document.querySelector('#cm-board button[title="닫기"]').click(); });

  await page.evaluate(async () => { openBookingProcess(); await new Promise(r => setTimeout(r, 150)); });
  bb = await page.evaluate(() => {
    const h = document.querySelector('#bp-board .bp-hd').getBoundingClientRect();
    return { x: h.right - 300, y: h.top, w: 300, h: h.height };
  });
  await page.screenshot({ path: join(OUT, 'after_도화지_헤더.png'), clip: { x: bb.x, y: bb.y, width: bb.w, height: bb.h } });
  await page.evaluate(() => closeBookingProcess());
  const errsA = A.errs.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
  await A.browser.close();

  // ── 전(HEAD 서빙본) — 같은 크롭 2판 ──────────────────────────────
  const BEFORE = process.env.TMIN_BEFORE; // probe 실행 전 git show HEAD:index.html > (경로) 로 준비
  if (BEFORE && existsSync(BEFORE)) {
    const B = await boot(chromium, exe, 'file://' + BEFORE);
    await B.page.evaluate(async () => { openCardMaker(); await new Promise(r => setTimeout(r, 150)); });
    let b1 = await B.page.evaluate(() => {
      const m = document.querySelector('#cm-board .modal').getBoundingClientRect();
      return { x: m.right - 300, y: m.top, w: 300, h: 62 };
    });
    await B.page.screenshot({ path: join(OUT, 'before_카드제작_헤더.png'), clip: { x: b1.x, y: b1.y, width: b1.w, height: b1.h } });
    await B.page.evaluate(async () => { closeCardMaker(); openBookingProcess(); await new Promise(r => setTimeout(r, 150)); });
    let b2 = await B.page.evaluate(() => {
      const h = document.querySelector('#bp-board .bp-hd').getBoundingClientRect();
      return { x: h.right - 300, y: h.top, w: 300, h: h.height };
    });
    await B.page.screenshot({ path: join(OUT, 'before_도화지_헤더.png'), clip: { x: b2.x, y: b2.y, width: b2.w, height: b2.h } });
    await B.browser.close();
  } else {
    console.log('(전 스크린샷 생략 — TMIN_BEFORE 미지정)');
  }

  if (errsA.length) fails.push('pageerror: ' + errsA.join(' | '));
  if (fails.length) { console.error('FAIL ' + fails.length + '건:'); fails.forEach(f => console.error('  - ' + f)); return 1; }
  console.log('PASS — 12개 도구 전건: 열기→최소화(숨김+칩)→Esc 무해→재진입 복원→칩 정리 · 도화지 스크롤락 계약 · 칩 3개 독 · pageerror 0');
  return 0;
}
main().then(c => process.exit(c)).catch(e => { console.error('probe 오류: ' + String(e && e.stack || e)); process.exit(1); });
