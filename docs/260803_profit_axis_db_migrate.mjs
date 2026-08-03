// 260803 예술성/사업성(수익성) 축 폐지 — DB(SharePoint 마스터) 정리 2단계 마이그레이션.
// ─────────────────────────────────────────────────────────────────────────────
// 무엇을 하나 (운영자 260803 결정: 1-b 무료여부 열 신설·이관 · 2-b 백업 후 완전 삭제):
//   [공통]    실행할 때마다 대상 4곳을 로컬 `_backup_profit_260803/`에 JSON+CSV 백업(읽기 전용 · .gitignore 등재).
//   [Phase A] (앱 머지 **전** 실행) 운영_전시마스터에 '무료여부' 열 신설 + 구 '수익성' 값 이관.
//               규칙 = 공공/상업 → ''(빈칸) · 그 외(무료·공란 등) → 'Y'  (구 앱 판정 「공공/상업 아님 = 무료」 100% 보존)
//               앱은 모르는 열을 무시하므로 A 단계는 라이브 무영향(멱등 — 재실행 시 기존 무료여부 값 보존).
//   [Phase B] (앱 머지·배포 **후** 실행) '수익성' 흔적 완전 삭제:
//               ① 운영_공연마스터 '수익성' 열 물리 삭제  ② 운영_전시마스터 '수익성' 열 물리 삭제
//               ③ 프로그램 시트 '수익성' 부가열 물리 삭제  ④ 운영_수익성 시트(레거시 override · 호출 0) 통째 삭제
//               (전부 Worker `/api/maint/*` 엔드포인트 — 헤더 이름 기반이라 열 밀림 사고 축과 무관 · 멱등)
//               실행 전 가드: 전시마스터에 '무료여부' 있어야 하고, 라이브 index.html에 구 코드(_anaProfitAxis)가
//               남아 있으면 중단(--force 로 무시 가능 — 배포 전 삭제 시 전시 전멸 사고 방지).
//
// ⚠️ 순서: [백업 확인] → Phase A → (PR 머지·Pages/Worker 배포 확인) → Phase B. 거꾸로 돌리면 가드가 막는다.
// ⚠️ 인증: 슈퍼 비번(기존 DB 작업 값) — 환경변수로만 전달(260620_exhib_db_ingest.mjs 전례 계승):
//     미리보기(백업+계획):  DB_PW=<슈퍼비번> node docs/260803_profit_axis_db_migrate.mjs --phase=a
//     반영:                DB_PW=<슈퍼비번> node docs/260803_profit_axis_db_migrate.mjs --phase=a --write
//                          DB_PW=<슈퍼비번> node docs/260803_profit_axis_db_migrate.mjs --phase=b --write
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const LIVE = "https://muteno.github.io/yeulmaru-promo/index.html";
const PW = process.env.DB_PW || "";
const SUB_PIN = process.env.SUB_PIN || "";
const WRITE = process.argv.includes("--write");
const FORCE = process.argv.includes("--force");
const PHASE = (process.argv.find((a) => a.startsWith("--phase=")) || "").split("=")[1] || "";
if (!PW) { console.error("✗ DB_PW 환경변수 필요(슈퍼 비번)."); process.exit(1); }
if (PHASE && PHASE !== "a" && PHASE !== "b") { console.error("✗ --phase=a 또는 --phase=b"); process.exit(1); }

async function call(method, p, body) {
  const headers = { "Content-Type": "application/json", "X-App-Password": PW };
  if (SUB_PIN) headers["X-Sub-Admin-PIN"] = SUB_PIN;
  const res = await fetch(API + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) throw new Error(method + " " + p + " → " + res.status + " " + txt.slice(0, 300));
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

// ── 백업 (항상 실행 · 읽기 전용) ─────────────────────────────────────────────
const BK_DIR = path.resolve("_backup_profit_260803");
function csvEsc(v) { const s = String(v == null ? "" : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function saveBackup(name, data) {
  fs.mkdirSync(BK_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const base = path.join(BK_DIR, ts + "_" + name);
  fs.writeFileSync(base + ".json", JSON.stringify(data, null, 1), "utf8");
  const headers = data.headers || [];
  const rows = data.rows || [];
  const csv = "﻿" + [headers.map(csvEsc).join(",")].concat(rows.map((r) => headers.map((h) => csvEsc(r[h])).join(","))).join("\r\n");
  fs.writeFileSync(base + ".csv", csv, "utf8");
  console.log("  💾", name, "→", rows.length, "행 백업 (", path.basename(base) + ".json/.csv )");
  return data;
}
async function backupAll() {
  console.log("● 백업(읽기 전용) →", BK_DIR);
  const out = {};
  out.perfMaster = saveBackup("운영_공연마스터", await call("GET", "/api/ops?sheet=" + encodeURIComponent("공연마스터") + "&fresh=1"));
  out.exMaster = saveBackup("운영_전시마스터", await call("GET", "/api/ops?sheet=" + encodeURIComponent("전시마스터") + "&fresh=1"));
  out.override = saveBackup("운영_수익성", await call("GET", "/api/ops?sheet=" + encodeURIComponent("수익성")));   // 없으면 note:'시트 없음' + rows:[] 응답 — 그대로 기록
  out.programs = saveBackup("프로그램", await call("GET", "/api/sheet/program"));
  return out;
}

// ── Phase A: 전시마스터 무료여부 신설·이관 ──────────────────────────────────
async function phaseA(bk) {
  const { headers = [], rows = [] } = bk.exMaster || {};
  const hasFree = headers.includes("무료여부"), hasProfit = headers.includes("수익성");
  console.log("\n● Phase A — 운영_전시마스터 무료여부 이관 (수익성:", hasProfit ? "있음" : "없음", "· 무료여부:", hasFree ? "있음" : "없음", ")");
  if (!hasProfit && !hasFree) { console.error("✗ 수익성·무료여부 둘 다 없음 — 이관 소스 부재. 백업 JSON에서 수동 확인 필요."); process.exit(1); }
  if (!hasProfit && hasFree) { console.log("✓ 이미 이관 완료 상태(수익성 없음 · 무료여부 있음) — 할 일 없음."); return; }
  const newHeaders = hasFree ? headers.slice() : headers.concat(["무료여부"]);
  let nFree = 0, nKeep = 0;
  const newRows = rows.map((r) => {
    const cur = String(r["무료여부"] == null ? "" : r["무료여부"]).trim();
    if (cur) { nKeep++; return r; }                                  // 멱등 — 이미 채워진 행 보존
    const p = String(r["수익성"] == null ? "" : r["수익성"]).trim();
    const free = (p === "공공" || p === "상업") ? "" : "Y";           // 구 앱 판정(공공/상업 외 = 무료) 그대로
    if (free) nFree++;
    return Object.assign({}, r, { "무료여부": free });
  });
  console.log("  계획: 총", rows.length, "행 · 무료(Y) 표기", nFree, "행 · 기존값 보존", nKeep, "행");
  newRows.filter((r) => String(r["무료여부"] || "").trim() === "Y").slice(0, 10).forEach((r) => console.log("   · 무료 →", r["전시ID"], r["전시명"], "(수익성:", (r["수익성"] || "(공란)") + ")"));
  if (!WRITE) { console.log("  (DRY-RUN) 반영하려면 --write"); return; }
  const res = await call("POST", "/api/ops", { sheet: "전시마스터", headers: newHeaders, rows: newRows });
  console.log("  →", JSON.stringify(res));
  console.log("✓ Phase A 완료. 다음 = PR 머지·배포 확인 후 --phase=b");
}

// ── Phase B: 수익성 흔적 완전 삭제 ──────────────────────────────────────────
async function phaseB(bk) {
  console.log("\n● Phase B — 수익성 열/시트 완전 삭제");
  // 가드 1: Phase A 선행(전시마스터 무료여부 존재)
  if (!(bk.exMaster.headers || []).includes("무료여부")) { console.error("✗ 전시마스터에 무료여부 없음 — Phase A 먼저."); process.exit(1); }
  // 가드 2: 라이브 프론트가 아직 구 코드면 중단(배포 전 삭제 = 전시 전멸·성격 표기 오류)
  try {
    const live = await (await fetch(LIVE + "?cb=" + Math.random())).text();
    if (live.includes("_anaProfitAxis")) {
      console.error("✗ 라이브 index.html에 구 코드(_anaProfitAxis) 잔존 — 머지/Pages 배포(1~2분) 후 다시. (--force 로 무시 가능)");
      if (!FORCE) process.exit(1);
    } else console.log("  ✓ 라이브 프론트 = 신 코드(구 축 코드 없음)");
  } catch (e) { console.warn("  ⚠ 라이브 확인 실패(", String(e).slice(0, 80), ") — 계속하려면 배포 상태를 직접 확인"); if (!FORCE) process.exit(1); }
  const plan = [
    ["delete-column", { sheet: "운영_공연마스터", header: "수익성", confirm: "운영_공연마스터:수익성" }],
    ["delete-column", { sheet: "운영_전시마스터", header: "수익성", confirm: "운영_전시마스터:수익성" }],
    ["delete-column", { sheet: "프로그램", header: "수익성", confirm: "프로그램:수익성" }],
    ["delete-sheet", { sheet: "운영_수익성", confirm: "운영_수익성" }],
  ];
  plan.forEach((s) => console.log("  계획:", s[0], JSON.stringify(s[1])));
  if (!WRITE) { console.log("  (DRY-RUN) 반영하려면 --write"); return; }
  for (const [op, body] of plan) {
    const res = await call("POST", "/api/maint/" + op, body);
    console.log("  →", op, body.sheet, JSON.stringify(res));
  }
  // 검증: 헤더에서 수익성 소멸 + override 시트 소멸
  const v1 = await call("GET", "/api/ops?sheet=" + encodeURIComponent("공연마스터") + "&fresh=1");
  const v2 = await call("GET", "/api/ops?sheet=" + encodeURIComponent("전시마스터") + "&fresh=1");
  const v3 = await call("GET", "/api/sheet/program");
  const v4 = await call("GET", "/api/ops?sheet=" + encodeURIComponent("수익성"));
  const bad = [];
  if ((v1.headers || []).includes("수익성")) bad.push("운영_공연마스터");
  if ((v2.headers || []).includes("수익성")) bad.push("운영_전시마스터");
  if ((v3.headers || []).includes("수익성")) bad.push("프로그램");
  if ((v4.rows || []).length || !(v4.note || "").includes("시트 없음")) bad.push("운영_수익성(잔존?)");
  if (bad.length) { console.error("✗ 검증 실패 — 잔존:", bad.join(", ")); process.exit(1); }
  console.log("✓ Phase B 완료 — 수익성 열 3곳·override 시트 소멸 실측. 무료여부(전시)·회차·장르·홍보노출은 무접촉.");
}

(async () => {
  console.log("═ 260803 예술성/사업성 축 DB 마이그레이션 ═ phase:", PHASE || "(백업만)", "· write:", WRITE);
  const bk = await backupAll();
  const om = bk.override;
  console.log("  ℹ 운영_수익성(레거시 override):", (om.rows || []).length, "행", om.note ? "· " + om.note : "", "— 앱 호출 0(죽은 데이터) 확인분");
  if (PHASE === "a") await phaseA(bk);
  else if (PHASE === "b") await phaseB(bk);
  else console.log("\n(백업만 수행 — Phase 실행은 --phase=a|b)");
})().catch((e) => { console.error("✗ 오류:", e.message || e); process.exit(1); });
