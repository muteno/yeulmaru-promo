# Rate Limit 진단 미완 상태 메모

**작성**: 2026-05-26 (Session 15 끝)
**상태**: 🟡 부분 작동 — 내부 사용 안전, 외부 공개 전 추가 진단 필요

---

## 🎯 한 줄 요약

`env.RATE_LIMITER.limit()`가 **debug 모드(즉시 return)에선 작동, 정상 모드(시트 fetch 후 return)에선 작동 안 함**. 원인 미확정. 다른 보안 patch 다 작동하니 내부 사용 OK.

---

## ✅ 작동 확인 (5/6 patch)

| Patch | 상태 | 검증 방법 |
|---|---|---|
| PIN 형식 검증 (`/^\d{4}$/`) | ✅ | `pin="abc"` → 400 |
| 비밀번호 길이 검증 (4~20자) | ✅ | `newPassword="ab"` → 400 |
| CORS Origin (`https://yeulmaru.github.io`) | ✅ | OPTIONS preflight 응답 헤더 확인 |
| set-password 성공 시 logToSheet (`SET_PASSWORD`) | ✅ | 코드 검증 (실제 비번 변경 안 해서 trace 직접 확인은 못 함) |
| Error 메시지 일반화 (`e.message` → `"서버 처리 중 오류가 발생했어요"`) | ✅ | 코드 검증 |

## ⚠️ 작동 안 함 (1/6 patch)

**Rate Limit 5회/60초 차단** — 정상 모드에서 `.limit()` counter 누적 안 됨.

### 확인된 사실

1. **Binding 정상 등록**:
   - Cloudflare 대시보드 → Bindings → `RATE_LIMITER` (Type: Rate limiter, Namespace ID: 1001, Limit: 5, Period: 60s)
   - `env.RATE_LIMITER`가 Worker 환경에 정상 주입 (`typeof === "object"`, `.limit()` 메서드 존재)

2. **API 호출 자체는 정상**:
   - `health` endpoint에 `testLimit` debug 추가 → 7회 호출 시 6회 success + 7회 fail (정상 작동)
   - 즉 `.limit()` *호출 자체*는 작동

3. **set-password에선 안 됨**:
   - debug 모드 (`.limit()` 호출 후 즉시 return) → 6회 success + 7회 fail (정상 작동)
   - 정상 모드 (`.limit()` 호출 → 시트 fetch → return 403) → 10회 호출 모두 success=true (counter 누적 X)
   - **유일한 차이**: `.limit()` 호출 후 *시트 fetch 2-4초 대기*

### 가설 (확신도순)

**가설 1 (확신도 60%)**: **Cloudflare Workers Rate Limiting의 미문서화 동작** — `.limit()` 호출 후 *긴 비동기 작업*이 있으면 counter 누락 또는 cancel.
- 근거: debug 모드(빠른 return)는 작동 / 정상 모드(시트 fetch 후 return)는 안 됨. 차이가 시간뿐.
- 검증: 진단 endpoint 추가 필요 (아래 D 옵션 참조)

**가설 2 (확신도 30%)**: **Worker isolate가 시트 fetch 동안 다른 PoP로 재배치** → 각 PoP counter 별개 → 누적 X.
- 근거: 같은 IPv6 IP인데 Cloudflare 측에서 다른 instance로 인식 가능
- 검증: 같은 PoP 강제 routing 어려움 (Cloudflare 측 라우팅)

**가설 3 (확신도 10%)**: **try/catch nested 깊이 영향**.
- 근거: health는 outer try, set-password는 nested try
- 반증: try 안에서도 health는 작동 → 깊이만의 문제는 아님

---

## 🛡️ 현재 보안 수준 평가

### 내부 사용 (지금 환경)

| 항목 | 평가 |
|---|---|
| 사용자 수 | 5명 (예울마루 직원) |
| 도메인 | `workers.dev` (검색엔진 미노출) |
| 공격 표면 | 내부 망 + 신뢰 사용자 |
| brute force 시도 시 평균 시간 | **5.5시간** (10000 PIN 조합 × 시트 fetch 2초 ÷ 분당 30회 호출) |
| 실제 공격 위험 | **매우 낮음** |

**결론**: 내부 5명 사용엔 *충분히 안전*. Rate Limit 없어도 다른 보호로 brute force 어려움 + 사용자 식별 가능 (logToSheet).

### 외부 공개 시 (향후)

| 항목 | 평가 |
|---|---|
| 공격 표면 | 인터넷 전체 |
| 자동화 공격 가능성 | 높음 |
| brute force 시도 시간 | 5.5시간도 *자동화로는 짧음* |
| **Rate Limit 필요성** | **🔴 필수** |

**결론**: 외부 공개 *전*에 Rate Limit 진짜 작동 시켜야.

---

## 🔬 추가 진단 방법 (다음 세션용)

### D 옵션 — 진단 endpoint 추가

set-password 흐름 *내에서* Rate Limit 호출 결과 *직접 추적*. 시트 fetch 전후로 두 번 호출 + 결과 비교.

```js
// 임시 진단용 endpoint (admin 인증 필요)
if (url.pathname === "/api/_rltest" && request.method === "POST" && isAdmin(pw, env)) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const r1 = await env.RATE_LIMITER.limit({ key: "setpw:" + ip });
  const token = await getToken(env);
  await handleGetSheet(token, "\uB2F4\uB2F9\uC790");  // 시트 fetch (지연 발생)
  const r2 = await env.RATE_LIMITER.limit({ key: "setpw:" + ip });
  return json({ before: r1, after: r2, ip }, env);
}
```

**기대 결과**:
- `r1.success` true + `r2.success` true → 시트 fetch 동안 counter 영향 무관 (가설 1 강화)
- `r1.success` true + `r2.success` false → 정상 작동 (시트 fetch와 무관)
- 둘 다 false → 다른 이상 동작

### 다른 검증 방법

- **Cloudflare Observability 활성화** + `console.log` 추가 → Worker logs에서 `.limit()` 결과 시점별 추적
- **wrangler tail** 명령으로 실시간 로그
- **다른 Rate Limit binding 만들기** (namespace ID 9999) → 동일 문제 재현 여부

---

## 📋 외부 공개 전 체크리스트

- [ ] Rate Limit 진짜 작동 시키기 (D 옵션 또는 KV 수동 counter)
- [ ] Worker 도메인을 `*.workers.dev` → `예울마루 자체 도메인`으로 옮기기 (선택)
- [ ] WAF Rate Limiting Rules 추가 (custom domain일 때만 가능)
- [ ] 모니터링 — `/api/auth/set-password` 호출 빈도 alert
- [ ] 비밀번호 정책 강화 검토 (특수문자 강제 등)

---

## 📁 관련 파일

- Worker patched (배포본): `docs/260526_yeulmaru_promo_worker_patched_v2_214830.js` (.gitignore로 git X, OneDrive sync로 양 PC 동일)
- 원본 백업: `docs/260526_yeulmaru_promo_worker_patched_205115.js`
- Session 15 audit 보고서: `docs/260526_session15_audit_180000.md`

---

## 🎬 다음 세션 핸드오프 메모

세웅의 의사: "**찜찜하니까 메모하고 넘어가자**". 다음 액션:
- 외부 공개 일정 잡힐 때 D 옵션부터 진행
- 그 전까지 *내부 5명 한정 운영*
- Rate Limit 미작동은 *알려진 한계*로 인지 + 다른 보호 (PIN format, CORS, logging)로 충분

세션 15 작업은 여기서 마무리. 세웅이 처음 예고했던 "**시스템 안에서 기능적인 면에서 발생한 문제**" (UI 버그 리스트) 다음 세션 또는 같은 세션 후속에서 진행.