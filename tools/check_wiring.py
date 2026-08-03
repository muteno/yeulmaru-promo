#!/usr/bin/env python3
"""배선 게이트 — 노뮤트 에디터 이식 기능(입력칸 클립·동기화 생명선)의 골격 감시 (Q39 260803).

원본 규율 = nomute-editor `check_clip_coverage` + `check_nm_sync`의 프로모 각색.
이 앱은 입력칸 ~95%가 런타임 innerHTML 생성이라(에디터는 정적 마크업) 「입력칸별 정적 전수검사」가
성립하지 않는다 → 커버리지는 3층 자동부착(초기 스윕·MutationObserver·focusin 안전망)이 **구조로** 보장하고,
이 게이트는 그 구조가 조용히 무너지는 것(리팩터로 리터럴 소실·면제표 훼손·SW 계약 회귀)만 잡는다.

v2 (평의회 7호 260803 변이 실증 반영 — FN 7건 봉합):
  · 검사 스코프 = 전역 → **블록 슬라이스**(고유 헤더 주석 → </script>) — 파일 다른 곳의 동명 리터럴
    (PIN 재포커스 visibilitychange·pinGuard MutationObserver·nmSyncBusy 부분문자열)이 방패가 되던 FN 봉합.
  · 면제표 = 마커 부재 자체가 위반(구 else:break = 재포맷 시 검사 0건 침묵 자멸 — D1).
  · nmRefresh·nmSync = 참조가 아니라 **정의형 앵커**(정의줄만 지워도 참조가 리터럴을 살리던 FN — D3).
  · sw.js = 줄머리 정규식(주석화 생존 FN — D4).

검사 3축: ①클립 골격(블록 내) ②싱크 골격(블록 내) ③교차 계약(sw.js HEAD 통과).
rc=0 통과 / rc=1 위반(pre-commit이 커밋 차단). 순수 정적 검사 = 네트워크·렌더 0.
"""
import os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _read(p):
    try:
        with open(os.path.join(ROOT, p), encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None

def _slice(src, mark, end='</script>'):
    """고유 헤더 주석(mark)부터 다음 end까지 — 블록 스코프 검사용. 부재 = None(= 블록 소실 위반)."""
    i = src.find(mark)
    if i < 0:
        return None
    j = src.find(end, i)
    return src[i:j] if j > 0 else src[i:]

def main():
    fails = []
    idx = _read('index.html')
    sw = _read('sw.js')
    if idx is None:
        print('❌ check_wiring — index.html을 읽을 수 없음'); return 1

    # ── 블록 슬라이스(헤더 주석은 각 1회 유일 — 유일성 자체도 검증) ──
    for mark in ('① 입력칸 클립', '② 동기화 생명선'):
        if idx.count(mark) > 1:
            fails.append(f'블록 헤더 「{mark}」 중복({idx.count(mark)}회) — 슬라이스 스코프가 흐려짐. 헤더는 1회 유일 유지')
    clip_blk = _slice(idx, '① 입력칸 클립')
    sync_blk = _slice(idx, '② 동기화 생명선')
    css_blk = _slice(idx, '입력칸 클립(복사·붙여넣기·지우개/되돌리기)', end='</style>')
    if clip_blk is None:
        fails.append('클립 블록 소실 — 헤더 주석 「① 입력칸 클립」이 index.html에 없음(블록 통삭제 또는 헤더 개서)')
    if sync_blk is None:
        fails.append('싱크 블록 소실 — 헤더 주석 「② 동기화 생명선」이 index.html에 없음(블록 통삭제 또는 헤더 개서)')
    if css_blk is None:
        fails.append('클립 CSS 블록 소실 — 헤더 주석 「입력칸 클립(복사·붙여넣기·지우개/되돌리기)」이 없음')

    # ── ① 클립 골격(블록 내) ──
    if clip_blk:
        for lit, why in [
            ('function attachCopyPaste(', '클립 본체 함수'),
            ('clipPasteText', '붙여넣기 readText→폴백 공용'),
            ('clipPasteFallback', "'길게 눌러 붙여넣기' 폴백 모달"),
            ('function _clipEligible(', '적격 판정 함수(자동부착 1축)'),
            ('function _clipSweep(', '스윕 함수(초기+MO 공용)'),
            ('new MutationObserver', '동적 입력칸 자동부착(2층)'),
            ("addEventListener('focusin'", 'focusin 안전망(3층)'),
            ('_clipSweep(document.body)', '초기 스윕 호출(1층)'),
            ('window.attachCopyPaste=attachCopyPaste', '노뮤트 공용 API 계약(수출 정의형)'),
            ('||!el.parentNode)return', '분리 노드 탈락 가드(평의회3 — 선마킹 오염 봉합)'),
            ('el.offsetParent===null&&document.activeElement!==el', '숨김 칸 보류(평의회2 — 유령 버튼 봉합)'),
            ('el.maxLength>0', '붙여넣기 maxlength 클램프(평의회5 — 카카오 76자 우회 봉합)'),
            ("new Event('change',{bubbles:true})", 'change 동시발화(평의회5 — change-단독 칸 유실 봉합)'),
        ]:
            if lit not in clip_blk:
                fails.append(f'클립 골격 소실 — 클립 블록에 `{lit}` 없음 ({why})')
        # 면제표 — 마커 부재 = 위반(재포맷도 게이트와 같이 고쳐야 한다 = 문법이 계약)
        marker = "_CLIP_EXEMPT_SEL='"
        if marker not in clip_blk:
            fails.append("클립 면제표 파싱 불가 — `_CLIP_EXEMPT_SEL='` 문법(단따옴표·무공백 =) 깨짐 또는 소실. 표 개정이면 이 게이트도 같이 개정")
        else:
            head = clip_blk.split(marker, 1)[1].split("'", 1)[0]
            for item, why in [('.pin', 'PIN 4칸 = 자체 붙여넣기 분배 핸들러 실존'),
                              ('.inl-input', '표 인라인 편집 = 셀 레이아웃 보호'),
                              ('inputmode="numeric"', '판매 그리드 등 값 입력 UI(노뮤트 숫자칩 면제 동축)'),
                              ('data-noclip', '명시 opt-out 경로'),
                              ('[readonly]', '입력 불가 칸'),
                              ('input[type="password"]', '잠금 취지 칸'),
                              ('.ve-cut .nb-input', '컷 타임코드 74px 값칩(평의회2)')]:
                if item not in head:
                    fails.append(f'클립 면제표 훼손 — `{item}` 빠짐 ({why})')
    if css_blk:
        for lit, why in [('.iobtn-edge{', '클립 버튼 CSS(토큰 재스킨)'), ('.pastefb-box{', '폴백 모달 CSS'),
                         ('.iowrap>input:not([style*="width"])', '폭 지위 승계 CSS(평의회2 — 래핑 후 기본폭 수축 봉합)'),
                         (':has(>input[style*="display:none"])', '재숨김 유령 버튼 소등(평의회2)')]:
            if lit not in css_blk:
                fails.append(f'클립 CSS 소실 — `{lit}` 없음 ({why})')

    # ── ② 싱크 골격(블록 내 · 정의형 앵커) ──
    if sync_blk:
        for lit, why in [
            ("method:'HEAD'", '자기 문서 Last-Modified 프로브(새 배포 감지)'),
            ('Date.parse(document.lastModified)', '부팅 기준 = 문서 자신(평의회1 D3 — SW 구캐시 블라인드·오프라인 비활성 봉합)'),
            ('lm>bootLM+1000', '단조 부등호 발화(평의회1 D5 — 문자열 비교 오발·진동 폐지)'),
            ('window.nmRefresh=function', '복귀 재동기 훅 위임 정의(참조 아님 — 정의줄이 배선)'),
            ('window.nmSyncBusy=function', '페이지측 busy 선언 배선(평의회6 C-2 — 비행 중 쓰기·대기 타이머·MSAL·AI 응답)'),
            ('window.nmSync={', '테스트·위임 훅 수출 정의'),
            ("'visibilitychange'", '복귀 트리거(싱크 블록 자체분)'),
            ('function busy()', '한가 판정(작업 중 강제 이탈 0)'),
            ('.modal-bg.show,.confirm-bg.show,dialog[open],.overlay-load.show', 'busy 모달·저장 스피너 감지 축(평의회6 C-1 보강분 포함)'),
            ("cs.display==='none'||cs.opacity==='0'||cs.pointerEvents==='none'", 'z99999 가시성 3조건(평의회1 D1 — 상주 숨김 오버레이 영구 busy 봉합)'),
            ('function resumeNow()', '복귀 단일 진입점'),
        ]:
            if lit not in sync_blk:
                fails.append(f'싱크 골격 소실 — 싱크 블록에 `{lit}` 없음 ({why})')
    # 방식B 데이터 축·쓰기 재계(정의는 블록 밖이 정상 — 전역 검사 유지)
    if 'function _checkForUpdates' not in idx:
        fails.append('싱크 위임처 소실 — `function _checkForUpdates` 없음(방식B 데이터 신선도 축 = nmRefresh 위임 대상)')
    if 'var _apiWrites=0' not in idx:
        fails.append('쓰기 재계 소실 — `var _apiWrites=0` 없음(평의회6 — nmSyncBusy의 비행 중 쓰기 감지 축)')

    # ── ③ 교차 계약 — sw.js가 HEAD를 가로채면 배포 감지가 조용히 죽는다(줄머리 앵커 = 주석화도 위반) ──
    if sw is None:
        fails.append('sw.js 없음 — 싱크 HEAD 프로브의 SW 우회 계약을 확인할 수 없음')
    elif not re.search(r"(?m)^\s*if \(req\.method !== 'GET'\) return", sw):
        fails.append("sw.js 계약 회귀 — 실행줄 `if (req.method !== 'GET') return`이 없음(주석화 포함 · HEAD 프로브가 SW에 잡히면 배포 감지 무력화)")

    if fails:
        print('❌ check_wiring 위반 — 에디터 이식 기능(클립·싱크) 골격 파손:')
        for f in fails:
            print('  · ' + f)
        return 1
    print('✅ check_wiring 통과 — 클립 3층 자동부착·면제표·싱크 프로브·SW 우회 계약 전부 실존(블록 스코프 v2).')
    return 0

if __name__ == '__main__':
    sys.exit(main())
