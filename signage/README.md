# yeulmaru-promo / signage

예울마루 사이니지(Samsung Tizen DID) 원격 송출 — **promo 앱에 흡수된 버전**.

기존 `yeulmaru-signage` 레포(Cloudflare Pages)를 promo 레포 안으로 옮겨, **promo 앱의 "사이니지 관리" 화면에서 사진을 갈아끼울 수 있게** 한 것이다.

## 구조

```
[GitHub: yeulmaru-promo/signage] ──(GitHub Pages 배포)──> https://yeulmaru.github.io/yeulmaru-promo/signage/ <──(5min poll)── [사이니지 DID]
        ▲
        │ promo 앱 "사이니지 관리"가 GitHub API로 manifest.json + 이미지 커밋
```

- `index.html` — 풀스크린 슬라이드쇼. `manifest.json`의 `images` 배열을 읽어 `slideDuration`(ms)마다 순환, 5분마다 manifest 재폴링, 1시간마다 전체 새로고침(Tizen 안정성).
- `manifest.json` — **표시할 이미지 목록의 단일 소스.** `images` 배열 순서 = 표시 순서. promo 앱이 자동 갱신.
- `*.jpg` — 표시 이미지.
- `_headers` — (구 Cloudflare 캐시 정책. GitHub Pages는 무시 — 캐시는 index.html이 `?t=` 쿼리로 처리. 참고용 보존)

## 사진 갈아끼우기 — promo 앱에서

1. promo 앱 로그인(관리자) → **플랫폼 현황** 모달 → 우상단 **📺 사이니지 관리**
2. 이미지 추가/삭제/순서변경 + 표시 시간 조정
3. **저장(GitHub 커밋)** — GitHub PAT(Contents 쓰기 권한) 필요
4. 약 1~2분 후 GitHub Pages 배포 → 사이니지는 다음 폴링(최대 5분)에 갱신

수동으로 바꾸려면 이 폴더의 `manifest.json` `images` 배열을 직접 편집하고 이미지 파일을 push 해도 된다.

## 사이니지 기기 URL (1회 재지정)

기존 Cloudflare URL(`https://yeulmaru-signage.pages.dev`)에서 아래로 변경:

```
https://yeulmaru.github.io/yeulmaru-promo/signage/   (소문자 필수)
```

현장에서 USB 키보드로: Home → URL Launcher Settings → Install Web App → 위 URL 등록 → 재부팅.
(최초 설정: Menu → System → Play Via → URL Launcher / Auto Power On = ON)

확인 후 기존 `yeulmaru-signage` 레포와 Cloudflare Pages 프로젝트는 삭제해도 된다.

## 사진 규격 권장

| 항목 | 권장값 |
|---|---|
| 비율 | 사이니지 설치 방향에 맞춤(세로형 DID면 9:16) |
| 포맷 | JPG (용량 ≤ 2MB 권장) |
| 색공간 | sRGB |

## 디버그

- 새 사진을 안 가져올 때: GitHub Pages 배포 성공 확인 → 브라우저로 `https://yeulmaru.github.io/yeulmaru-promo/signage/` 직접 열어 확인 → 기기 URL Launcher 재시작.
- MDC 원격 재부팅: `samsung-mdc {사이니지IP}:1515 power reboot`
