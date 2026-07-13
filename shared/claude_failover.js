#!/usr/bin/env node
'use strict';
/**
 * claude_failover.js — 활성 계정(ACTIVE_ACCOUNT)부터 체인을 순환하며 `claude -p`를 폴오버 실행하는 SSOT 헬퍼.
 *
 * 왜: 이 레포 워크플로(nb-blog·blog-draft)는 구독 OAuth 계정 하나로 claude -p 를 1회 호출했다.
 *     활성 계정이 주간 쿼터로 막히면 그냥 실패했다(빈 응답→에러 커밋/코멘트). 이 헬퍼는 활성 계정부터
 *     체인을 돌며 쿼터/실패 시 다음 계정으로 넘어가 결과물을 확보하고, '활성 계정이 이번 런에 쿼터로
 *     막힘'을 신호 파일(.nomute_active_quota)로 남긴다 → account_failover.py 가 누적해 sticky 승격.
 *
 * 계약(이식팩 §2-b): 신호는 '활성=체인 첫 시도'가 쿼터로 넘어갈 때만 남긴다. 서브 계정 쿼터·비쿼터
 *     실패(빈 응답 등)는 신호 없이 폴오버만 한다(= '활성이 이번 런에 쿼터로 막혔다'만 카운트).
 *
 * 사용(github-script 스크립트 안):
 *   const path = require('path');
 *   const { runClaudeWithFailover } = require(path.join(process.env.GITHUB_WORKSPACE, 'shared/claude_failover.js'));
 *   const r = runClaudeWithFailover({ args: ['-p', '--max-turns', '1'], input: prompt, cwd: process.env.RUNNER_TEMP });
 *   const raw = r.ok ? r.raw : '';  const err = r.ok ? '' : r.error;
 *
 * env 전제(워크플로 step env — 계정 선택은 여기서만):
 *   ACTIVE_ACCOUNT = 시작 계정명(없으면 CHAIN[0])
 *   ACC_<계정명>   = 그 계정의 CLAUDE_CODE_OAUTH_TOKEN (CHAIN 각 원소마다 1개씩)
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ⚠️ 워크플로 env(ACC_*) 키의 계정명·순서와 반드시 동일. 순환 폴오버/승격 체인(account_failover.py CHAIN 과도 일치).
const CHAIN = ['EMS1130G', 'EMS1130N', 'MUTENO', 'MUTENONA', 'NOMUTEFB'];

// 진짜 '계정' 쿼터/레이트 시그널만 — 이게 매치되면 승격 카운트를 남기므로 좁게 잡는다(감사 반영).
// 폴오버(다음 계정 시도) 자체는 실패 종류와 무관하게 항상 하므로 여기서 넓힐 이유가 없다.
// 제외: overloaded·529(서버 전역 과부하 = 계정 무관) · exceeded(문맥 길이 초과 등 비쿼터 결정 오류) —
//       이들을 넣으면 멀쩡한 활성 계정이 오승격되거나 결정 오류로 전 계정이 연쇄 강등된다.
const QUOTA_RE = /usage limit|rate.?limit|\b429\b|too many requests|quota|weekly limit|reached your (?:usage|limit)|out of (?:credit|usage)/i;

function scrubToken(s) {
  return String(s).replace(/sk-ant-[A-Za-z0-9_-]{6,}/g, 'sk-ant-***');   // 에러 문자열의 OAuth 토큰 유출 방지(방어심화)
}

function tokenFor(acct) {
  return String(process.env['ACC_' + acct] || '').trim();
}

function signalPath() {
  return process.env.NOMUTE_QUOTA_SIGNAL ||
    path.join(process.env.GITHUB_WORKSPACE || process.env.RUNNER_TEMP || '/tmp', '.nomute_active_quota');
}

function markActiveQuota() {
  try { fs.writeFileSync(signalPath(), '1'); } catch (e) { /* best-effort — 신호 실패가 파이프라인을 막지 않게 */ }
}

// ACTIVE_ACCOUNT 를 첫 원소로 하는 CHAIN 순환 순서(활성이 체인에 없으면 CHAIN 원순서).
function rotatedOrder() {
  const active = String(process.env.ACTIVE_ACCOUNT || CHAIN[0]).trim();
  let start = CHAIN.indexOf(active);
  if (start < 0) {
    console.log('  ⚠️ 활성 계정 ' + active + ' 이 체인에 없음 — CHAIN 선두(' + CHAIN[0] + ')부터 시도. vars.ACTIVE_ACCOUNT 확인 필요.');
    start = 0;
  }
  const order = [];
  for (let i = 0; i < CHAIN.length; i++) order.push(CHAIN[(start + i) % CHAIN.length]);
  return order;
}

/**
 * 활성 계정부터 체인을 순회하며 claude -p 실행. 첫 성공(비어있지 않은 출력)에서 반환.
 * @returns {{ok:boolean, raw?:string, error?:string, account:?string, order:string[], triedIndex?:number}}
 */
function runClaudeWithFailover(opts) {
  opts = opts || {};
  const args = opts.args || ['-p', '--max-turns', '1'];
  const order = rotatedOrder();
  let lastErr = '';

  for (let i = 0; i < order.length; i++) {
    const acct = order[i];
    const token = tokenFor(acct);
    if (!token) {
      lastErr = 'ACC_' + acct + ' 토큰 없음(시크릿 미등록?) — 건너뜀';
      console.log('  ⏭️  ' + lastErr);
      if (i === 0) { markActiveQuota(); }   // 활성 계정 토큰 소실 = 죽은 계정에 영구 고정 방지(승격으로 self-heal)
      continue;
    }
    try {
      // 자식 env: 형제 계정 토큰(ACC_*)은 최소권한 위해 제거하고 선택 계정 토큰만 노출(감사 반영).
      const childEnv = Object.assign({}, process.env, { CLAUDE_CODE_OAUTH_TOKEN: token });
      for (const c of CHAIN) { delete childEnv['ACC_' + c]; }
      const raw = execFileSync('claude', args, {
        input: opts.input,
        encoding: 'utf8',
        maxBuffer: opts.maxBuffer || 20 * 1024 * 1024,
        cwd: opts.cwd || process.cwd(),
        env: childEnv,
      }).trim();
      if (raw) {
        if (i > 0) console.log('  🔀 폴오버 성공: ' + acct + ' (활성 ' + order[0] + ' 건너뜀, ' + i + '번째 대체)');
        else console.log('  ✅ 활성 계정 ' + acct + ' 성공');
        return { ok: true, raw: raw, account: acct, order: order, triedIndex: i };
      }
      lastErr = '빈 응답 (' + acct + ')';
      console.log('  ⚠️ ' + acct + ' 빈 응답 — 다음 계정 시도');   // 쿼터 확증 불가 → 신호 없이 폴오버
    } catch (e) {
      // stdout 도 결합(쿼터가 stdout 에만 실려 exit≠0 인 경우 미탐 방지) + 토큰 유출 스크럽.
      const emsg = scrubToken(String(((e && e.stderr) || '') + ' ' + ((e && e.stdout) || '') + ' ' + ((e && e.message) || e)).trim());
      lastErr = emsg.slice(0, 1500);
      const isQuota = QUOTA_RE.test(emsg);
      if (i === 0 && isQuota) { markActiveQuota(); }   // 활성(첫 시도)이 쿼터 → 승격 신호(이식팩 §2-b)
      console.log('  ⚠️ ' + acct + ' 실패' + (isQuota ? '(쿼터 추정)' : '') + ' — 다음 계정 시도');
    }
  }
  return { ok: false, error: lastErr || '전 계정 실패', account: null, order: order };
}

module.exports = { runClaudeWithFailover, CHAIN, QUOTA_RE, rotatedOrder };

// 로컬 점검용(claude 호출 안 함): node shared/claude_failover.js  → 체인·활성 기준 순환 순서·신호 경로 출력.
if (require.main === module) {
  console.log('CHAIN      =', CHAIN.join(' → '));
  console.log('ACTIVE     =', String(process.env.ACTIVE_ACCOUNT || CHAIN[0]).trim());
  console.log('폴오버 순서 =', rotatedOrder().join(' → '));
  console.log('신호 경로  =', signalPath());
}
