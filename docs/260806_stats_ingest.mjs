// 260806 공연 접속통계 인제스트 — 예울마루 admin에서 긁은 TSV를 운영_공연접속통계 시트에 반영.
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ 인증: 쓰기(POST /api/ops)는 admin. 슈퍼 비번(= 기존 DB 작업에 쓰던 그 값)이면 통과.
//    → 비번은 코드/대화에 적지 말고 실행 시 환경변수로만 전달:
//
//    DRY-RUN(미리보기, 기본):  DB_PW=<슈퍼비번> node docs/260806_stats_ingest.mjs
//    실제 반영:                DB_PW=<슈퍼비번> node docs/260806_stats_ingest.mjs --write
//    시트 최초 생성(1회만):    DB_PW=<슈퍼비번> node docs/260806_stats_ingest.mjs --write --create
//
// 동작: ① TSV 읽기 → 모수>0 인 행만 대상
//       ② --create : opsWriteSheet 경로로 시트를 새로 만들며 전체 기록 (헤더 포함)
//          그 외    : mode=append 로 스냅샷 누적
//       ③ 접속통계는 '살아있는 누적 카운터'다. 실행 시점의 스냅샷이므로 수집일시를 반드시 남긴다.
//          (실측: uid 1295 가 1시간 만에 129 → 130 으로 증가)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const API   = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const PW    = process.env.DB_PW || "";
const SUB   = process.env.SUB_PIN || "";           // 슈퍼비번이면 불필요
const WRITE = process.argv.includes("--write");
const CREATE= process.argv.includes("--create");
const TSV   = process.argv.find(a => a.endsWith(".tsv")) || "docs/260806_공연접속통계_전체.tsv";
const SHEET = "공연접속통계";                       // 실제 시트명은 운영_공연접속통계

if (!PW) { console.error("✗ DB_PW 환경변수가 필요해요 (슈퍼 비번)."); process.exit(1); }

// 수집일시: 파일을 만든 시점을 고정값으로 박는다(재실행해도 같은 스냅샷임을 보장)
const COLLECTED_AT = process.env.COLLECTED_AT || "2026-08-06";

async function call(method, path, body) {
  const headers = { "Content-Type": "application/json", "X-App-Password": PW };
  if (SUB) headers["X-Sub-Admin-PIN"] = SUB;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt }; }
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${txt.slice(0, 200)}`);
  return j;
}

// ── TSV 파싱 ────────────────────────────────────────────────────────────────
const raw = readFileSync(TSV, "utf8").replace(/^﻿/, "");
const lines = raw.split(/\r?\n/).filter(Boolean);
const srcHdr = lines[0].split("\t");
const recs = lines.slice(1).map(l => {
  const c = l.split("\t");
  const o = {};
  srcHdr.forEach((h, i) => { o[h] = c[i] ?? ""; });
  return o;
});

// 모수>0 만 (접속 데이터가 없는 공연은 시트를 채울 이유가 없다)
const withData = recs.filter(r => /^\d+$/.test(r["모수"]) && Number(r["모수"]) > 0);

// 최종 헤더 = 수집일시 + 원본 컬럼
const HEADERS = ["수집일시", ...srcHdr];
const rows = withData.map(r => ({ 수집일시: COLLECTED_AT, ...r }));

// ── 미리보기 ────────────────────────────────────────────────────────────────
const sumN = withData.reduce((a, r) => a + Number(r["모수"]), 0);
console.log("── 미리보기 ──────────────────────────────");
console.log("  TSV 파일        :", TSV);
console.log("  전체 공연       :", recs.length, "건");
console.log("  접속데이터 보유 :", withData.length, "건");
console.log("  누적 접속 합계  :", sumN.toLocaleString(), "건");
console.log("  수집일시        :", COLLECTED_AT);
console.log("  대상 시트       : 운영_" + SHEET);
console.log("  모드            :", CREATE ? "CREATE(시트 생성 + 전체 기록)" : "APPEND(스냅샷 누적)");
console.log("  컬럼            :", HEADERS.join(" | "));
console.log("\n  상위 5건:");
withData.slice().sort((a, b) => Number(b["모수"]) - Number(a["모수"])).slice(0, 5)
  .forEach(r => console.log(`    ${String(r["모수"]).padStart(6)}  ${r["제목"].slice(0, 40)}`));

if (!WRITE) {
  console.log("\n(DRY-RUN) 실제 반영하려면 --write 를 붙여 다시 실행하세요.");
  console.log("최초 1회는 --write --create 로 시트를 만들어야 합니다.");
  process.exit(0);
}

// ── 반영 ────────────────────────────────────────────────────────────────────
(async () => {
  if (CREATE) {
    // headers 를 주면 worker 의 opsWriteSheet → ensureSheet 가 시트를 새로 만든다
    const res = await call("POST", "/api/ops", { sheet: SHEET, headers: HEADERS, rows });
    console.log("\n✓ 시트 생성 + 기록 완료:", JSON.stringify(res));
  } else {
    // append 는 시트가 이미 있어야 한다 (없으면 sheet empty/missing)
    const res = await call("POST", "/api/ops", { sheet: SHEET, mode: "append", rows });
    console.log("\n✓ append 완료:", JSON.stringify(res));
  }
  // 검증
  const back = await call("GET", "/api/ops?sheet=" + encodeURIComponent(SHEET));
  console.log("  현재 시트 행수:", back.count);
})().catch(e => { console.error("✗ 오류:", e.message || e); process.exit(1); });
