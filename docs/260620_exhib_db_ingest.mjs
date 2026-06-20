// 260620 전시 DB 인제스트 — 공연 DB 구조를 미러한 전시 3개년(2024·2025·2026) 데이터.
// ─────────────────────────────────────────────────────────────────────────────
// 두 시트를 풀라이트(생성/교체, idempotent):
//   ① 운영_전시일일   = 일자별 사실(공연의 운영_일일입력 대응) — 전시ID 조인키, 일일증감 + 누계
//   ② 운영_전시마스터 = 전시별 1행 차원(공연의 운영_공연마스터 대응) — 목표/최종/수익성/상태
//
// 공연 시트(일일입력/공연마스터/색인)는 한 줄도 안 건드림. 전시는 전용 시트로만.
// 데이터: docs/260620_전시일일.json, docs/260620_전시마스터.json (원본 엑셀 3개 파싱 결과).
//
// ⚠️ 인증: 슈퍼 비번(기존 DB 작업 값)이면 게이트+admin 둘 다 통과. 비번은 환경변수로만:
//     미리보기:  DB_PW=<슈퍼비번> node docs/260620_exhib_db_ingest.mjs
//     반영:      DB_PW=<슈퍼비번> node docs/260620_exhib_db_ingest.mjs --write
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const PW = process.env.DB_PW || "";
const SUB_PIN = process.env.SUB_PIN || "";
const WRITE = process.argv.includes("--write");
const __dir = path.dirname(fileURLToPath(import.meta.url));
if (!PW) { console.error("✗ DB_PW 환경변수 필요(슈퍼 비번)."); process.exit(1); }

async function call(method, p, body){
  const headers = {"Content-Type":"application/json","X-App-Password":PW};
  if(SUB_PIN) headers["X-Sub-Admin-PIN"]=SUB_PIN;
  const res = await fetch(API+p, {method, headers, body: body?JSON.stringify(body):undefined});
  const txt = await res.text();
  if(!res.ok) throw new Error(method+" "+p+" → "+res.status+" "+txt.slice(0,200));
  try{ return JSON.parse(txt); }catch{ return {raw:txt}; }
}
const load = f => JSON.parse(fs.readFileSync(path.join(__dir,f),"utf8"));

(async ()=>{
  const daily  = load("260620_전시일일.json");
  const master = load("260620_전시마스터.json");

  console.log("● 운영_전시일일   :", daily.rows.length, "행 ·", daily.headers.join(" | "));
  console.log("● 운영_전시마스터 :", master.rows.length, "전시");
  const yrs = {}; daily.rows.forEach(r=>{ const y=String(r["기준일자"]).slice(0,4); yrs[y]=(yrs[y]||0)+1; });
  console.log("  연도별 일일행:", Object.entries(yrs).map(([y,n])=>y+":"+n).join(" "));
  console.log("\n  마스터 미리보기(처음 3):");
  master.rows.slice(0,3).forEach(m=>console.log("   ·", m.전시ID, m.전시명, "| 목표관객", m.목표관객, "최종유료", m.최종유료, "수익성", m.수익성||"(미정)", m.상태));

  if (!WRITE){ console.log("\n(DRY-RUN) 반영하려면 --write 붙여 다시 실행."); return; }

  console.log("\n● 운영_전시일일 풀라이트…");
  console.log("  →", JSON.stringify(await call("POST","/api/ops",{sheet:"전시일일",headers:daily.headers,rows:daily.rows})));
  console.log("● 운영_전시마스터 풀라이트…");
  console.log("  →", JSON.stringify(await call("POST","/api/ops",{sheet:"전시마스터",headers:master.headers,rows:master.rows})));
  console.log("✓ 완료. 공연 시트는 무변경.");
})().catch(e=>{ console.error("✗ 오류:", e.message||e); process.exit(1); });
