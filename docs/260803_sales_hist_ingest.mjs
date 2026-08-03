// 260803 역대 기획공연 판매결과 인제스트 — 운영_기획공연판매결과 시트 풀라이트(생성/교체, idempotent)
// ─────────────────────────────────────────────────────────────────────────────
// 데이터: docs/260803_기획공연판매결과.json (원본 엑셀 3파일 파싱 결과 — docs/260803_sales_hist_parse.py 산출)
// 2012~2024 기획공연 262행 · 매출/정산 축(총판매금액·수수료·순수입 등 35열) · 공연ID 조인 250행.
// 다른 시트(일일입력/공연마스터/세부운영관리대장(정리)/전시*)는 한 줄도 안 건드림 — 전용 신설 시트에만 쓴다.
//
// ⚠️ 인증: 쓰기는 admin(슈퍼 비번). 비번은 환경변수로만:
//     미리보기:  node docs/260803_sales_hist_ingest.mjs                    # 게이트 비번으로 라이브 대조까지
//     반영:      DB_PW=<슈퍼비번> node docs/260803_sales_hist_ingest.mjs --write
// ─────────────────────────────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const PW = process.env.DB_PW || "0510";   // 기본 = 앱 게이트 비번(GET 전용). --write는 슈퍼 비번 필요.
const WRITE = process.argv.includes("--write");
const __dir = path.dirname(fileURLToPath(import.meta.url));

async function call(method, p, body){
  const res = await fetch(API + p, { method, headers: { "Content-Type": "application/json", "X-App-Password": PW }, body: body ? JSON.stringify(body) : undefined });
  const txt = await res.text();
  if (!res.ok) throw new Error(method + " " + p + " → " + res.status + " " + txt.slice(0, 200));
  try { return JSON.parse(txt); } catch { return { raw: txt }; }
}

(async () => {
  const db = JSON.parse(fs.readFileSync(path.join(__dir, "260803_기획공연판매결과.json"), "utf8"));
  const rows = db.rows;

  console.log("● 운영_기획공연판매결과:", rows.length, "행 ·", db.headers.length, "열");
  const yrs = {}; let rev = 0, nid = 0;
  rows.forEach(r => { yrs[r.년도] = (yrs[r.년도] || 0) + 1; if (typeof r.총판매금액 === "number") rev += r.총판매금액; if (r.공연ID) nid++; });
  console.log("  연도별:", Object.entries(yrs).map(([y, n]) => y + ":" + n).join(" "));
  console.log("  Σ총판매금액:", Math.round(rev / 1e7) / 10 + "억원 · 공연ID 조인:", nid + "/" + rows.length);
  console.log("  미리보기(처음 2):");
  rows.slice(0, 2).forEach(r => console.log("   ·", r.공연ID || "(ID없음)", r.년도, r.공연명, "| 총판매", r.총판매금액, "| 순수입", r.순수입));

  // 라이브 현황 대조(있으면 교체 안내)
  try {
    const cur = await call("GET", "/api/ops?sheet=" + encodeURIComponent("기획공연판매결과"));
    console.log("\n  라이브 시트 현재:", cur.count != null ? cur.count + "행" + (cur.note ? " (" + cur.note + ")" : "") : "확인불가");
  } catch (e) { console.log("\n  라이브 대조 실패(무해):", e.message.slice(0, 80)); }

  if (!WRITE) { console.log("\n(DRY-RUN) 반영하려면 DB_PW=<슈퍼비번> ... --write 로 다시 실행."); return; }

  console.log("\n● 운영_기획공연판매결과 풀라이트…");
  console.log("  →", JSON.stringify(await call("POST", "/api/ops", { sheet: "기획공연판매결과", headers: db.headers, rows })));
  console.log("✓ 완료. 기존 공연·전시 시트는 무변경.");
})().catch(e => { console.error("✗ 오류:", e.message || e); process.exit(1); });
