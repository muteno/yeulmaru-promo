// 260807 운영관리대장 나머지 2장 반입 — 운영_공연대장 · 운영_기획공연판매현황 (신설/교체, idempotent)
// ─────────────────────────────────────────────────────────────────────────────
// 데이터 = docs/260807_공연대장_계획.json (docs/260807_공연대장_plan.py 산출).
//   이 파일은 **값을 만들지 않는다** — 계획 JSON을 검증하고 POST할 뿐이다.
//
// ⚠ **기존 시트는 한 줄도 안 건드린다.** 대상 두 시트는 전용 신설이라 전체 교체(풀라이트)가 안전하다
//   (세부운영관리대장 동기의 「지문 대조」 같은 동시성 가드가 필요 없는 이유 = 다른 세션이 쓸 시트가 아니다).
//   그래도 **이미 내용이 있으면 멈춘다** — 언젠가 다른 용도로 쓰이고 있었다면 그걸 밀어버리면 안 된다(--force로만 강행).
//
// ⚠ 인증: 쓰기는 admin. 환경변수로만(KEYS.md 원칙 — 값 미저장).
//     미리보기: node docs/260807_공연대장_sync.mjs                        # 검증만, 시트 무접촉
//     반영:     YM_PIN=<관리자PIN> node docs/260807_공연대장_sync.mjs --write
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const PW = process.env.DB_PW || process.env.YM_PW || "0510";
const PIN = process.env.YM_PIN || "";
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const __dir = path.dirname(fileURLToPath(import.meta.url));
const S = (v) => (v === undefined || v === null ? "" : String(v).trim());

async function call(method, p, body) {
  const headers = { "Content-Type": "application/json", "X-App-Password": PW };
  if (PIN) headers["X-Sub-Admin-PIN"] = PIN;
  const res = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

(async () => {
  const plan = JSON.parse(fs.readFileSync(path.join(__dir, "260807_공연대장_계획.json"), "utf8"));
  const todo = [];

  for (const s of plan.sheets) {
    console.log(`\n● 운영_${s.sheet} — ${s.rows.length.toLocaleString()}행 · ${s.headers.length}열`);
    console.log(`   ${s.note}`);
    // 헤더 중복 = 행 객체 키가 먹혀 열이 통째로 사라진다. 계획 단계에서 풀었지만 여기서 한 번 더 막는다.
    const dup = s.headers.filter((h, i) => s.headers.indexOf(h) !== i);
    if (dup.length) { console.error(`✗ 머리글 중복: ${dup.join(", ")} — 중단`); process.exit(1); }
    if (!s.rows.length) { console.error("✗ 행 0 — 중단"); process.exit(1); }
    // 모든 행이 헤더 키를 갖는가(빠진 키는 빈칸으로 나가므로 조용한 결손이 된다)
    const miss = s.headers.filter((h) => !s.rows.every((r) => h in r));
    if (miss.length) { console.error(`✗ 일부 행에 없는 열: ${miss.join(", ")} — 중단`); process.exit(1); }

    const cur = await call("GET", `/api/ops?sheet=${encodeURIComponent(s.sheet)}`);
    const exists = !cur.note && cur.count > 0;
    console.log(`   라이브 현재: ${cur.note ? cur.note : cur.count + "행"}`);
    if (exists && !FORCE) {
      console.error(`✗ 운영_${s.sheet}에 이미 ${cur.count}행이 있습니다. 덮어쓰려면 --force. 중단.`);
      process.exit(1);
    }
    const d = s.diag;
    console.log(`   공연ID 파생 ${d["공연ID 파생"]}/${d.행} · 집계·빈행 제외 ${d["제외(집계·빈행)"]}`);
    for (const [c, lst] of Object.entries(d["숫자열_비숫자값"] || {}))
      console.log(`   ⚠ ${c} 열 비숫자 값 ${lst.length}건(원문 그대로) — 매출·집계 축으로 쓰기 전 확인 필요`);
    todo.push(s);
  }

  if (!WRITE) { console.log("\n(DRY-RUN · 시트 무접촉) 반영하려면 YM_PIN=<관리자PIN> node docs/260807_공연대장_sync.mjs --write"); return; }
  if (!PIN && !process.env.DB_PW) { console.error("\n✗ YM_PIN(관리자 PIN) 또는 DB_PW(슈퍼 비번)가 필요합니다."); process.exit(1); }

  for (const s of todo) {
    console.log(`\n● 운영_${s.sheet} 쓰기…`);
    console.log("  →", JSON.stringify(await call("POST", "/api/ops", { sheet: s.sheet, headers: s.headers, rows: s.rows })));
  }

  console.log("\n● 15초 대기 후 검증 재조회 (Graph 반영 지연 — 260804 실측 ~12초)…");
  await new Promise((r) => setTimeout(r, 15000));
  let bad = 0;
  for (const s of todo) {
    const a = await call("GET", `/api/ops?sheet=${encodeURIComponent(s.sheet)}&fresh=1`);
    const okRows = a.count === s.rows.length;
    const okHdr = s.headers.every((h) => a.headers.includes(h));
    console.log(`   운영_${s.sheet}: 행 ${a.count}/${s.rows.length} ${okRows ? "✓" : "✗"} · 열 ${okHdr ? "✓" : "✗"}`);
    if (!(okRows && okHdr)) bad++;
  }
  if (bad) { console.error("✗ 검증 불일치 — **재실행하지 마세요**. 10~20초 뒤 fresh GET으로 먼저 확인하세요."); process.exit(1); }
  console.log("✓ 완료. 기존 시트(세부운영관리대장·일일입력·공연마스터·전시*)는 무변경.");
})().catch((e) => { console.error("✗ 오류:", e.message || e); process.exit(1); });
