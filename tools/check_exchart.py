#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
판매 추이 차트 정본 게이트 — 기틀 §2 #16의 정적 층 (운영자 260805, stdlib only)

운영자 지시: 「이 차트를 **디자인 정본으로 고정**시켜서 참고하게해」
  = 260805에 1~6차 연속 판정으로 잡은 형태(누계 꺾은선 + 옅은 직각 스텝 누적 보조)를
    기틀 §2 인벤토리 #16으로 승격하고, **되돌아가지 못하게 잠근다**.

이 게이트가 잡는 축 = 기존 검사기가 **한 번도 안 묻는** 축이다:
  · check_design ①~⑦ = 「색·수치가 토큰인가」 + X버튼 부품. 차트의 **선 모양·채움 규칙**은 안 본다.
  · smoke_component_parity = 「클래스가 같으면 픽셀도 같은가」. 이 차트는 클래스가 아니라 **JS 조립 규약**이라 대상 밖.
  실제로 260805 한 세션에서만 이 축의 회귀가 **3건** 났다(전부 게이트 밖에서 눈으로 잡았다):
    ① 선 모양 누락 → 계단이 사선 삼각형   ② `hv` → 칸이 반 달 밀림   ③ 라벨 임계 14 → 숫자 포갬.

검사 7종 (전부 **하드 0** — 래칫 아님):
  ① 보조 스택 = `stackgroup` + `fill:'tonexty'` 실존(진짜 스택이어야 한다)
  ② 보조 스택 선 모양 = **`shape:'hvh'`** — `hv`/`vh`/누락이면 위반(칸 정중앙 = 꼭짓점 계약)
  ③ 같은 바닥 겹치기 금지 = 이 함수 안에 `fill:'tozeroy'` 0 (260805 3차 철거분의 재유입 차단)
  ④ 보조 알파 = 한 자릿수대 유지(종료·진행중 둘 다 0 < a <= 0.20) — 보조가 주인을 누르지 않게
  ⑤ 점 채움 = 「종료 월 한 점만」 규칙의 뼈대(marker.color가 **배열 분기**로 조립되는가)
  ⑥ 라벨 겹침 = 세로 임계 >= 19 (10.5px 글상자 13 + 숨구멍 6 · 구판 14 = 글상자보다 작아 포갬)
  ⑧ 값 라벨 잉크 = **중립 한 벌**(`--neutral-text`) — 선색(`L.col`)으로 되돌아가면 위반
     (운영자 260809 「숫자는 색이 각기 다른 게 아니라, 조금 흐린 검정으로」 · 승인 260809-2 「응 그렇게 해주면 됨」)

⚠ 이 게이트는 **형태 계약**만 본다 — 값(전시명·색 지정·기간)은 정하지 않는다.
   색은 `_bizExCol`/`_BIZ_EX_COL`가 정본이고 그쪽은 check_design의 팔레트 축이 이미 지킨다.

사용: python3 tools/check_exchart.py   (exit 0=통과 / 1=위반)
호출처: .githooks/pre-commit · npm run check
킬테스트(등재 요건 · 260805 실측): `hvh`→`hv` rc=1 · `tonexty`→`tozeroy` rc=1 · 임계 19→14 rc=1 · 알파 .09→.5 rc=1.
        (260809-2 증설분) 꼭자락 라벨 잉크를 `L.col`로 되돌리면 rc=1.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INDEX = os.path.join(ROOT, 'index.html')
FUNC = '_bizDrawExhibMonthly'


def body_of(src, name):
    """함수 선언부터 다음 최상위 `function ` 선언 직전까지 — 이 파일의 조립 스타일에 맞춘 거친 절단(중괄호 셈 불필요)."""
    i = src.find('function %s(' % name)
    if i < 0:
        return None
    j = src.find('\nfunction ', i + 10)
    return src[i:(j if j > 0 else len(src))]


def main():
    with open(INDEX, encoding='utf-8') as f:
        src = f.read()
    body = body_of(src, FUNC)
    bad = []
    if body is None:
        print('[exchart] ✗ %s 함수가 없다 — 기틀 §2 #16 정본이 통째로 사라졌다.' % FUNC)
        return 1

    # ① 진짜 스택
    if "stackgroup:" not in body or "fill:'tonexty'" not in body:
        bad.append("① 보조 누적 스택 소실 — `stackgroup` + `fill:'tonexty'` 한 벌이 있어야 한다(겹쳐 그리면 누적이 아니다).")

    # ② 직각 = hvh (칸 정중앙에 꼭짓점)
    shapes = re.findall(r"shape:'([a-z]+)'", body)
    stack_shapes = [s for s in shapes if s in ('hv', 'vh', 'hvh')]
    if 'hvh' not in stack_shapes:
        bad.append("② 보조 계단 선 모양이 `hvh`가 아니다(실측 %s) — `hv`는 칸 왼쪽 끝에 꼭짓점이 놓여 **반 달 밀린다**." % (stack_shapes or '없음'))

    # ③ 같은 바닥 겹치기 재유입 차단
    if "fill:'tozeroy'" in body:
        bad.append("③ `fill:'tozeroy'`(같은 바닥 겹치기) 재유입 — 260805 3차 철거분이다. 누적은 stackgroup으로만.")

    # ④ 보조 알파 = 보조답게
    m = re.search(r"_yrHexA\(col,\(([^)]*)\)\?([0-9.]+):([0-9.]+)\)", body.replace(' ', ''))
    if not m:
        bad.append("④ 보조 알파 대입부(`_yrHexA(col, 진행중?a:b)`)를 못 찾았다 — 보조 레이어 조립이 바뀌었다.")
    else:
        a_live, a_end = float(m.group(2)), float(m.group(3))
        for nm, a in (('진행중', a_live), ('종료', a_end)):
            if not (0 < a <= 0.20):
                bad.append("④ 보조 알파(%s) %.2f — 0 초과 0.20 이하여야 한다(보조가 메인을 누르면 안 된다 · 운영자 「연하게」)." % (nm, a))

    # ⑤ 점 채움 = 종료 월 한 점만(배열 분기 조립)
    if 'marker:{size:7,' not in body.replace(' ', '') or 'b.mo.map(function(_p,i)' not in body.replace(' ', ''):
        bad.append("⑤ 점 채움 규칙 소실 — marker.color/line.color가 **점별 배열**로 조립돼야 한다(종료 월 한 점만 채움 · 나머지 빈 점).")

    # ⑥ 라벨 겹침 세로 임계
    m2 = re.search(r"pxPerY<([0-9.]+)", body.replace(' ', ''))
    if not m2:
        bad.append("⑥ 라벨 겹침 판정부(`pxPerY<N`)를 못 찾았다 — 뒤집기 규칙이 사라졌다.")
    elif float(m2.group(1)) < 19:
        bad.append("⑥ 라벨 세로 임계 %s — 19 이상이어야 한다(10.5px 글상자 13 + 숨구멍 6 · 구판 14는 글상자보다 작아 숫자가 포갰다)." % m2.group(1))

    # ⑦(부수) 뒤집기 자체가 살아 있는가 — 「겹치면 생략」으로 되돌아가면 잡는다
    if 'side=-side' not in body.replace(' ', ''):
        bad.append("⑦ 라벨 충돌 시 **180° 뒤집기**가 없다 — 생략으로 되돌아갔다(운영자 「겹치는거보다는 그게 나음」).")

    # ⑧ 값 라벨 잉크 = 중립 한 벌(운영자 260809 · 승인 260809-2) — 막대 차트(#18)와 같은 잉크
    flat = body.replace(' ', '')
    if "_lbInk=_yrCss('--neutral-text')" not in flat:
        bad.append("⑧ 값 라벨 잉크 한 벌(`--neutral-text`) 선언이 없다 — 「숫자는 조금 흐린 검정으로」(운영자 260809) 계약이 사라졌다.")
    tips = re.findall(r"yanchor:\(side>0\)\?'bottom':'top'[^}]*font:\{size:([A-Za-z_0-9.]+),color:([A-Za-z_.]+)\}", flat)
    if not tips:
        bad.append("⑧ 꼭자락 라벨 주석부를 못 찾았다 — 값 라벨 조립이 바뀌었다(잉크 계약을 잴 수 없다).")
    else:
        for fs, ink in tips:
            if ink != '_lbInk':
                bad.append("⑧ 꼭자락 라벨 잉크가 `%s`다 — 선색으로 되돌아갔다. 값 라벨은 `_lbInk`(--neutral-text) 한 벌(#16 ⓐ 260809-2 개정)." % ink)

    # ⑨ 차트 칸 전건이 실패 안내 목록에 있나 (260812-7 운영자 「출력이 잘 안되는 변수를 줄이려는 거임」)
    #   잡는 것 = **조용히 빈 칸으로 남는 차트**. 구판은 `_plotlyFailNote` 안에 두 칸만 하드코딩돼 있어서
    #   CDN이 막히면 전시·교육·장르·시즌 칸이 아무 말 없이 비었다(실측 260812: 안내 2/6 · 침묵 4칸).
    #   빈 칸은 「자료가 없는 것」인지 「고장난 것」인지 사람이 구분할 수 없다 = 그게 「출력이 안 된다」의 정체다.
    m = re.search(r"var\s+_BIZ_CHART_SLOTS\s*=\s*\[([^\]]*)\]", src)
    if not m:
        bad.append("⑨ `_BIZ_CHART_SLOTS`(차트 칸 정본 목록) 선언이 없다 — 실패 안내가 어디에 들어가는지 한 곳에서 못 센다.")
    else:
        listed = set(re.findall(r"'([^']+)'", m.group(1)))
        # 실제 차트 칸 = 마크업에 있는 `id="…chart"` 전부(문자열 조립으로 만드는 자리도 잡는다)
        found = set(re.findall(r"""id=\\?["']((?:biz|bizm)-[a-z-]*chart)\\?["']""", src))
        miss = sorted(found - listed)
        if miss:
            bad.append("⑨ 차트 칸 %s 이(가) `_BIZ_CHART_SLOTS`에 없다 — 라이브러리 로드가 실패하면 그 칸은 "
                       "**아무 말 없이 빈 칸**으로 남는다. 목록에 넣어라." % ', '.join('`%s`' % x for x in miss))
        if '_BIZ_CHART_SLOTS.forEach' not in src.replace(' ', ''):
            bad.append("⑨ `_plotlyFailNote`가 `_BIZ_CHART_SLOTS`를 안 돈다 — 목록을 만들어 놓고 안 쓰면 침묵이 되살아난다.")

    if bad:
        print('[exchart] ✗ 판매 추이 차트 정본 위반 %d건 (기틀 §2 #16)' % len(bad))
        for b in bad:
            print('   · ' + b)
        return 1
    print('[exchart] PASS — 판매 추이 차트 정본(기틀 §2 #16) 유지 · 스택 hvh · tozeroy 0 · 알파 보조역 · 점 배열 분기 · 라벨 임계·뒤집기 · 값 라벨 잉크 한 벌 · 차트 칸 전건 실패 안내 등재 ✓')
    return 0


if __name__ == '__main__':
    sys.exit(main())
