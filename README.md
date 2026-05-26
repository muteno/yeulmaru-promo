# 예울마루 홍보 계획표 — 배포 가이드

## 구조

```
[브라우저]  ──4자리 비번──▶  [HTML (GitHub Pages)]
                                    │ fetch
                                    ▼
                           [Cloudflare Worker]
                                    │ Client Credentials
                                    ▼
                           [Azure AD → Graph API]
                                    │
                                    ▼
                           [SharePoint 엑셀]
```

## 1단계: Cloudflare Worker 배포

### 사전 준비
```bash
npm install -g wrangler
wrangler login
```

### 시크릿 등록
```bash
cd worker
wrangler secret put AZURE_CLIENT_ID
# → 입력: 9f3a0105-aa86-4a8b-bad0-bd651688d854

wrangler secret put AZURE_TENANT_ID
# → 입력: 95768064-89cb-48c0-b5e5-e7bd309abcbd

wrangler secret put AZURE_CLIENT_SECRET
# → 입력: Azure Portal에서 확인 (.streamlit/secrets.toml의 client_secret 값)

wrangler secret put APP_PASSWORD
# → 입력: 4자리 비밀번호 (원하는 번호)
```

### 배포
```bash
wrangler deploy
```

배포 후 URL 확인 (예: `https://yeulmaru-promo-api.YOUR.workers.dev`)

### 로컬 테스트 (선택)
```bash
wrangler dev
# → http://localhost:8787
```

## 2단계: Azure AD 앱 설정 확인

**중요**: Client Credentials Flow는 앱 권한(Application permission)이 필요.

Azure Portal → 앱 등록 → yeulmaru_dashboard → API 사용 권한:
- `Files.Read.All` (Application) ← **Delegated 말고 Application**
- `Files.ReadWrite.All` (Application)
- `Sites.Read.All` (Application)
- `Sites.ReadWrite.All` (Application)

현재 Delegated만 있으면 → **Application 권한 추가 + 관리자 동의** 필요.

## 3단계: HTML 배포

### `web/index.html` 수정
```js
// 이 줄을 Worker 배포 URL로 변경
const API = 'https://yeulmaru-promo-api.YOUR.workers.dev';
```

### GitHub Pages 배포
```bash
# 예울마루 org에 새 레포 생성 또는 기존 레포 활용
git init
git add .
git commit -m "feat: 홍보 계획표 v1"
git remote add origin https://github.com/yeulmaru/yeulmaru-promo.git
git push -u origin main
```

GitHub → Settings → Pages → Source: main, /(root) → Save

URL: `https://yeulmaru.github.io/yeulmaru-promo/web/`

## 트러블슈팅

### "서버 연결 실패"
- Worker URL이 올바른지 확인
- `wrangler tail`로 Worker 로그 확인

### "Token error 401"
- Azure AD 앱에 Application 권한이 있는지 확인
- client_secret 만료 여부 확인

### "File not found"
- SharePoint 파일명이 `통합 문서1.xlsm`인지 확인
- `worker/src/index.js`의 SP 객체에서 파일명 수정 가능

### CORS 에러
- `wrangler.toml`의 `ALLOWED_ORIGIN`을 GitHub Pages URL로 제한 가능
