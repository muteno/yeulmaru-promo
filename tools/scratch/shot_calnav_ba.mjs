import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', headless: true, args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file:///home/user/yeulmaru-promo/docs/reports/260801_캘린더_좌우화살표_전후.html');
await p.waitForTimeout(600);
await p.screenshot({ path: 'docs/reports/260801_캘린더_좌우화살표_전후.png', fullPage: true });
await b.close();
