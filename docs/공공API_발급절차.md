# 🔌 공공 API 발급·연동 절차 — 여수·순천·광양 (260802)

> **이 문서는 「아직 도입 안 된」 외부 API의 발급 절차서다.** 실제로 발급·연동이 끝나면 그 키는
> `docs/KEYS.md`(시크릿 인벤토리)로 옮겨 적는다 — 이 문서는 절차, KEYS.md는 현황.
> **값(키 문자열)은 여기에도 KEYS.md에도 적지 않는다.** 이름·위치·절차만.
>
> 대상 4종 = ①한국교통안전공단 주차정보 ②한국관광공사 지역별 방문자수 ③KOPIS ④여수시 자체 포털.
> 스펙은 260802 세션에서 각 제공처 페이지를 **직접 열어 실측**했다(아래 「검증 기록」 참조).

---

## ✅ 260803 09:00 KST — 포털 전환 작업 종료, 신청 가능 (해소됨)

공지 **「[안내] 공공데이터포털 개편에 따른 일부 서비스 이용 제한 안내」(2026-07-24 등록)** 의
작업 기간 **2026-07-29(수) 19:00 ~ 2026-08-02(일) 18:00** 이 예정대로 끝났다. 260803 09:00 KST 실측:

| 확인 대상 | 작업 중(08-02 16:10) | 지금(08-03 09:00) | 판정 |
|---|---|---|---|
| 로그인 페이지 | 200 (제한 안내) | **302 → SSO 로그인 폼 200** | ✅ 재개 |
| 마이페이지 인증키 | 200 (제한 안내) | **302 → 동일 SSO** | ✅ 재개 |
| 주차 게이트웨이 | 401 Unauthorized | **403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`** | ✅ 정상 응답 복귀 |
| 관광 게이트웨이 | 401 Unauthorized | **403 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`** | ✅ 정상 응답 복귀 |
| 일정 변동 후속 공지 | — | 없음 (게시판에 추가 공지 0건) | ✅ 연장 없음 |

> 게이트웨이 응답이 밋밋한 `401 Unauthorized`에서 포털 규격 에러 `403 SERVICE_KEY_IS_NOT_REGISTERED_ERROR`로
> 바뀐 것이 전환 완료 신호다(둘 다 「키가 무효」라는 뜻이지만, 후자가 정상 가동 시의 응답 형식).
> 공지사항 게시판의 글 번호가 4902번대 → 2640번대로 재부여된 것도 시스템이 실제로 교체됐다는 방증.

### 🔺 개편으로 바뀐 것 — 절차에 반영 필요

1. **로그인이 SSO로 이관됐다.** `www.data.go.kr/uim/login/loginView.do`는 이제
   `https://auth.data.go.kr/sso/common-login`으로 리다이렉트된다(아이디/비밀번호 + 네이버·카카오 간편 로그인).
   로그인 화면에 **「Any-ID 사용을 위해 최초 1회 아이디/비밀번호 로그인이 필요합니다」** 안내가 붙어 있다
   → **간편 로그인만 쓰지 말고 기존 아이디/비번으로 한 번 들어갈 것.**
2. **기존 인증키(`KASI_KEY`)가 개편 후에도 유효한지 확인이 필요하다(미확인).**
   키 없이는 밖에서 확인할 수 없다. 확인 방법 두 가지 — ①로그인 후 마이페이지 인증키 발급현황의
   일반 인증키(Decoding) 값이 그대로인지 ②**앱 캘린더에 공휴일이 정상 표시되는지**(`KASI_KEY`를 쓰는 유일한 기능이라
   키가 죽으면 바로 드러난다). 둘 중 하나라도 어긋나면 `docs/KEYS.md` §2를 먼저 갱신할 것.

> 📌 호출 URL은 **`https://`로 쓴다.** 상세페이지 표기는 `http://`지만 https도 동일하게 응답하며(실측),
> 프론트가 HTTPS인 이 레포에서는 혼합 콘텐츠를 피하기 위해서라도 https가 맞다.

---

## 0. 시작 전 — 새 키를 받을 필요가 없다는 것부터 확인

이미 Worker 시크릿에 **`KASI_KEY`(공공데이터포털 인증키 — 천문연 특일정보=공휴일)** 가 있다(`docs/KEYS.md` §2).
**공공데이터포털은 계정당 인증키가 1개**이고 모든 API가 그 키 하나를 공유한다. API별로 필요한 건
**「활용신청」 클릭뿐**이다. 즉 ①②는 **새 키 발급 0건**.

| 단계 | 페이지 |
|---|---|
| 0-1. 로그인 (SSO로 리다이렉트 — 최초 1회는 아이디/비밀번호로) | https://www.data.go.kr/uim/login/loginView.do |
| 0-2. 내 인증키 확인 (마이페이지 → 인증키 발급현황) | https://www.data.go.kr/iim/api/selectAPIAcountView.do |

> 0-2에서 나오는 **일반 인증키(Decoding)** 값 = 지금 `KASI_KEY`에 들어있는 값과 같아야 정상.
> 다르면 KASI_KEY를 발급한 계정이 다른 계정이라는 뜻 → 어느 계정인지부터 확정할 것
> (`docs/KEYS.md`에 공공데이터포털 계정이 명시돼 있지 않다 — 이번 기회에 채워 넣는다).

### 0-3. 🔑 신청이 끝난 뒤 — 키를 어떻게 다루나 (활용신청 완료 시점의 정답)

**최종적으로 관리할 키는 딱 2개다.**

| 시크릿 이름 | 무엇 | 어디서 가져오나 |
|---|---|---|
| `DATAGO_KEY` | 공공데이터포털 인증키 — **①주차 + ②방문자수 + 기존 공휴일이 전부 이 키 하나** | https://www.data.go.kr/iim/api/selectAPIAcountView.do |
| `KOPIS_KEY` | KOPIS 서비스키 (별도 체계) | KOPIS 마이페이지 |

> 기존 `KASI_KEY`는 공휴일 코드가 참조 중이므로 **지우지 말고 같은 값으로 `DATAGO_KEY`를 병기**한다.
> (이름만 범용화하는 것 — 나중에 공휴일 코드도 `DATAGO_KEY`를 보게 정리하면 `KASI_KEY`를 뗄 수 있다.)

#### ⚠️ Encoding / Decoding — 여기서 제일 많이 틀린다

마이페이지에 인증키가 **「일반 인증키(Encoding)」**·**「일반 인증키(Decoding)」** 두 줄로 나온다. **같은 키의 두 표기**다.

- **URL 문자열에 그대로 이어붙일 때(curl·브라우저 주소창) → `Encoding` 판**
- **코드가 `encodeURIComponent()`로 감싸 붙일 때 → `Decoding` 판**

Decoding 값에 `+` `/` `=` 가 섞여 있어서, 그걸 그대로 URL에 붙이면 **정상 키인데도
`SERVICE_KEY_IS_NOT_REGISTERED_ERROR`가 난다.** 키가 죽은 게 아니라 인코딩 실수인 경우가 대부분이다.
→ **Worker 시크릿에는 `Decoding` 판을 넣고 코드에서 `encodeURIComponent()`로 감싼다**(이중 인코딩 방지).

#### 넣는 곳 = Cloudflare Worker 시크릿 (브라우저 아님)

이 앱의 프론트는 GitHub Pages 공개 사이트다. **`index.html`에 키를 박으면 그 순간 공개된다.**
`GITHUB_PAT`을 브라우저→서버로 옮긴 것과 같은 이유(`docs/KEYS.md` §1-a)로, 키는 Worker에만 둔다.

```powershell
# 레포 루트(wrangler.toml 있는 곳)에서. 실행하면 값을 물어보므로 명령줄에 값을 적지 말 것.
wrangler secret put DATAGO_KEY
wrangler secret put KOPIS_KEY
```

대시보드로 넣어도 된다: Workers & Pages → `yeulmaru-promo-api` → Settings → Variables and Secrets → **Secret 추가**.

> ⚠️ **시크릿은 `wrangler deploy`/자동 배포가 건드리지 않는다.** 코드 배포와 별개로 위 등록을 한 번 해야 한다.
> 등록 후에는 재배포 없이도 다음 요청부터 반영된다.

#### 하지 말 것

- 키 값을 **커밋·이슈·PR·채팅에 붙여넣지 않는다**(이 문서와 `docs/KEYS.md`에도 값은 안 적는다 — 이름·위치만).
- `.env`·`config.js` 같은 걸 새로 만들어 레포에 두지 않는다. 시크릿의 단일 보관처 = Cloudflare.
- 키가 노출됐다면 포털 마이페이지에서 **재발급 → Worker 시크릿 갱신** 순서로 회전한다.

#### 승인 상태부터 확인 (①은 심의승인이라 아직일 수 있다)

②관광공사는 자동승인이라 신청 즉시 되지만, **①주차정보는 심의승인**이라 신청해도 대기 상태일 수 있다.
마이페이지에서 상태가 「승인」인지 보고, 승인 전이면 §1-D 호출은 실패하는 게 정상이다.

---

## 1. 한국교통안전공단 주차정보 (실시간 잔여면수)

### 1-A. 절차 (순서대로)

| # | 할 일 | 페이지 |
|---|---|---|
| 1 | 데이터 상세 페이지 열기 | https://www.data.go.kr/data/15099883/openapi.do |
| 2 | 우측 상단 **[활용신청]** 클릭 | (같은 페이지 · 로그인 필요) |
| 3 | 신청 폼에서 **활용목적 = 「기타」**, 아래 문구 붙여넣기 | https://www.data.go.kr/tcs/dss/redirectDevAcountRequestForm.do?publicDataPk=15099883 |
| 4 | **상세기능 3종 모두 체크** (시설정보·운영정보·실시간정보) | 같은 폼 |
| 5 | 승인 대기 → 마이페이지에서 승인 확인 | https://www.data.go.kr/iim/api/selectAPIAcountView.do |

> ⚠️ **이 API는 개발단계도 「심의승인」이다** (자동승인 아님 — 페이지 실측). 신청 즉시 못 쓰고
> 담당부서(주차안전처) 심의를 기다려야 한다. ②·③보다 먼저 신청해 둘 것.
> 트래픽 = 개발계정 **10,000/일**. 무료.

**활용목적 붙여넣기용:**

```
GS칼텍스 예울마루(전남 여수시) 공연·전시 홍보 계획 수립용 내부 웹앱에서,
공연 당일 인근 공영주차장의 실시간 잔여 주차면수를 안내하기 위해 사용합니다.
관람객 안내 문구·홍보 콘텐츠 작성 시점 판단에만 활용하며, 데이터 재판매는 하지 않습니다.
```

### 1-B. 실측 스펙 (260802 확인)

- **서비스 URL**: `http://apis.data.go.kr/B553881/Parking`
- **공통 요청변수**: `serviceKey`(필) · `pageNo`(필) · `numOfRows`(필) · `format`(필, **1=XML / 2=JSON**)
- **오퍼레이션 3종**

| 기능 | 요청주소 | 주요 출력 |
|---|---|---|
| 주차장 시설정보 | `/PrkSttusInfo` | `prk_center_id` `prk_plce_nm` `prk_plce_adres` `prk_plce_entrc_la` `prk_plce_entrc_lo` `prk_cmprt_co` |
| 주차장 운영정보 | `/PrkOprInfo` | 요일별 `opertn_start_time`/`opertn_end_time` · `parking_chrge_bs_time`/`_bs_chrg` · `_one_day_chrge` 등 |
| **주차장 실시간 정보** | `/PrkRealtimeInfo` | `prk_center_id` · `pkfc_ParkingLots_total` · **`pkfc_Available_ParkingLots_total`** |

- 참고문서: `주차정보시스템_기술문서_수정본_20240702.docx` (상세 페이지에서 다운로드)

### 1-C. 🚨 설계상 반드시 알아야 할 두 가지

1. **지역 필터 파라미터가 없다.** 세 오퍼레이션 모두 `pageNo`/`numOfRows`뿐이라 **전국을 페이징으로 훑어야** 한다.
   → 실무 순서: `/PrkSttusInfo`를 한 번 전량 수집해 **`prk_plce_adres`에 「여수」/「순천」/「광양」이 들어간 행의
   `prk_center_id`만 추려 캐시**해 두고, 이후 `/PrkRealtimeInfo` 결과를 그 id로 join한다.
2. **실시간 응답에는 주소도 이름도 없다** (`prk_center_id`만). 위 1번의 join 없이는 화면에 못 쓴다.

### 1-D. 승인 후 첫 검증 — **「여수 데이터가 실제로 있는가」** (미확인 · 반드시 먼저)

> 🕒 **260803 현재 = 아직 심의 대기.** 발급된 인증키로 `/PrkSttusInfo`를 호출하면
> `403 SERVICE_KEY_IS_NOT_REGISTERED_ERROR (returnReasonCode 30)`가 난다. 같은 키로 ②관광은
> `0000 OK`가 나오므로 **키 문제가 아니라 이 API에 아직 키가 붙지 않은 것**(심의승인 대기)이다.
> 마이페이지에서 상태가 「승인」으로 바뀐 뒤 아래를 돌린다.

제공처가 "운영정보·실시간정보는 시설정보보다 수가 적다"고 명시했다. **여수·순천·광양 주차장이 이 시스템에
연계돼 있는지는 키 없이 확인 불가**다. 승인되면 아래를 먼저 돌려 0건이면 이 축은 접는다.

```bash
# {KEY} = 공공데이터포털 일반 인증키(**Encoding**) — URL에 그대로 붙일 때는 Encoding 판
curl -sS "https://apis.data.go.kr/B553881/Parking/PrkSttusInfo?serviceKey={KEY}&pageNo=1&numOfRows=9999&format=2" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);r=[x for x in d['response']['body']['items'] if any(k in (x.get('prk_plce_adres') or '') for k in ['여수','순천','광양'])];print(len(r),'건');[print(x['prk_center_id'],x['prk_plce_nm'],x['prk_plce_adres']) for x in r[:20]]"
```

PowerShell 판(운영자 PC):

```powershell
$KEY="{KEY}"
$r=Invoke-RestMethod "https://apis.data.go.kr/B553881/Parking/PrkSttusInfo?serviceKey=$KEY&pageNo=1&numOfRows=9999&format=2"
$r.response.body.items | Where-Object { $_.prk_plce_adres -match '여수|순천|광양' } |
  Select-Object prk_center_id, prk_plce_nm, prk_plce_adres | Format-Table -AutoSize
```

---

## 2. 한국관광공사 빅데이터 — 지역별 방문자수

### 2-A. 절차

| # | 할 일 | 페이지 |
|---|---|---|
| 1 | 데이터 상세 페이지 열기 | https://www.data.go.kr/data/15101972/openapi.do |
| 2 | **[활용신청]** → 활용목적 「기타」 + 아래 문구 | https://www.data.go.kr/tcs/dss/redirectDevAcountRequestForm.do?publicDataPk=15101972 |
| 3 | **개발단계 = 자동승인** → 신청 직후 바로 사용 가능 | — |
| 4 | 인증키 확인 후 2-C 테스트 | https://www.data.go.kr/iim/api/selectAPIAcountView.do |

**활용목적 붙여넣기용:**

```
GS칼텍스 예울마루(전남 여수시) 공연·전시 홍보 계획 수립용 내부 웹앱에서,
여수시·순천시·광양시의 일자별 방문자 수 추이를 확인해 홍보 콘텐츠 게시 시점을 정하는 데 사용합니다.
사내 담당자만 접근하는 비공개 페이지에 표시하며, 데이터 재판매는 하지 않습니다.
```

- 트래픽 = 개발계정 **1,000/일**. 무료. 운영단계 전환만 심의승인.

### 2-B. 실측 스펙 (Swagger 원문 확인)

- **호스트**: `https://apis.data.go.kr/B551011/DataLabService`
- **오퍼레이션**
  - `/locgoRegnVisitrDDList` — **기초 지자체**(여수시·순천시·광양시) ← 우리가 쓸 것
  - `/metcoRegnVisitrDDList` — 광역 지자체(전라남도)
- **요청변수**: `serviceKey`(필) · `MobileOS`(필, `ETC`) · `MobileApp`(필, 앱명) ·
  `startYmd`(필, YYYYMMDD) · `endYmd`(필, YYYYMMDD) · `numOfRows` · `pageNo`
- **출력**: `baseYmd`(기준연월일) · `signguCode`(시군구코드) · `signguNm`(시군구명) ·
  `daywkDivCd`/`daywkDivNm`(요일구분) · `touDivCd`/`touDivNm`(관광객구분) · **`touNum`(관광객수)**

> ⚠️ **여기도 시군구 필터 파라미터가 없다.** 전국 시군구가 한꺼번에 오므로 `numOfRows`를 크게 잡고
> **`signguNm`으로 클라이언트 필터**한다(`여수시`·`순천시`·`광양시`). 시군구코드를 따로 알 필요 없음.
> 또한 제공처 명시: **기초·광역은 집계 기준이 달라 임의 합산 불가**, 방문자 = 일자별 순방문자(2박3일 체류 = 3명).

### 2-C. 신청 직후 검증 (자동승인이라 바로 됨)

```bash
# {KEY} = 공공데이터포털 일반 인증키(**Encoding**) · 날짜는 최근 확정분으로
curl -sS "https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList?serviceKey={KEY}&MobileOS=ETC&MobileApp=yeulmaru-promo&startYmd=20260701&endYmd=20260707&numOfRows=9999&pageNo=1&_type=json" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);it=d['response']['body']['items']['item'];r=[x for x in it if x.get('signguNm') in ('여수시','순천시','광양시')];print(len(r),'건');[print(x['baseYmd'],x['signguNm'],x['touDivNm'],x['touNum']) for x in r[:20]]"
```

### 2-D. ✅ 실호출 검증 완료 (260803) — 결과와 그 함의

발급된 인증키로 실제 호출해 확인한 것:

- **응답 정상** (`resultCode 0000 / OK`). 하루치 = **807행**(전국 시군구 × 관광객구분 3종),
  7일 조회 시 5,649행. 여수·순천·광양은 `signguNm` 필터로 하루 9행씩 잡힌다.
- **`touNum`은 소수점이 붙는다**(예: `7445.669999999999`) — 표시할 땐 반올림 필요.
- **`touDivNm` 3종** = `현지인(a)` / `외지인(b)` / `외국인(c)`.
  홍보 판단에 쓸 것은 **외지인(b)** — 현지인은 상주인구라 거의 상수다.

#### 🚨 집계 지연 = **23일** (이게 이 데이터의 성격을 결정한다)

일자별로 찔러 본 결과 **데이터가 차 있는 마지막 날 = 2026-07-11**, 07-12부터는 `totalCount 0`.
조회 시점 08-03 기준 **약 3주 지연**이다(`업데이트 주기: 실시간` 표기는 갱신 방식을 말할 뿐 최신성이 아니다).

| 조회일 | 결과 |
|---|---|
| 20260711 | 807행 ✅ |
| 20260712 이후 (~0802) | 0행 ❌ |

**→ 「이번 주말 붐빌까」에는 못 쓴다.** 대신 **요일·계절 패턴**으로는 충분히 쓸 수 있다.
실제로 최근 30일치(0612~0711, 24,153행)로 외지인 요일 평균을 뽑으면:

| | 월 | 화 | 수 | 목 | 금 | 토 | 일 |
|---|---|---|---|---|---|---|---|
| **여수시** | 56,847 | 56,178 | 52,202 | 56,828 | 67,542 | **88,535** | 79,858 |
| 순천시 | 61,460 | 62,317 | 57,833 | 60,896 | 70,498 | **93,012** | 76,966 |
| 광양시 | 32,761 | 35,438 | 32,453 | 33,982 | 36,919 | **44,445** | 41,150 |

여수 기준 **토요일이 수요일의 1.70배**. 홍보 게시 요일을 정하는 근거로는 이 정도면 충분하다.
→ 앱에는 「실시간 방문객」이 아니라 **「요일·시기별 기대 방문객 지수」**로 붙이는 것이 데이터 성격에 맞다.

---

## 3. KOPIS (공연예술통합전산망) — 별도 키

### 3-A. 절차

| # | 할 일 | 페이지 |
|---|---|---|
| 1 | KOPIS 회원가입/로그인 | https://www.kopis.or.kr/ |
| 2 | 오픈API 안내 · 신청 | https://kopis.or.kr/por/cs/openapi/openApiInfo.do?menuId=MNU_00074 |
| 3 | 서비스키 발급 후 3-C 테스트 | — |
| 4 | 막히면 문의 | ☎ 02-2098-2945 (연계기관·API·My통계) |

> ⚠️ 2번 페이지는 이번 세션에서 **본문을 읽지 못했다**(JS 렌더링 · 봇 차단). **신청 폼의 정확한 위치와
> 승인 소요시간은 미확인** — 운영자가 로그인해 확인 후 이 표를 채울 것.
> 다만 **엔드포인트 2종은 라이브로 실증**했다(아래).

### 3-B. 실측 (키 없이 호출해 응답 확인 — 엔드포인트 존재 확인됨)

- `http://www.kopis.or.kr/openApi/restful/pblprfr` — 공연목록
- `http://www.kopis.or.kr/openApi/restful/prfstsTotal` — 공연통계(총계)
- 인증 파라미터 이름 = **`service`** (`serviceKey` 아님)
- 미등록 키로 호출 시 응답: `<returncode>02</returncode><errmsg>SERVICE KEY IS NOT REGISTERED ERROR</errmsg>`
  → **이 메시지가 사라지면 키가 살아난 것**이라 그대로 검증 신호로 쓸 수 있다.

### 3-C. 발급 후 첫 호출

```bash
# {KOPIS_KEY} = KOPIS에서 발급받은 서비스키
curl -sS "http://www.kopis.or.kr/openApi/restful/pblprfr?service={KOPIS_KEY}&stdate=20260801&eddate=20260831&cpage=1&rows=10"
```

키 없이 지금 돌려도 되는 「살아있는지」 확인용(에러 메시지가 정상 응답):

```bash
curl -sS "http://www.kopis.or.kr/openApi/restful/pblprfr?service=TEST&stdate=20260801&eddate=20260810&cpage=1&rows=5"
```

> **미확인**: 전남/여수로 좁히는 지역 파라미터(`signgucode` 계열)의 정확한 이름과 코드값은 확인하지 못했다.
> 키 발급 후 KOPIS 오픈API 명세서에서 확인해 여기에 적을 것.

---

## 4. 여수시 교통정보센터 · 공영주차장 포털

| 대상 | 주소 | 260802 접속 결과 |
|---|---|---|
| 여수시 교통정보센터 | http://its.yeosu.go.kr/ | **503 / 접속 실패** (외부망 차단인지 서비스 중단인지 **미확인**) |
| 여수시 공영주차장 정보 포털 | https://parking.yumcorp.or.kr/ | 200 (정상) |
| 여수시 빅데이터 포털 | https://www.yeosu.go.kr/data/main | 200 (정상) |

- **셋 다 Open API 제공 여부가 확인되지 않았다.** 화면에 실시간 값이 보여도 외부 호출 규격이 공개돼 있지
  않으면 붙일 수 없다(임의 스크래핑은 하지 않는다 — 운영 주체 동의 없는 수집은 금지).
- **다음 행동 = 기술 조회가 아니라 「문의」**:
  1. 여수시 빅데이터 포털 문의/정보공개 창구로 **「교통정보센터 주차장 실시간 정보의 Open API 제공 여부」** 질의
  2. 공영주차장은 운영주체가 **여수시 도시관리공단**이므로 별도 질의 필요
- 1번(교통안전공단 API)에 여수 주차장이 들어 있으면 이 4번은 **불필요**해진다 → **1-D 검증을 먼저** 할 것.

---

## 5. 붙일 때의 공통 원칙 (이 레포 기준)

- **키는 브라우저에 절대 노출하지 않는다.** GitHub Pages는 공개 사이트다 →
  `src/index.js`(Cloudflare Worker)에 엔드포인트를 만들고 프론트는 Worker만 호출한다
  (`GITHUB_PAT` 브라우저→서버 이관과 같은 이유 · `docs/KEYS.md` §1-a).
- **캐시는 기존 패턴 재사용**: `/api/gcal`의 **KV 10분 캐시 + stale-while-revalidate**가 이미 있다.
  방문자수는 일 단위라 훨씬 길게(6~24시간) 잡아도 된다 — 개발계정 1,000/일 제한과도 직결.
- **Worker 배포**: `main`에 `src/index.js`가 머지되면 `.github/workflows/deploy-worker.yml`이 자동 배포.
  **시크릿은 배포가 안 건드리므로** 새 키는 Cloudflare 대시보드에서 별도 등록해야 한다.
- **시크릿 이름 제안**: `DATAGO_KEY`(= 기존 `KASI_KEY`와 같은 값 · 이름만 범용으로) · `KOPIS_KEY`.
  기존 `KASI_KEY`는 공휴일 코드가 참조 중이므로 **지우지 말고 병기**한다.

---

## 검증 기록 (260802 세션 · 실측 근거)

| 항목 | 확인 방법 | 결과 |
|---|---|---|
| 주차 API 심의유형·트래픽·엔드포인트 3종 | data.go.kr 상세페이지 + 상세기능 탭 직접 조회 | ✅ 확인 |
| 방문자수 API 파라미터·출력필드 | 페이지 내장 Swagger JSON 파싱 | ✅ 확인 |
| KOPIS 엔드포인트 2종 존재 | 미등록 키로 실제 호출 → 규격 에러 응답 수신 | ✅ 확인 |
| KOPIS 신청 폼 위치·승인 소요·지역 파라미터 | 페이지 본문 로드 실패 | ❌ 미확인 |
| 여수 주차장이 교통안전공단 DB에 있는지 | 키 필요 | ❌ 미확인 (1-D에서 검증) |
| 방문자수 데이터의 실제 집계 지연폭 | 키 필요 | ❌ 미확인 (2-C에서 검증) |
| 여수시 자체 포털 Open API 유무 | 접속 실패/미공개 | ❌ 미확인 (문의 필요) |
| 포털 전환 작업으로 신청 차단 (08-02) | 공지 원문 조회 + 게이트웨이 401 실측 | ✅ 확인 → **08-03 해소** |
| 전환 종료·로그인 재개 (08-03 09:00 KST) | SSO 로그인 폼 200 + 게이트웨이 403 규격 에러 + 후속 공지 0건 | ✅ 확인 |
| 개편 후 기존 `KASI_KEY` 유효성 | 키 필요 (밖에서 확인 불가) | ❌ 미확인 (§0 방법 2가지) |
| ②방문자수 실호출 | 발급 키로 실제 조회 (260803) | ✅ 정상 `0000 OK` · 3개 시 데이터 존재 |
| ②집계 지연폭 | 일자별 `totalCount` 이분 탐색 | ✅ **23일** (최신 = 20260711) |
| ①주차 API 승인 상태 | 같은 키로 실호출 | ⏳ **심의 대기** (403 code 30) |
