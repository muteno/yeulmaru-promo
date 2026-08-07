#!/usr/bin/env node
// [260813] 예울이 카드 호버 확장 — 전/후 실측 프로브(캡처 전용 · 정본 부품 재타이핑 0).
//   하네스 = smoke_bkchat.mjs와 같은 레일(?qa=admin + tools/qa_mock_ops.mjs 목) = 실API·PII 무접촉.
//   재는 것 = ① 우 열/카드/막대 카드의 실기하 ② 호버 전·후 캡처(우 열 통째) ③ .cb-foot 실측 높이(--rise-foot 근거).
// 실행: node tools/scratch/probe_yeul_hover.mjs <출력접두사>
import { existsSync, readdirSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from '../qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = +(process.env.PW_W || 1500), H = +(process.env.PW_H || 1000);   // 뷰포트 = 환경변수로 갈아끼운다(FIT/비FIT 두 갈래 실측)
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const OUT = process.argv[2] || join(ROOT, 'docs', 'reports', '260813_예울이_호버확장');

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

// 우 열 = 예울이 로그의 조상 중 「막대 카드와 예울이 카드를 함께 담은 열」 = 로그.closest 두 단계 위.
const SFX = process.env.PW_INLINE ? 'i' : 'm';
const GEO = `(()=>{
  const log=document.getElementById('mem-ai-log-${SFX}'); if(!log)return null;
  const card=log.parentElement;                       // 예울이 흰 카드
  const col=card.parentElement;                       // 우 열(막대 카드 + 예울이)
  const bar=col.firstElementChild;                    // 거주지 TOP·연령대 막대 카드
  const foot=card.querySelector('.cb-foot');
  const r=e=>{const b=e.getBoundingClientRect();return {t:+b.top.toFixed(1),b:+b.bottom.toFixed(1),h:+b.height.toFixed(1),w:+b.width.toFixed(1)};};
  return {col:r(col),bar:r(bar),card:r(card),log:r(log),foot:foot?r(foot):null,
    footStyle:foot?getComputedStyle(foot).padding+' / border-top '+getComputedStyle(foot).borderTopWidth:null,
    cardBd:getComputedStyle(card).borderTopWidth,clip:getComputedStyle(card).clipPath};
})()`;

// 곡선 중간 = 시간에 기대지 않고 **전이 애니메이션을 그 지점에 세워** 찍는다(캡처가 수백 ms 걸려 타이밍 샷은 늘 끝난 뒤가 된다).
const PAUSE_AT = p => `(()=>{ const c=document.getElementById('mem-ai-card-${SFX}'); if(!c)return null;
  const a=c.getAnimations().find(x=>x.transitionProperty==='clip-path'); if(!a)return 'anim없음';
  const d=a.effect.getTiming().duration; a.pause(); a.currentTime=${p}*d; return Math.round(${p}*d)+'ms/'+Math.round(d)+'ms'; })()`;

async function shotCol(page, path) {
  const h = await page.evaluateHandle(`(()=>{const l=document.getElementById('mem-ai-log-${SFX}');return l?l.parentElement.parentElement:null;})()`);
  const el = h.asElement(); if (!el) return;
  await el.screenshot({ path });
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[probe] SKIP — playwright-core 미설치.'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[probe] SKIP — chromium 미탐지.'); return 0; }
  mkdirSync(dirname(OUT), { recursive: true });

  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  try {
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.route('**/*', route => {
      const u = new NodeURL(route.request().url());
      if (u.hostname === 'app.local') {
        let p = decodeURIComponent(u.pathname); if (p === '/') p = '/index.html';
        try { return route.fulfill({ status: 200, body: readFileSync(join(ROOT, p)), contentType: MIME[extname(p)] || 'application/octet-stream' }); }
        catch { return route.fulfill({ status: 404, body: 'nf' }); }
      }
      return route.abort();
    });
    await page.addInitScript(INIT_SCRIPT);
    await page.goto('https://app.local/index.html?qa=admin', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.evaluate(FEED_SCRIPT);
    // PW_INLINE=1 = **인라인 4면 경로**(mem-ov-inline · _inFit 분기 = 줄이 자기 안에서 스크롤)를 같은 렌더 함수로 세워 본다.
    //   책 넘김을 흉내 내는 대신 이젤 계약(높이 확정된 [data-bizmbox])만 만들어 준다 — 재는 건 그 분기의 기하다.
    if (process.env.PW_INLINE) {
      await page.evaluate(`(()=>{ const b=document.createElement('div'); b.setAttribute('data-bizmbox','');
        b.style.cssText='height:700px;width:1100px;padding:12px;position:relative';
        const i=document.createElement('div'); i.id='mem-ov-inline'; i.style.height='100%'; b.appendChild(i);
        document.body.appendChild(b); _memOvRender('mem-ov-inline'); })()`);
      await page.waitForTimeout(400);
    } else {
      await page.evaluate(`openMemberOverview()`);
      await page.waitForTimeout(900);
    }

    const ok = await page.evaluate(`!!document.getElementById('mem-ai-log-'+${JSON.stringify(process.env.PW_INLINE ? 'i' : 'm')})`);
    if (!ok) { console.log('[probe] SKIP — 고객 분석 카드가 안 열림.'); return 0; }

    // 대화 한 벌 심어 실사용 상태로(질문 + 답) · PW_EMPTY=1 = 첫 화면(인사+칩) 그대로
    if (!process.env.PW_EMPTY)
      await page.evaluate(`(()=>{ _memAiHist=[{u:'여수 30대 회원 몇 명이야?'},{b:'여수시 30대 회원은 <b>1,842명</b>이에요 · 여수 전체의 12.5%',t:'오후 04:13'}]; _memAiPaint('${SFX}'); })()`);
    else await page.evaluate(`(()=>{ _memAiHist=[]; _memAiPaint('${SFX}'); })()`);
    await page.waitForTimeout(300);

    const rest = await page.evaluate(GEO);
    console.log('[쉼] ' + JSON.stringify(rest));
    await shotCol(page, OUT + '_쉼.png');

    // 호버 — 입력줄 위(접힘 상태에서 확실히 보이는 자리)
    await page.hover('#mem-ai-q-'+SFX);
    await page.waitForTimeout(900);
    const hov = await page.evaluate(GEO);
    console.log('[호버] ' + JSON.stringify(hov));
    await shotCol(page, OUT + '_호버.png');

    // 전이 중간 — 마우스를 뺐다가 다시 올린 뒤 **애니메이션을 35% 지점에 정지**시켜 캡처(타이밍 샷은 캡처 지연 때문에 늘 끝난 뒤가 찍힌다)
    await page.mouse.move(10, 10);
    await page.waitForTimeout(1000);
    await page.hover('#mem-ai-q-'+SFX);
    await page.waitForTimeout(160);
    console.log('[중간] 정지 = ' + await page.evaluate(PAUSE_AT(0.35)));
    await shotCol(page, OUT + '_중간.png');
    console.log('[중간] ' + JSON.stringify(await page.evaluate(GEO)));
    console.log('[probe] 캡처 3장: ' + OUT + '_{쉼,중간,호버}.png');
    return 0;
  } finally { await browser.close(); }
}
main().then(c => process.exit(c)).catch(e => { console.error('[probe] 예외: ' + (e && e.stack)); process.exit(1); });
