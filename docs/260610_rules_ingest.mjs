#!/usr/bin/env node
// 사무처리규정 조항 인제스트 — docs/260610_rules_rows.json(535조항) → Worker '규정' 시트 전체 교체
// 사용: DB_PW=관리자비번 node docs/260610_rules_ingest.mjs   (서브admin이면 DB_PIN=핀, DB_PW 생략)
// ⚠️ Worker에 /api/chatbot/rules 라우트가 배포되어 있어야 함 (src/index.js 260610 버전)
import fs from 'fs';
const BASE = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev';
const PW = process.env.DB_PW || '0510';
const PIN = process.env.DB_PIN || '';
const data = JSON.parse(fs.readFileSync(new URL('./260610_rules_rows.json', import.meta.url), 'utf8'));
console.log('조항 rows:', data.rows.length);
const r = await fetch(BASE + '/api/chatbot/rules', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-App-Password': PW, 'X-Sub-Admin-PIN': PIN }, body: JSON.stringify({ rows: data.rows }) });
console.log(r.status, (await r.text()).slice(0, 200));
