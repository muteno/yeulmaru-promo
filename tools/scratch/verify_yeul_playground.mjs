#!/usr/bin/env node
// [260813] 시안 검증 — 플레이그라운드 계약(docs/플레이그라운드_포터블.md §4): 렌더 실측 + 상태 전환 실호버 + 프리셋별 캡처 + JS 에러 0.
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FILE = 'file://' + join(ROOT, 'docs', 'reports', '260813_예울이_호버확장_전후.html');
const SHOT = process.argv[2] || join(ROOT, 'docs', 'reports', '260813_예울이_호버확장_시안');
function findChromium() {
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(base)) if (d.startsWith('chromium-') && !d.includes('headless')) {
    const p = join(base, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p;
  }
  return null;
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } });
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
page.on('request', r => { const u = r.url(); if (!u.startsWith('file://') && !u.startsWith('data:')) errs.push('외부 요청: ' + u.slice(0, 80)); });
await page.goto(FILE, { waitUntil: 'load' });
await page.waitForTimeout(500);

const clip = s => page.evaluate(`getComputedStyle(document.querySelector('${s}')).clipPath`);
const rest = await clip('#live .cb-rise');
await page.hover('#live .cb-in');
await page.waitForTimeout(900);
const hov = await clip('#live .cb-rise');
const was = await clip('.cb-rise-was-card');
await page.screenshot({ path: SHOT + '_호버.png', fullPage: true });
// 프리셋 순회
const names = await page.$$eval('#pre button', bs => bs.map(b => b.textContent));
for (let k = 0; k < names.length; k++) {
  await page.click(`#pre button:nth-child(${k + 1})`);
  await page.waitForTimeout(120);
}
await page.mouse.move(5, 5); await page.waitForTimeout(900);
await page.screenshot({ path: SHOT + '_쉼.png', fullPage: true });
const out = await page.$eval('#out', e => e.textContent);
console.log('쉼 clip   =', rest);
console.log('호버 clip =', hov);
console.log('전(구판)  =', was);
console.log('프리셋    =', names.join(' | '));
console.log('복사블록  =', out.split('\n').slice(0, 2).join(' ⏎ '));
console.log(errs.length ? '❌ 에러 ' + errs.length + '건:\n  ' + errs.join('\n  ') : '✅ JS 에러 0 · 외부 요청 0');
await browser.close();
process.exit(errs.length || (rest === hov ? 1 : 0));
