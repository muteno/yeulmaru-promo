#!/usr/bin/env node
// 플레이그라운드 시안 변형별 스샷 — node probe_pgshot.mjs <html> <out-prefix> [form,pal,h ...]
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const find = () => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; };
const [file, prefix, ...combos] = process.argv.slice(2);
const { chromium } = await import('playwright-core');
const br = await chromium.launch({ executablePath: find(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const pg = await br.newPage({ viewport: { width: 1240, height: 1000 }, deviceScaleFactor: 2 });
const errs = []; pg.on('pageerror', e => errs.push(String(e).split('\n')[0]));
await pg.goto('file://' + file, { waitUntil: 'load' });
for (const combo of combos) {
  const [form, pal, h] = combo.split(',');
  await pg.evaluate(([f, p, hh]) => {
    document.querySelector(`.fbtn[data-k="form"][data-v="${f}"]`).click();
    document.querySelector(`.fbtn[data-k="pal"][data-v="${p}"]`).click();
    document.querySelector(`.fbtn[data-k="h"][data-v="${hh}"]`).click();
  }, [form, pal, h]);
  await pg.waitForTimeout(220);
  const el = await pg.$('.easel');
  await el.screenshot({ path: `${prefix}_${form}_${pal}_${h}.png` });
  console.log('shot', `${form}_${pal}_${h}`);
}
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0, 4));
await br.close();
