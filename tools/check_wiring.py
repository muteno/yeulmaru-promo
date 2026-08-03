#!/usr/bin/env python3
"""배선 게이트 — 노뮤트 에디터 이식 기능(입력칸 클립·동기화 생명선)의 골격 감시 (Q39 260803).

원본 규율 = nomute-editor `check_clip_coverage` + `check_nm_sync`의 프로모 각색.
이 앱은 입력칸 ~95%가 런타임 innerHTML 생성이라(에디터는 정적 마크업) 「입력칸별 정적 전수검사」가
성립하지 않는다 → 커버리지는 3층 자동부착(초기 스윕·MutationObserver·focusin 안전망)이 **구조로** 보장하고,
이 게이트는 그 구조가 조용히 무너지는 것(리팩터로 리터럴 소실·면제표 훼손·SW 계약 회귀)만 잡는다
(리터럴 실존 검사 = 에디터 check_nm_sync 1축 문법 그대로).

검사 3축:
  ① 클립 골격 — attachCopyPaste·clipPasteText·_clipEligible·3층 배선 줄·면제표 핵심항목·CSS 클래스 실존
  ② 싱크 골격 — HEAD 프로브·nmRefresh 훅·복귀 트리거·busy 가드·기존 _checkForUpdates(방식B) 실존
  ③ 교차 계약 — sw.js 「req.method !== 'GET'」 조기 통과(HEAD 프로브가 SW를 우회하는 근거) 실존

rc=0 통과 / rc=1 위반(pre-commit이 커밋 차단). 순수 정적 문자열 검사 = 네트워크·렌더 0.
"""
import os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _read(p):
    try:
        with open(os.path.join(ROOT, p), encoding='utf-8') as f:
            return f.read()
    except OSError:
        return None

def main():
    fails = []
    idx = _read('index.html')
    sw = _read('sw.js')
    if idx is None:
        print('❌ check_wiring — index.html을 읽을 수 없음'); return 1

    # ① 클립 골격 (모듈 함수·3층 자동부착·면제표·CSS)
    clip_lits = [
        ('function attachCopyPaste(', '클립 본체 함수'),
        ('clipPasteText', '붙여넣기 readText→폴백 공용'),
        ('clipPasteFallback', "'길게 눌러 붙여넣기' 폴백 모달"),
        ('_clipEligible', '적격 판정 함수(자동부착 1축)'),
        ('_clipSweep', '스윕 함수(초기+MO 공용)'),
        ('new MutationObserver', '동적 입력칸 자동부착(2층)'),
        ("addEventListener('focusin'", 'focusin 안전망(3층)'),
        ('_CLIP_EXEMPT_SEL', '면제표(사유 필수)'),
        ('window.attachCopyPaste', '노뮤트 공용 API 계약'),
        ('.iobtn-edge{', '클립 버튼 CSS(토큰 재스킨)'),
        ('.pastefb-box{', '폴백 모달 CSS'),
    ]
    for lit, why in clip_lits:
        if lit not in idx:
            fails.append(f"클립 골격 소실 — index.html에 `{lit}` 없음 ({why})")
    # 면제표 핵심 항목 — 지우면 사고가 재현되는 축(PIN 자체 붙여넣기 분배와 충돌 등)
    for item, why in [('.pin', 'PIN 4칸 = 자체 붙여넣기 분배 핸들러 실존'),
                      ('.inl-input', '표 인라인 편집 = 셀 레이아웃 보호'),
                      ('inputmode="numeric"', '판매 그리드 등 값 입력 UI(노뮤트 숫자칩 면제 동축)'),
                      ('data-noclip', '명시 opt-out 경로')]:
        if f"_CLIP_EXEMPT_SEL='" in idx:
            head = idx.split("_CLIP_EXEMPT_SEL='", 1)[1].split("'", 1)[0]
            if item not in head:
                fails.append(f"클립 면제표 훼손 — `{item}` 빠짐 ({why})")
        else:
            break

    # ② 싱크 골격
    sync_lits = [
        ("method:'HEAD'", '자기 문서 ETag 프로브(새 배포 감지)'),
        ('window.nmRefresh', '복귀 재동기 훅(에디터 계약)'),
        ('window.nmSync', '테스트·위임 훅'),
        ("'visibilitychange'", '복귀 트리거'),
        ('function busy()', '한가 판정(작업 중 강제 이탈 0)'),
        ('.modal-bg.show,.confirm-bg.show,dialog[open]', 'busy 모달 감지 축'),
        ('function _checkForUpdates', '방식B 데이터 신선도 축(기존 정본 — nmRefresh가 위임)'),
    ]
    for lit, why in sync_lits:
        if lit not in idx:
            fails.append(f"싱크 골격 소실 — index.html에 `{lit}` 없음 ({why})")

    # ③ 교차 계약 — sw.js가 HEAD를 가로채기 시작하면 배포 감지가 조용히 죽는다
    if sw is None:
        fails.append('sw.js 없음 — 싱크 HEAD 프로브의 SW 우회 계약을 확인할 수 없음')
    elif "req.method !== 'GET'" not in sw:
        fails.append("sw.js 계약 회귀 — `req.method !== 'GET'` 조기 통과가 사라짐(HEAD 프로브가 SW에 잡히면 배포 감지 무력화)")

    if fails:
        print('❌ check_wiring 위반 — 에디터 이식 기능(클립·싱크) 골격 파손:')
        for f in fails:
            print('  · ' + f)
        return 1
    print('✅ check_wiring 통과 — 클립 3층 자동부착·면제표·싱크 프로브·SW 우회 계약 전부 실존.')
    return 0

if __name__ == '__main__':
    sys.exit(main())
