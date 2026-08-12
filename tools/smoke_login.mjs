#!/usr/bin/env node
// 로그인 스모크 게이트 — index.html 로드 시 (1) 로그인 화면이 실제로 렌더되고 (2) 핵심 로그인 함수가
// 존재하며 (3) JS 회귀(ReferenceError/SyntaxError/not defined)가 0인지 헤드리스로 실측.
// 목적: 23k 단일파일 로그인 흐름을 고치다 딴 게 깨지는 회귀를 커밋 전에 잡는다(엔진① 차단).
//
// ⚠ fail-soft 원칙(어제 check_refs식 전면차단 재발 방지):
//   playwright-core·chromium·환경 문제 = SKIP(exit 0, 차단 안 함). *진짜 로그인 파손*만 FAIL(exit 1).
//
// 실행: node tools/smoke_login.mjs   ·  npm run smoke
// 의존: playwright-core(devDependency) + chromium(원격 세션은 /opt/pw-browsers에 상주). 없으면 자동 SKIP.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'index.html');

function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  try {
    for (const d of readdirSync(base)) {
      if (d.startsWith('chromium-') && !d.includes('headless')) {
        const p = join(base, d, 'chrome-linux', 'chrome');
        if (existsSync(p)) return p;
      }
    }
  } catch { /* ignore */ }
  return null;
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[smoke] SKIP — playwright-core 미설치(npm install 후 활성). 로그인 회귀검사 건너뜀.'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[smoke] SKIP — chromium 바이너리 미탐지. 건너뜀.'); return 0; }
  if (!existsSync(INDEX)) { console.log('[smoke] SKIP — index.html 없음.'); return 0; }

  const pageErrors = [];
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox'] });
  try {
    const ctx = await browser.newContext();
    // 외부(비 file://) 리소스 abort — 샌드박스 네트워크 차단으로 파서가 블로킹 외부 스크립트에서 멈추는 것 방지
    // [260812] 전면 개방 진입(`OPEN_ENTRY=true`)이면 로그인 화면이 아예 안 뜬다 — 이 스모크가 재려는 건
    //   **로그인 화면 자체의 회귀**이므로, 그 스위치만 끈 판을 넘겨 종전 흐름을 그대로 잰다(파일은 안 고친다).
    //   ⚠ 개방 진입 쪽 회귀는 `tools/scratch/shot_openentry.mjs`가 따로 잰다 — 둘을 한 판에서 재면 서로를 가린다.
    const SRC = readFileSync(INDEX, 'utf8').replace('var OPEN_ENTRY=true;', 'var OPEN_ENTRY=false;');
    await ctx.route('**', r => {
      const u = r.request().url();
      if (!u.startsWith('file:')) return r.abort();
      if (u.endsWith('/index.html')) return r.fulfill({ status: 200, body: SRC, contentType: 'text/html; charset=utf-8' });
      return r.continue();
    });
    const page = await ctx.newPage();
    page.on('pageerror', e => pageErrors.push(String((e && e.stack) || e)));
    await page.goto('file://' + INDEX, { waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(e => pageErrors.push('goto: ' + String(e).split('\n')[0]));
    await page.waitForTimeout(3000); // 세션복원 IIFE + initLoginScreen 실행 대기

    const dom = await page.evaluate(() => {
      const l = document.getElementById('login');
      return {
        ready: document.readyState,
        loginRendered: !!l && getComputedStyle(l).display !== 'none',
        hasInitLogin: typeof initLoginScreen,
        hasGoToPin: typeof goToPinStep,
        hasEnterApp: typeof _enterApp,
      };
    }).catch(e => ({ evalError: String(e).split('\n')[0] }));

    const regressions = pageErrors.filter(e => /ReferenceError|SyntaxError|is not defined|is not a function/.test(e));
    const ok = dom.loginRendered && dom.hasInitLogin === 'function'
      && dom.hasGoToPin === 'function' && dom.hasEnterApp === 'function' && regressions.length === 0;

    if (ok) { console.log('[smoke] PASS — 로그인 화면 렌더·핵심 함수(initLogin/goToPin/_enterApp) 존재·JS 회귀 0.'); return 0; }
    console.error('[smoke] FAIL — 로그인 회귀 감지:');
    console.error('  DOM/전역:', JSON.stringify(dom));
    if (regressions.length) console.error('  회귀:', regressions.map(r => r.split('\n')[0]).join('  |  '));
    return 1;
  } finally { await browser.close(); }
}

// 스모크 자체가 환경 문제로 던지면 SKIP(차단 안 함) — 오직 명시적 FAIL(return 1)만 커밋 차단.
main().then(c => process.exit(c)).catch(e => {
  console.error('[smoke] SKIP — 스모크 실행 환경 오류(차단 안 함): ' + String(e).split('\n')[0]);
  process.exit(0);
});
