#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
모달 머리줄 정본 게이트 — 「스모킹 패리티」의 정적 층 (운영자 260805-23, stdlib only)

운영자 지시: 「모든 모달 창에 윗부분을 저거로 스모킹 패리티 고정 시켜서 항상 저 형식이 나오게끔해줘」
  = 260805-22에 「카카오 메세지 설계」·「AI 홍보 · 점검」 둘만 쓰던 강조색 머리줄 밴드를
    앱의 `.modal` 전체(61개)의 **단일 정본**으로 승격하고, 되돌아가지 못하게 잠근다.

이 게이트가 잡는 축 = check_design ①~⑦이 **한 번도 안 묻는** 축이다:
  check_design ⑦(정본 부품 일치)은 「X 버튼의 글자가 ✕인가」까지만 본다 — 「모달에 머리줄이 있는가」,
  「그 머리줄이 정본 한 벌에서 나왔는가」는 아무도 안 봤다. 실제로 260805-23 이전 실측 =
  61개 중 밴드를 가진 모달 2개(3.3%), 나머지 59개는 h3·border-bottom 줄·아예 없음이 제각각이었다.

검사 6종 (전부 **하드 0** — 래칫 아님):
  ① 머리줄 실존: 모든 `<div class="modal…">` 셸이 뒤이어 `_mhead(`(JS 조립) 또는
     `class="mhead"`(정적 HTML)를 하나 갖는다.
  ⑥ **X 자리 인라인 재타이핑 금지**(260806-11 운영자 「항상 저거 어긋나지 않게 해줘」): `class="modal-x"`에
     `position/top/right/float/margin`을 인라인으로 다시 치는 것 0. 정본 = CSS `.modal:has(>.mhead)>.modal-x`
     한 벌이고, **인라인은 CSS를 이기기 때문에** 하나만 남아도 줄맞춤 규칙(밴드에 버튼이 서면 18 · 최소화 짝이면
     19.33)이 그 모달에서만 조용히 안 먹는다 — 실제로 260806-10 실측에서 밴드 버튼 보유 16곳 중 15곳이
     그 이유로 4px 어긋나 있었다. z-index만 다른 값(20/30/60)으로 남기는 건 허용(레이어는 자리가 아니다).
  ② 인라인 재타이핑 금지: 밴드를 손으로 다시 친 자리(`background:var(--accent)` + `font-size:16px`
     + `font-weight:700`가 한 style에 같이 있는 곳) 0. ← 260805-16 X버튼 사고와 같은 유입 경로
     (「CSS만 정본이고 내용은 문자열 복붙」)를 처음부터 막는다.
  ③ 모양 SSOT 실존: CSS `.mhead`·`.mhead .sub` 블록이 정본 선언(밴드색·활자·패딩)을 그대로 갖는다.
  ④ 패딩 상쇄 계약: `.modal`은 `var(--mpad-y,28px) var(--mpad-x,28px)`로 패딩을 받고,
     셸 인라인은 `padding:`을 직접 쓰지 않는다(쓰면 밴드 음수 마진과 어긋나 머리줄이 안쪽으로 들어간다).
  ⑤ 내용 SSOT 실존: 빌더 `_mhead(`가 `class="mhead"`를 뱉는다.

⚠ 이 게이트는 **자리와 부품**만 본다 — 제목·부제의 '값'은 정하지 않는다(자리마다 뜻이 다르다.
   check_design ⑦의 접근명 규약과 같은 판단).

사용: python3 tools/check_modal_head.py   (exit 0=통과 / 1=위반)
호출처: .githooks/pre-commit
킬테스트(등재 요건): 아무 모달의 `_mhead(...)` 한 줄을 지우면 ① 위반으로 rc=1 — 260805-23 실측.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')

# 셸 여는 태그 — JS 문자열 안(\" 이스케이프)과 정적 HTML을 같이 잡는다.
SHELL = re.compile(r'<div class=\\?"modal(?: [^"\\]*)?\\?"(?: style=\\?"([^"\\]*)\\?")?')
# 인라인 밴드 재타이핑 — style 하나 안에 밴드색·16px·700이 함께 있으면 손으로 다시 친 것으로 본다.
INLINE_BAND = re.compile(r'style=\\?"[^"\\]*background:var\(--accent\)[^"\\]*\\?"')

# ③ 모양 SSOT — 있어야 하는 정본 선언(값이 바뀌면 여기도 같이 고친다 = 3점 세트).
CSS_MUST = [
    ('.mhead{', 'padding:18px 74px 18px 24px'),
    ('.mhead{', 'background:var(--accent)'),
    ('.mhead{', 'font-size:16px'),
    ('.mhead{', 'font-weight:700'),
    ('.mhead{', 'color:var(--surface-solid)'),
    ('.mhead{', 'calc(-1 * var(--mpad-y,28px))'),
    ('.mhead .sub{', 'font-size:11.5px'),
    ('.mhead .sub{', 'font-weight:600'),
    ('.mhead .sub{', 'color:rgba(255,255,255,.85)'),
]


def css_block(src, sel):
    i = src.find(sel)
    if i < 0:
        return None
    j = src.find('}', i)
    return src[i:j] if j > 0 else src[i:i + 400]


def main():
    if not os.path.exists(INDEX):
        print('[modal-head] SKIP — index.html 없음.')
        return 0
    src = open(INDEX, encoding='utf-8').read()
    # ⚠ [260813] 리터럴 실존 검사는 **주석을 걷고** 재야 한다.
    #   실측 킬테스트: 머리줄 호출을 지우고 그 자리에 `/* 나중에 _mhead( 로 넣을 예정 */`만 남겼더니 **통과했다**.
    #   = 코드가 아니라 주석의 글자를 세고 있었다. 이 세션에서만 같은 축이 여섯 번 샜다
    #     (주석 글자·리터럴·낱말·접두·마커·이번). 검사는 **코드만** 봐야 한다.
    #   ⚠ 문자열 안의 `//`(URL 등)를 지우지 않도록 줄 주석은 앞에 따옴표가 없을 때만 걷는다.
    code = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    code = re.sub(r"(?m)(?<![:'\"])//[^\n]*", "", code)
    fails = []

    shells = list(SHELL.finditer(code))   # 셸도 code에서 찾는다(주석 안 가짜 셸을 세지 않게)
    if not shells:
        fails.append('셸을 하나도 못 찾았다 — 검사기가 앱 구조를 놓쳤다(정규식 점검 필요).')

    # ① 머리줄 실존 + ④ 셸 인라인 padding 금지
    for k, m in enumerate(shells):
        end = shells[k + 1].start() if k + 1 < len(shells) else len(code)
        win = code[m.end():min(end, m.end() + 2500)]
        if '_mhead(' not in win and 'class="mhead"' not in win:
            line = code.count('\n', 0, m.start()) + 1
            fails.append('L%d: 머리줄 없는 모달 — `_mhead(제목, 부제)` 한 줄을 셸 바로 뒤에 넣어라.' % line)
        style = m.group(1) or ''
        if re.search(r'(^|;)\s*padding\s*:', style):
            line = code.count('\n', 0, m.start()) + 1
            fails.append('L%d: 셸 인라인에 `padding:` — `--mpad-y:…;--mpad-x:…`로 바꿔라'
                         '(안 그러면 머리줄 음수 마진과 어긋나 밴드가 안쪽으로 들어간다).' % line)

    # ② 인라인 재타이핑 금지
    for m in INLINE_BAND.finditer(src):
        st = m.group(0)
        if 'font-size:16px' in st and 'font-weight:700' in st:
            line = code.count('\n', 0, m.start()) + 1
            fails.append('L%d: 머리줄 밴드를 인라인으로 다시 침 — `_mhead(...)`를 써라(내용 SSOT).' % line)

    # ③ 모양 SSOT
    for sel, need in CSS_MUST:
        blk = css_block(src, sel)
        if blk is None:
            fails.append('CSS `%s` 블록 소실 — 모달 머리줄의 모양 SSOT다.' % sel)
        elif need not in blk:
            fails.append('CSS `%s`에 정본 선언 `%s` 없음.' % (sel, need))

    # ④ .modal 패딩 계약
    # `.modal{`은 모바일 미디어쿼리에도 있다 — 셸 본체 규칙(배경 선언으로 시작)을 집어야 한다.
    modal_rule = css_block(src, '.modal{background:')
    if modal_rule is None:
        fails.append('CSS `.modal{background:…}` 셸 규칙 소실.')
    elif 'padding:var(--mpad-y,28px) var(--mpad-x,28px)' not in modal_rule:
        fails.append('CSS `.modal`이 `padding:var(--mpad-y,28px) var(--mpad-x,28px)`가 아니다 '
                     '— 머리줄 음수 마진 상쇄가 깨진다.')

    # ⑥ X 자리 인라인 재타이핑 금지 — 인라인이 CSS를 이겨 줄맞춤 규칙을 조용히 무력화한다.
    for m in re.finditer(r'class="modal-x"[^>]*style="([^"]*)"', src):
        st = m.group(1)
        bad = [k for k in ('position:', 'top:', 'right:', 'float:', 'margin:') if k in st]
        if bad:
            fails.append('`.modal-x`에 자리 인라인 재타이핑(%s) — 정본 CSS '
                         '`.modal:has(>.mhead)>.modal-x`가 이미 준다. 인라인은 CSS를 이겨 '
                         '줄맞춤 규칙이 안 먹는다: style="%s"' % (','.join(bad), st[:70]))
    # 줄맞춤 규칙 자체가 살아 있는지(누가 지우면 16개 모달이 도로 4px 어긋난다)
    if '.modal:has(>.mhead button)>.modal-x{top:18px}' not in src:
        fails.append('줄맞춤 규칙 소실 — `.modal:has(>.mhead button)>.modal-x{top:18px}`(밴드에 버튼이 서면 그 줄에 맞춘다).')
    if '.modal:has(>.mhead .modal-x[aria-label="최소화"])>.modal-x{top:19.33px}' not in src:
        fails.append('잉크 보정 규칙 소실 — 최소화(`─`)와 닫기(`✕`)는 잉크가 상자 안 다른 높이에 앉아 1.33px 보정이 필요하다.')

    # ⑤ 내용 SSOT
    i = src.find('function _mhead(')
    if i < 0:
        fails.append('빌더 `_mhead(` 소실 — 머리줄 내용의 SSOT다.')
    elif 'class="mhead"' not in src[i:i + 600]:
        fails.append('빌더 `_mhead`가 `class="mhead"`를 안 뱉는다.')

    if fails:
        print('[modal-head] FAIL — 모달 머리줄 정본 위반 %d건:' % len(fails), file=sys.stderr)
        for f in fails[:40]:
            print('  · ' + f, file=sys.stderr)
        if len(fails) > 40:
            print('  · … 외 %d건' % (len(fails) - 40), file=sys.stderr)
        print('  정본 = CSS `.mhead`(모양) + `_mhead()`(내용) 한 벌. 기틀 §2 컴포넌트 7 「모달」.', file=sys.stderr)
        return 1
    print('[modal-head] PASS — 모달 %d개 전건 머리줄 정본(`.mhead`) · 인라인 재타이핑 0(밴드·X자리 둘 다) '
          '· 패딩 계약 유지 · X 줄맞춤 규칙 실존.' % len(shells))
    return 0


if __name__ == '__main__':
    sys.exit(main())
