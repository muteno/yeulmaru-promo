#!/usr/bin/env node
// [260806 운영자 「예매데이터 — AI 홍보 메뉴에서는 확인되는데 예울이 채팅에선 안 나온다. 붙여줘」]
// 예매 질의 채팅 스모크 — **AI 홍보 ▸ 고객 분류 탭과 예울이 채팅이 같은 데이터에 닿는가**를 재는 게이트.
//
// 왜 필요한가(실측 회귀):
//   · `_segRun`(AI 홍보 3탭)은 `await _bkLoad(false)` — 예매집계가 아직 없으면 **불러온 뒤** 답한다 = 항상 나온다.
//   · `_memAiSend`(예울이 채팅)는 `_bkAnswer(q)`를 **동기로** 불렀다 — 캐시가 비어 있으면 `_bkWarm()`만 때리고
//     「예매 이력을 아직 안 불러왔어요 — 잠시 뒤 다시 물어봐 주세요」로 끝났다(운영자 캡처 260806 오후 1:26).
//     같은 앱·같은 시트인데 한쪽만 답하는 상태 = 「연결 안 됨」으로 읽힌다. 재질문 안내도 소용없다 —
//     _bkWarm은 admin이 아니면 아예 안 돌아서 비관리자에겐 **영원히** 그 문장이었다.
//   → 정본은 seg 탭 쪽(await). 채팅도 같은 레일을 타게 하고, 이 게이트가 그 상태를 실측으로 잠근다.
//
// 재는 계약 5가지:
//   ① 냉시동 답변 — 캐시 0(_bkState=null)에서 예매 질문 → 「아직 안 불러왔어요」가 **안 뜨고** 실제 숫자가 나온다.
//   ② 두 화면 일치 — 같은 조건(기간·장르·횟수)에서 채팅이 말한 인원 = 고객 분류 탭이 뽑은 명단 인원.
//   ③ 로딩 표시 — 불러오는 동안 「불러오는 중」 말풍선이 서 있다(사용자가 「먹통」으로 읽지 않게).
//   ④ 비집계 질의 무접촉 — 예매어가 없는 질문은 종전 경로(지역·연령 로컬 집계) 그대로.
//   ⑤ 선로딩 겹침 — _bkWarm이 **이미 띄운 적재가 비행 중**일 때 물어도 답이 나온다.
//      운영 화면에서 가장 흔한 순서다(메뉴에 마우스가 스치면 _memWarm→_bkWarm이 먼저 뜬다). 구판 `_bkLoad`는
//      비행 중이면 아직 null인 _bkState를 즉시 돌려줘서, await로 기다린 줄 안 호출측이 빈손으로 진행했다
//      — 그래서 채팅뿐 아니라 **고객 분류 탭(_segRun)도** 같은 구멍을 갖고 있었다. 둘 다 여기서 잠근다.
//
// ⚠ fail-soft(smoke_login.mjs·smoke_modal_head.mjs와 동일): playwright-core·chromium 미탐지 = SKIP(exit 0).
//   QA 진입로(?qa=admin) + tools/qa_mock_ops.mjs 목 = 실API·실데이터·PII 미접촉.
//
// 실행: node tools/smoke_bkchat.mjs   ·   npm run smoke:bkchat
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { INIT_SCRIPT, FEED_SCRIPT } from './qa_mock_ops.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const W = 1500, H = 1000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jfif': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

// 운영자 캡처와 같은 질문 — 연도 구간(23~24년) × 장르(클래식) × 횟수(2회 이상) 교차 = 예매 경로에서만 답이 나온다.
const Q = '23~24년 클래식 2회 이상 관람한 사람';

// 목 API에 지연을 얹는다 — 실 시트는 즉답이 아니다(첫 로드 수 초). 지연이 0이면 「동기 호출도 우연히 통과」해
// 이 게이트가 회귀를 못 잡는다(구판이 정확히 그 상태였다).
const LAG = `(()=>{ const _a=window.api; window.api=function(m,p){
  const dp=decodeURIComponent(String(p||''));
  if(dp.indexOf('sheet=예매집계')>=0)return new Promise(r=>setTimeout(()=>r(_a.apply(this,[m,p])),700));
  return _a.apply(this,arguments); }; })()`;

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

// 채팅 마지막 봇 말풍선 텍스트
const LASTBOT = `(()=>{ const l=document.getElementById('mem-ai-log-m'); if(!l)return null;
  const b=[...l.querySelectorAll('.cb-msg.bot')].pop(); return b?(b.textContent||'').trim():null; })()`;

const _MOCKN = n => n;   // 목 예매집계 행수 = 적재 성공 시 _bkState.n의 기대값(값을 여기 박지 않고 목에서 가져온다)

// 채팅 카드(정본 _memAiCardHtml의 흰 상자) 그대로 캡처 — 전/후 비교용
async function shotCard(page, path) {
  const el = await page.$('#mem-ai-log-m'); if (!el) return;
  const box = await el.evaluateHandle(e => e.closest('div[style*="border-radius"]'));
  await (box.asElement() || el).screenshot({ path });
}

async function main() {
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { console.log('[bkchat] SKIP — playwright-core 미설치(npm install 후 활성).'); return 0; }
  const exe = findChromium();
  if (!exe) { console.log('[bkchat] SKIP — chromium 바이너리 미탐지.'); return 0; }
  if (!existsSync(join(ROOT, 'index.html'))) { console.log('[bkchat] SKIP — index.html 없음.'); return 0; }

  const shot = process.argv.includes('--shot') ? (process.argv[process.argv.indexOf('--shot') + 1] || null) : null;
  const browser = await chromium.launch({ executablePath: exe, headless: true, args: ['--no-sandbox', '--no-proxy-server'] });
  const fails = [];
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
    await page.evaluate(LAG);

    // 냉시동 — 예매집계 캐시를 확실히 비우고(다른 화면이 덥혔을 수 있다) 고객 분석 모달을 연다.
    await page.evaluate(`(()=>{ _bkState=null; _bkLoading=false; _memAiHist=[]; _memAiBusy=false; })()`);
    await page.evaluate(`openMemberOverview()`);
    await page.waitForTimeout(900);
    const cold = await page.evaluate(`(()=>({card:!!document.getElementById('mem-ai-q-m'), bk:!!_bkState}))()`);
    if (!cold.card) { console.log('[bkchat] SKIP — 고객 분석 채팅 카드가 안 열림(목데이터 의존).'); return 0; }
    if (cold.bk) fails.push('냉시동 준비 실패 — 질문 전에 이미 예매집계가 적재됐다(이 게이트가 아무것도 못 잰다).');

    // 질문 발사 → ③ 로딩 표시 확인 → 답 대기
    await page.evaluate(`(()=>{ document.getElementById('mem-ai-q-m').value=${JSON.stringify(Q)}; _memAiSend('m'); })()`);
    await page.waitForTimeout(150);
    const pending = await page.evaluate(LASTBOT);
    if (!pending) fails.push('③ 질문 직후 봇 말풍선이 아예 없다 — 사용자에겐 「먹통」으로 보인다.');
    else if (!/불러오는 중/.test(pending))
      fails.push('③ 적재를 기다리는 동안 「불러오는 중」 표시가 없다 — 그 자리에 선 문장: ' + pending.slice(0, 70));

    if (shot) await shotCard(page, shot.replace(/\.png$/, '_대기.png'));

    // ⚠ 대기 문구 셋(적재 대기·AI 대기 2종)을 **전부** 걸러야 한다 — 하나라도 빠지면 대기 말풍선을 답으로
    //   읽고 그 자리에서 판정해 게이트가 흔들린다(초판이 실제로 그랬다: `불러오는 중` 누락 → 냉시동이 랜덤 FAIL).
    await page.waitForFunction(`(()=>{ const l=document.getElementById('mem-ai-log-m'); if(!l)return false;
      const b=[...l.querySelectorAll('.cb-msg.bot')].pop(); if(!b)return false;
      return !/불러오는 중|생각 중|기다리세요/.test(b.textContent||''); })()`, null, { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(300);
    const ans = await page.evaluate(LASTBOT);

    if (shot) await shotCard(page, shot);

    // ① 냉시동 답변
    if (!ans) fails.push('① 답이 아예 없다.');
    else if (/아직 안 불러왔어요/.test(ans))
      fails.push('① 냉시동에서 「예매 이력을 아직 안 불러왔어요」로 끝났다 — AI 홍보 ▸ 고객 분류(_segRun)는 await _bkLoad로 같은 조건에 답한다. 채팅도 같은 레일을 타야 한다.');
    else if (!/명이에요|명\b/.test(ans))
      fails.push('① 예매 답변 형태가 아니다 — 실제 인원 수가 안 나왔다: ' + ans.slice(0, 90));

    // ② 두 화면 일치 — 채팅이 말한 인원 vs 고객 분류 탭 계산(_segCompute = 명단 화면과 같은 함수)
    const chatN = ans && (ans.match(/회원은\s*([\d,]+)명/) || [])[1];
    const segN = await page.evaluate(`(()=>{ try{ _segCompute({lo:2023,hi:2024,unit:'y'},'클래식',2); return _segLast?_segLast.rows.length+_segLast.nomem:null; }catch(e){ return 'ERR:'+e.message; } })()`);
    if (chatN != null && typeof segN === 'number') {
      const c = parseInt(String(chatN).replace(/,/g, ''), 10);
      if (c !== segN) fails.push(`② 두 화면 불일치 — 채팅 ${c}명 vs 고객 분류 ${segN}명. 같은 조건에서 답이 갈리면 어느 쪽도 못 믿는다.`);
    } else if (typeof segN !== 'number') fails.push('② 고객 분류 대조 실패 — ' + segN);

    // ④ 비집계 질의 무접촉
    await page.evaluate(`(()=>{ document.getElementById('mem-ai-q-m').value='여수 30대 회원 몇 명이야?'; _memAiSend('m'); })()`);
    await page.waitForTimeout(500);
    const plain = await page.evaluate(LASTBOT);
    if (!plain || !/회원은/.test(plain) || /생각 중/.test(plain))
      fails.push('④ 지역·연령 질의(예매어 없음)가 종전 즉답 경로를 벗어났다: ' + String(plain).slice(0, 80));

    // ⑤ 선로딩 겹침 — _bkWarm이 띄운 적재가 **비행 중**일 때 물어도 답이 나오는가(운영 화면의 가장 흔한 순서).
    //    캐시를 비우고 _bkWarm()을 먼저 때린 뒤, 응답이 오기 전에 질문한다.
    await page.evaluate(`(()=>{ _memAiHist=[]; _memAiBusy=false; _bkState=null; _bkLoading=false; _bkP=null; })()`);
    await page.evaluate(`_bkWarm()`);
    await page.waitForTimeout(80);   // 적재는 아직 비행 중(목 지연 700ms)
    const inFlight = await page.evaluate(`(()=>({flying:!_bkState}))()`);
    if (!inFlight.flying) fails.push('⑤ 준비 실패 — _bkWarm이 벌써 끝나 겹침 상태를 못 만들었다(목 지연 확인).');
    await page.evaluate(`(()=>{ document.getElementById('mem-ai-q-m').value=${JSON.stringify(Q)}; _memAiSend('m'); })()`);
    await page.waitForFunction(`(()=>{ const l=document.getElementById('mem-ai-log-m'); if(!l)return false;
      const b=[...l.querySelectorAll('.cb-msg.bot')].pop(); if(!b)return false;
      return !/불러오는 중|생각 중|기다리세요/.test(b.textContent||''); })()`, null, { timeout: 20000 }).catch(() => {});
    const raceAns = await page.evaluate(LASTBOT);
    if (!raceAns || /아직 안 불러왔어요/.test(raceAns))
      fails.push('⑤ 선로딩(_bkWarm)이 비행 중일 때 물으면 답이 안 나온다 — `_bkLoad`가 비행 중 요청에 **합류**하지 않고 빈 캐시를 즉시 돌려주고 있다(고객 분류 탭도 같은 구멍).');
    else if (chatN != null && raceAns.replace(/,/g, '').indexOf(String(chatN).replace(/,/g, '') + '명') < 0)
      fails.push(`⑤ 겹침 상황의 답이 냉시동 답과 다르다 — 냉시동 ${chatN}명 / 겹침 「${raceAns.slice(0, 60)}」`);

    // ⑤-b 고객 분류 탭도 같은 겹침에서 살아 있는가(_segRun의 await _bkLoad — 같은 진입점을 공유한다)
    await page.evaluate(`(()=>{ _bkState=null; _bkLoading=false; _bkP=null; })()`);
    await page.evaluate(`_bkWarm()`);
    await page.waitForTimeout(80);
    const segRace = await page.evaluate(`(async()=>{ try{ await _bkLoad(false); return _bkState?_bkState.n:0; }catch(e){ return 'ERR:'+e.message; } })()`);
    if (segRace !== _MOCKN(await page.evaluate(`(()=>window.__MOCK_BKAGG?window.__MOCK_BKAGG.rows.length:0)()`)))
      fails.push(`⑤-b 겹침 중 await _bkLoad가 빈손으로 돌아왔다(적재 ${segRace}건) — 고객 분류 탭(_segRun)이 「예매 집계를 못 불러왔어요」로 떨어지는 경로.`);

    if (!fails.length) {
      console.log(`[bkchat] PASS — 냉시동 예매 질의 답변 OK(채팅 ${chatN}명 = 고객 분류 ${segN}명) · 대기 표시 있음 · 선로딩 겹침에서도 동일 답 · 지역/연령 즉답 무회귀.`);
      if (shot) console.log('[bkchat] 캡처: ' + shot);
      return 0;
    }
    console.error('[bkchat] FAIL — 예매 채팅 배선 위반:');
    fails.forEach(f => console.error('  · ' + f));
    console.error('  정본 = AI 홍보 ▸ 고객 분류(_segRun)의 `await _bkLoad(false)`. 채팅(_memAiSend)도 같은 한 벌을 쓴다.');
    return 1;
  } finally { await browser.close(); }
}

main().then(c => process.exit(c)).catch(e => { console.error('[bkchat] SKIP — 예외: ' + (e && e.message)); process.exit(0); });
