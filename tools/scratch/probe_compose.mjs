#!/usr/bin/env node
// 전/후 나란히 붙인 비교 이미지 생성 — node probe_compose.mjs out.png "제목|before.png|after.png" ...
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const findChromium = () => { const b = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  for (const d of readdirSync(b)) if (d.startsWith('chromium-') && !d.includes('headless')) { const p = join(b, d, 'chrome-linux', 'chrome'); if (existsSync(p)) return p; } return null; };
const OUT = process.argv[2];
const pairs = process.argv.slice(3).map(s => s.split('|'));
const b64 = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
// 라벨은 기본이 전/후 — 5·6번째 인자를 주면 그 자리 이름을 바꾼다(같은 판의 두 갈래를 나란히 볼 때: "데이터(파랑)|디자인(빨강)")
const rows = pairs.map(([title, a, b, la, lb]) => `
  <section>
    <h2>${title}</h2>
    <div class="pair">
      <figure><figcaption><span class="tag before">${la || '전 (BEFORE)'}</span></figcaption><img src="${b64(a)}"></figure>
      <figure><figcaption><span class="tag after">${lb || '후 (AFTER)'}</span></figcaption><img src="${b64(b)}"></figure>
    </div>
  </section>`).join('');
const html = `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;padding:26px 26px 30px;background:#F0EBF5;font-family:-apple-system,BlinkMacSystemFont,"Malgun Gothic",sans-serif;color:#1A1A2E}
  h2{font-size:19px;margin:0 0 12px}
  section{margin-bottom:26px}
  .pair{display:flex;gap:18px;align-items:flex-start}
  figure{margin:0;flex:1 1 0;min-width:0}
  figcaption{margin-bottom:7px}
  .tag{display:inline-block;font-size:13px;font-weight:800;padding:4px 12px;border-radius:10px}
  .before{background:#FBF0EC;color:#D88455}
  .after{background:#E8E8FD;color:#4A4DE7}
  img{width:100%;display:block;border-radius:14px;box-shadow:0 8px 32px rgba(74,77,231,.14)}
</style>${rows}`;
const { chromium } = await import('playwright-core');
const br = await chromium.launch({ executablePath: findChromium(), headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
const pg = await br.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 1.4 });
await pg.setContent(html, { waitUntil: 'load' });
await pg.screenshot({ path: OUT, fullPage: true });
await br.close();
console.log('wrote', OUT);
