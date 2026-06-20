// 260618 전시일일 인제스트 — 전시(기획전시) 일일 판매현황을 '운영_전시일일' 별도 시트로 넣는다.
// ─────────────────────────────────────────────────────────────────────────────
// 왜 별도 시트인가: _salesBuild(판매현황)는 '운영_일일입력' 전체를 '공연'으로 취급(공연명 기준 조인).
//   전시를 일일입력에 섞으면 판매현황·분석에 전시가 공연으로 잘못 뜬다 → 충돌.
//   그래서 전시는 '운영_전시일일'로 분리, 공연 시트(일일입력/공연마스터/색인)는 한 줄도 안 건드림.
//
// 데이터: docs/260618_exhib_data.json (107개 일일 시트 파싱 결과 203행, 전시 5종, 2/13~6/18).
//
// ⚠️ 인증: Worker가 X-App-Password 게이트 + 쓰기는 admin. 슈퍼 비번(기존 DB 작업 값)이면 둘 다 통과.
//   비번은 코드/대화에 적지 말고 실행 시 환경변수로만:
//     미리보기:  DB_PW=<슈퍼비번> node docs/260618_exhib_ingest.mjs
//     반영:      DB_PW=<슈퍼비번> node docs/260618_exhib_ingest.mjs --write
//
// 동작: ① 데이터 로드 ② 라이브 일일입력·공연색인 GET → 공연명과 '이름 충돌' 점검(정규화 비교)
//       ③ 운영_전시일일 풀라이트(시트 생성·교체, idempotent). 드라이런 기본.
// ─────────────────────────────────────────────────────────────────────────────

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const API = "https://yeulmaru-promo-api.yeulmarumaster.workers.dev";
const PW = process.env.DB_PW || "";
const SUB_PIN = process.env.SUB_PIN || "";
const WRITE = process.argv.includes("--write");
const __dir = path.dirname(fileURLToPath(import.meta.url));

if (!PW) { console.error("✗ DB_PW 환경변수 필요(슈퍼 비번). 예) DB_PW=**** node docs/260618_exhib_ingest.mjs"); process.exit(1); }

// index.html _uName 과 동일 정규화 (이름 충돌 점검용)
function uName(s){
  return String(s||"")
    .replace(/\s*[-–—]\s*여수\s*$/,"")
    .replace(/[〈〉<>「」『』\[\]（）()]/g,"")
    .replace(/[_\-–—·.,’'"~!:：]/g,"")
    .replace(/\s+/g,"")
    .toLowerCase();
}
async function call(method, p, body){
  const headers = {"Content-Type":"application/json","X-App-Password":PW};
  if(SUB_PIN) headers["X-Sub-Admin-PIN"]=SUB_PIN;
  const res = await fetch(API+p, {method, headers, body: body?JSON.stringify(body):undefined});
  const txt = await res.text();
  if(!res.ok) throw new Error(method+" "+p+" → "+res.status+" "+txt.slice(0,200));
  try{ return JSON.parse(txt); }catch{ return {raw:txt}; }
}

const SHEET = "전시일일"; // → 운영_전시일일
const HEADERS = ["기준일자","전시명","기간","누계유료","누계무료","누계총인원","누계금액","점유율"];

(async ()=>{
  const data = JSON.parse(fs.readFileSync(path.join(__dir,"260618_exhib_data.json"),"utf8"));
  const exhibNames = [...new Set(data.map(d=>d.title))];
  console.log("● 전시 데이터:", data.length, "행 ·", exhibNames.length, "종");
  exhibNames.forEach(n=>console.log("   ·", n));

  // 이름 충돌 점검 — 전시명이 기존 공연명(일일입력·색인)과 정규화 후 겹치지 않는지
  console.log("\n● 공연 시트와 이름 충돌 점검…");
  const perfNames = new Set();
  for (const s of ["일일입력","공연색인"]) {
    try {
      const d = await call("GET", "/api/ops?sheet="+encodeURIComponent(s));
      const H = d.headers||[];
      const nameCol = H.find(h=>/공연명|대표명|사업명/.test(h)) || "공연명";
      (d.rows||[]).forEach(r=>{ const nm=String(r[nameCol]||"").trim(); if(nm) perfNames.add(uName(nm)); });
      console.log("   ·", s, "에서 공연명", d.rows?d.rows.length:0, "건 수집");
    } catch(e) { console.log("   · ("+s+" 읽기 실패 — 점검 건너뜀:", String(e.message||e).slice(0,60)+")"); }
  }
  const collisions = exhibNames.filter(n=>perfNames.has(uName(n)));
  if (collisions.length) {
    console.log("   ⚠ 이름 충돌:", collisions.join(", "), "→ 이 전시명이 공연에도 존재. 그래도 시트는 분리라 데이터 충돌은 없지만, 명칭 통일을 검토하세요.");
  } else {
    console.log("   ✓ 충돌 없음 — 전시명 5종이 공연 색인/일일입력과 안 겹침. 안전하게 분리 가능.");
  }

  // 전시일일 행 구성
  const rows = data.map(d=>({
    "기준일자": d.date,
    "전시명": d.title,
    "기간": d.period,
    "누계유료": d.paid!=null?d.paid:"",
    "누계무료": d.free!=null?d.free:"",
    "누계총인원": d.total!=null?d.total:"",
    "누계금액": d.amount!=null?d.amount:"",
    "점유율": d.occ!=null?d.occ:""
  }));

  console.log("\n── 미리보기 ──");
  console.log("대상 시트: 운영_"+SHEET, "(풀라이트 = 생성/교체)");
  console.log("헤더:", HEADERS.join(" | "));
  console.log("행수:", rows.length, " (처음/마지막)");
  console.log("  ", HEADERS.map(h=>rows[0][h]).join(" | "));
  console.log("  ", HEADERS.map(h=>rows[rows.length-1][h]).join(" | "));
  console.log("공연 시트(일일입력·공연마스터·색인)는 건드리지 않음.");

  if (!WRITE) { console.log("\n(DRY-RUN) 반영하려면 --write 붙여 다시 실행."); return; }

  console.log("\n● 운영_"+SHEET+" 풀라이트 중…");
  const res = await call("POST", "/api/ops", { sheet: SHEET, headers: HEADERS, rows });
  console.log("✓ 완료:", JSON.stringify(res));
})().catch(e=>{ console.error("✗ 오류:", e.message||e); process.exit(1); });
