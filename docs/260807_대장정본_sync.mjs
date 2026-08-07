// 260807 운영관리대장 정본 동기 — 반입기 (계획 JSON → 운영_세부운영관리대장(정리) 전체 교체)
// ─────────────────────────────────────────────────────────────────────────────
// 짝 스크립트: docs/260807_대장정본_plan.py 가 만든 docs/260807_대장정본_계획.json 을 그대로 쓴다.
//   이 파일은 **값을 만들지 않는다** — 계획 JSON을 검증하고 POST할 뿐이다.
//   반입 경로 = 앱 모달과 같은 Worker API(POST /api/ops). SharePoint 마스터 직접 편집 금지 원칙 준수.
//
// 【안전 장치 4중】 — 하나라도 걸리면 시트 무접촉으로 중단한다.
//   ① 지문 대조 : 실행 직전 라이브를 fresh 조회해 계획이 계산된 스냅샷과 같은지 확인.
//                 다르면 = 그 사이 누가 모달로 고쳤다 = 계획이 낡음 → 중단(plan.py 재실행하라고 안내).
//                 전체 교체 쓰기라, 낡은 계획을 밀면 그 사이의 남의 수정이 조용히 지워진다.
//   ② 행수 가드 : 결과 행수가 라이브보다 줄면 중단(전체 교체에서 가장 위험한 사고 = 말소).
//   ③ 보존 검사 : 라이브의 모든 (공연명·장르1·공연ID·상태) 조합이 결과에 그대로 있는지 다중집합 대조.
//   ④ 합계 가드 : 연도별 Σ발권유료가 라이브 대비 **줄어드는 해**가 있으면 중단
//                 (의도된 정정 2건은 감소분이 아주 작다 — 임계 초과 감소 = 정렬 사고 신호).
//
// ⚠ 인증: 쓰기는 admin. 환경변수로만 받는다(KEYS.md 원칙 — 값 미저장).
//     미리보기: node docs/260807_대장정본_sync.mjs                       # 검증만, 시트 무접촉
//     반영:     YM_PIN=<관리자PIN> node docs/260807_대장정본_sync.mjs --write
//               (또는 DB_PW=<슈퍼비번> node ... --write)
//
// ⚠ 쓰기 후 즉시 재조회는 옛 값을 줄 수 있다(Graph eventual consistency — 260804 실측 ~12초).
//   본 스크립트는 검증 재조회 전에 15초 기다린다. 불일치로 끝나도 **재실행 금지** — fresh GET으로 먼저 확인.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const SHEET = "세부운영관리대장(정리)";
const PW = process.env.DB_PW || process.env.YM_PW || "0510";
const PIN = process.env.YM_PIN || "";
const WRITE = process.argv.includes("--write");
const __dir = path.dirname(fileURLToPath(import.meta.url));

const S = (v) => (v === undefined || v === null ? "" : String(v).trim());
const N = (v) => { const n = parseFloat(S(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? null : n; };

async function call(method, p, body) {
  const headers = { "Content-Type": "application/json", "X-App-Password": PW };
  if (PIN) headers["X-Sub-Admin-PIN"] = PIN;
  const res = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${txt.slice(0, 200)}`);
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

/** plan.py의 fingerprint()와 같은 산식 — 헤더 + 모든 셀 값의 sha256 앞 16자리. */
function fingerprint(rows, headers) {
  const h = crypto.createHash("sha256");
  h.update(headers.join("\x1f") + "\x1e");
  for (const r of rows) h.update(headers.map((k) => S(r[k])).join("\x1f") + "\x1e");
  return h.digest("hex").slice(0, 16);
}

const bag = (rows, keys) => {
  const m = new Map();
  for (const r of rows) { const k = keys.map((x) => S(r[x])).join("\x1f"); m.set(k, (m.get(k) || 0) + 1); }
  return m;
};
const paidByYear = (rows) => {
  const m = new Map();
  for (const r of rows) { const y = S(r["년도"]), p = N(r["발권유료"]); if (y && p !== null) m.set(y, (m.get(y) || 0) + p); }
  return m;
};

(async () => {
  const plan = JSON.parse(fs.readFileSync(path.join(__dir, "260807_대장정본_계획.json"), "utf8"));
  const { headers, rows, diff } = plan;
  console.log(`● 계획: ${rows.length}행 · ${headers.length}열 (원본 ${plan.src})`);
  console.log(`   덮어씀 ${diff.덮어씀.length} · 보강 ${diff.보강.length} · 신규 ${diff.추가.length} · 라이브전용 유지 ${diff.유지} · 발권초대 ${diff.초대신규}행`);

  console.log("\n● 라이브 fresh 조회…");
  const live = await call("GET", `/api/ops?sheet=${encodeURIComponent(SHEET)}&fresh=1`);
  console.log(`   현재 ${live.count}행 · ${live.headers.length}열`);

  // ① 지문 대조
  const fp = fingerprint(live.rows, live.headers);
  if (fp !== plan.fingerprint) {
    console.error(`✗ 라이브가 계획 수립 시점과 다릅니다 (계획 ${plan.fingerprint} · 현재 ${fp}).`);
    console.error("  그 사이 누가 모달로 고쳤다는 뜻입니다. 전체 교체를 강행하면 그 수정이 지워집니다.");
    console.error("  → python3 docs/260807_대장정본_plan.py <원본.xlsx> 로 계획을 다시 만든 뒤 실행하세요.");
    process.exit(1);
  }
  console.log(`   ✓ 지문 일치 (${fp})`);

  // ② 행수 가드
  if (rows.length < live.count) { console.error(`✗ 결과가 라이브보다 ${live.count - rows.length}행 적습니다 — 말소 위험, 중단.`); process.exit(1); }
  console.log(`   ✓ 행수 ${live.count} → ${rows.length} (+${rows.length - live.count})`);

  // ③ 보존 검사
  const K = ["공연명", "장르1", "공연ID", "상태"];
  const b0 = bag(live.rows, K), b1 = bag(rows, K);
  const lost = [...b0].filter(([k, n]) => (b1.get(k) || 0) < n);
  if (lost.length) {
    console.error(`✗ 라이브 행 ${lost.length}종이 결과에 없습니다 — 중단.`);
    lost.slice(0, 10).forEach(([k]) => console.error("   ", k.split("\x1f").join(" | ")));
    process.exit(1);
  }
  console.log(`   ✓ 라이브 ${b0.size}종 조합 전량 보존`);

  // ④ 합계 가드 — 연도별 Σ발권유료 감소 감시(의도된 정정은 -4가 최대)
  const p0 = paidByYear(live.rows), p1 = paidByYear(rows);
  const drops = [...p0].map(([y, v]) => [y, (p1.get(y) || 0) - v]).filter(([, d]) => d < 0);
  const TOL = -50;
  const bigDrop = drops.filter(([, d]) => d < TOL);
  if (bigDrop.length) {
    console.error(`✗ 연도별 발권유료가 크게 줄었습니다 — 정렬 사고 의심, 중단:`);
    bigDrop.forEach(([y, d]) => console.error(`    ${y}: ${d}`));
    process.exit(1);
  }
  console.log("\n   연도별 Σ발권유료 (라이브 → 계획)");
  [...new Set([...p0.keys(), ...p1.keys()])].sort().forEach((y) => {
    const a = p0.get(y) || 0, b = p1.get(y) || 0, d = b - a;
    console.log(`     ${y || "(공란)"}  ${a.toLocaleString().padStart(9)} → ${b.toLocaleString().padStart(9)}  ${d ? (d > 0 ? "+" : "") + d.toLocaleString() : ""}`);
  });

  if (!WRITE) { console.log("\n(DRY-RUN · 시트 무접촉) 반영하려면 YM_PIN=<관리자PIN> node docs/260807_대장정본_sync.mjs --write"); return; }
  if (!PIN && !process.env.DB_PW) { console.error("\n✗ YM_PIN(관리자 PIN) 또는 DB_PW(슈퍼 비번)가 필요합니다."); process.exit(1); }

  console.log(`\n● 운영_세부운영관리대장(정리) 전체 교체 (${rows.length}행 · ${headers.length}열)…`);
  console.log("  →", JSON.stringify(await call("POST", "/api/ops", { sheet: SHEET, headers, rows })));

  console.log("\n● 15초 대기 후 검증 재조회 (Graph 반영 지연 — 260804 실측 ~12초)…");
  await new Promise((r) => setTimeout(r, 15000));
  const after = await call("GET", `/api/ops?sheet=${encodeURIComponent(SHEET)}&fresh=1`);
  const okRows = after.count === rows.length;
  const okCol = after.headers.includes("발권초대");
  const okFp = fingerprint(after.rows, after.headers) === fingerprint(rows, headers);
  console.log(`   행수 ${after.count}/${rows.length} ${okRows ? "✓" : "✗"} · 발권초대 열 ${okCol ? "✓" : "✗"} · 내용 일치 ${okFp ? "✓" : "✗"}`);
  if (!(okRows && okCol && okFp)) {
    console.error("✗ 검증 불일치 — **재실행하지 마세요**. 10~20초 뒤 fresh GET으로 먼저 확인하세요(반영 지연일 수 있음).");
    process.exit(1);
  }
  console.log("✓ 완료. 다른 시트(일일입력·공연마스터·전시*)는 무변경.");
})().catch((e) => { console.error("✗ 오류:", e.message || e); process.exit(1); });
