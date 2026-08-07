#!/usr/bin/env python3
# ============================================================
# 260807 운영관리대장 나머지 2장 반입 — 계획 산출기 (운영자 260807 「둘 다 넣어」)
#
# 원본 = 같은 xlsx의 나머지 2장. 세부운영관리대장(회차 단위)은 260807_대장정본_plan.py가 이미 동기했다.
#   ① **공연장운영관리대장** (1,442행 · 2012~2026) = **공연 단위** 요약. 회차 원장엔 아예 없는 축이 여기 있다 —
#      `티켓가`·`주최/주관`·`입장연령`·`공연장소`·`셋업/공연일수/철수`·`판매금액`.
#   ② **기획공연판매현황** (23행 · 2024) = 기획공연 판매금액 표.
#   둘 다 라이브에 대응 시트가 **없다**(실측: `운영_기획공연판매결과`도 「시트 없음(미동기화)」) → 신설이다.
#   기존 시트는 한 줄도 안 건드린다.
#
# 산출 = docs/260807_공연대장_계획.json — {sheets:[{sheet,headers,rows,diag}]}
#
# 【규칙】 값 창작 0 — 원장 셀을 그대로 싣는다. 가공은 아래 셋뿐이고 전부 기계적이다.
#   · **머리글 중복 해소** — 원장 머리글에 `합계`가 둘(발권/수표), `공연일수`가 둘(대관 일수/집계)이다.
#     시트 행은 머리글로 키를 만드는 구조라 그대로 두면 **뒤엣것이 앞엣것을 먹는다**. 뜻이 드러나게 이름만 나눈다.
#   · **집계행 제외** — `총계` 행(연도×구분 소계 140행)은 값이 아니라 합이라 안 싣는다.
#   · **공연ID 파생** — `년도` + `일시` 첫 날짜 → `YYMMDD_NN`(라이브 채번 규칙 계승). 회차 원장·공연색인과 조인하는 열이다.
#     ⚠ 파생 실패(일시에 날짜가 없음)면 **빈칸으로 둔다**(추정 금지). 조인율은 실행 시 출력한다.
#
# ⚠ 두 대장은 같은 파일 안에서도 연도 합이 조금씩 어긋난다(실측 2013 발권유료 공연대장 60,363 ↔ 회차원장 60,483 ·
#   2018 47,633 ↔ 46,033 · 2023 초대 26,850 ↔ 25,448). **어느 쪽으로도 안 맞춘다** — 둘 다 운영자 원장이고,
#   앱 DB의 정본은 이미 회차 원장(세부운영관리대장)이다. 차이는 진단에 찍어 운영자에게 보인다.
#
# 사용법: python3 docs/260807_공연대장_plan.py <운영관리대장.xlsx>
# ============================================================
import collections, json, os, re, sys

try:
    import openpyxl
except ImportError:
    sys.exit('openpyxl 필요: pip install openpyxl')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', '260807_공연대장_계획.json')

S = lambda v: '' if v is None else str(v).strip()


def num(v):
    s = S(v)
    if s == '':
        return ''
    try:
        f = float(s)
        return str(int(f)) if f == int(f) else s
    except ValueError:
        return s


def yr(v):
    return num(re.sub(r'[년월일]\s*$', '', S(v)))


def F(v):
    try:
        return float(S(v))
    except ValueError:
        return 0.0


# 원장 머리글 → 시트 열 이름. 중복 2쌍만 뜻이 드러나게 나눈다(나머지는 원문 그대로).
RENAME = {21: '발권합계', 24: '수표합계', 26: '집계공연일수'}

SPECS = [
    {'ws': '공연장운영관리대장 ', 'sheet': '공연대장', 'hrow': 2,
     'note': '공연 단위 요약(2012~2026) — 티켓가·주최/주관·입장연령·공연장소·판매금액'},
    {'ws': '기획공연판매현황', 'sheet': '기획공연판매현황', 'hrow': 1,
     'note': '기획공연 판매금액(2024)'},
]


def first_date(y, 일시, 월):
    """`6/25(목) 19:30` 같은 일시 문자열에서 **첫 M/D**를 뽑는다. 없으면 월만 알고 일은 모름 → None."""
    m = re.search(r'(\d{1,2})\s*/\s*(\d{1,2})', S(일시))
    if not m:
        return None
    mm, dd = int(m.group(1)), int(m.group(2))
    if not (1 <= mm <= 12 and 1 <= dd <= 31) or not y.isdigit():
        return None
    return int(y), mm, dd


def build(wb, spec):
    ws = wb[spec['ws']]
    allr = list(ws.iter_rows(values_only=True))
    raw = [S(c).replace('\n', '') for c in allr[spec['hrow'] - 1]]
    headers, seen = [], {}
    for i, h in enumerate(raw):
        if not h:
            continue
        name = RENAME.get(i, h)
        if name in seen:                       # 예기치 못한 중복 = 이름 뒤에 위치를 붙여 살린다(먹힘 방지)
            name = f'{name}_{i}'
        seen[name] = i
        headers.append(name)
    cols = [seen[h] for h in headers]

    rows, skipped, idday, nid = [], 0, {}, 0
    for r in allr[spec['hrow']:]:
        if S(r[0]) in ('소계', '합계', '총계'):
            skipped += 1
            continue
        if not (S(r[1]) and (S(r[2]) or S(r[3]))):
            skipped += 1
            continue
        o = {h: num(r[c]) if c not in (2,) else yr(r[c]) for h, c in zip(headers, cols)}
        o['월'] = yr(o.get('월'))
        fd = first_date(o.get('년도', ''), r[4], o.get('월'))
        if fd:
            day = '%02d%02d%02d' % (fd[0] % 100, fd[1], fd[2])
            n = max(idday.get(day, {0})) + 1
            idday.setdefault(day, set()).add(n)
            o['첫공연일'] = '%04d-%02d-%02d' % fd
            o['공연ID'] = '%s_%02d' % (day, n)
            nid += 1
        else:
            o['첫공연일'] = ''
            o['공연ID'] = ''
        rows.append(o)
    headers += ['첫공연일', '공연ID']

    # 숫자 열에 들어앉은 비숫자 값 = 원장 오타·메모. **고치지 않고 세어서 보여준다**(원문 그대로 싣는다).
    #   실측 = 공연대장 `판매금액` 열의 값 5개 중 2개가 「5/1 230」·「5/3 747」 = 예울마루 위크 일자별 인원 메모가
    #   엉뚱한 열에 타이핑된 것. 이 열을 매출 축으로 쓰면 안 된다는 신호다(진짜 매출은 기획공연판매현황 쪽).
    NUMCOLS = ['기본좌석', '발권유료', '발권초대', '발권합계', '수표유료', '수표초대', '수표합계',
               '공연총좌석', '관람객', '판매금액', '공연횟수']
    dirty = collections.defaultdict(list)
    for o in rows:
        for c in NUMCOLS:
            v = S(o.get(c))
            if v and not re.fullmatch(r'-?\d+(\.\d+)?', v):
                dirty[c].append({'공연명': S(o.get('공연명'))[:30], '년도': S(o.get('년도')), '값': v[:24]})
    filled = {c: sum(1 for o in rows if S(o.get(c))) for c in NUMCOLS if c in headers}

    by = collections.defaultdict(lambda: [0, 0.0, 0.0, 0.0])
    for o in rows:
        a = by[o.get('년도', '')]
        a[0] += 1
        a[1] += F(o.get('발권유료')); a[2] += F(o.get('발권초대')); a[3] += F(o.get('판매금액'))
    diag = {'행': len(rows), '제외(집계·빈행)': skipped, '공연ID 파생': nid,
            '숫자열_비숫자값': {k: v for k, v in dirty.items()}, '숫자열_채워진행': filled,
            '연도별': {y: {'공연': a[0], '발권유료': a[1], '발권초대': a[2], '판매금액': a[3]}
                     for y, a in sorted(by.items())}}
    return {'sheet': spec['sheet'], 'note': spec['note'], 'headers': headers, 'rows': rows, 'diag': diag}


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src or not os.path.exists(src):
        sys.exit('사용법: python3 docs/260807_공연대장_plan.py <운영관리대장.xlsx>')
    wb = openpyxl.load_workbook(src, data_only=True, read_only=True)
    out = {'src': os.path.basename(src), 'sheets': [build(wb, s) for s in SPECS]}
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'[계획] {os.path.relpath(OUT, ROOT)}')
    for s in out['sheets']:
        d = s['diag']
        print(f"\n● 운영_{s['sheet']} — {d['행']:,}행 · {len(s['headers'])}열 · 공연ID 파생 {d['공연ID 파생']}/{d['행']}"
              f" (제외 {d['제외(집계·빈행)']})")
        print('   ' + ' · '.join(s['headers'][:10]) + ' …')
        print('   연도  공연   발권유료    발권초대     판매금액')
        for y, a in d['연도별'].items():
            print(f"   {y or '(공란)':6s}{a['공연']:5d} {a['발권유료']:10,.0f} {a['발권초대']:10,.0f} {a['판매금액']:14,.0f}")
        thin = {c: n for c, n in d['숫자열_채워진행'].items() if n < d['행'] * 0.1}
        if thin:
            print('   ⚠ 거의 빈 숫자 열: ' + ' · '.join(f'{c} {n}/{d["행"]}행' for c, n in thin.items()))
        for c, lst in d['숫자열_비숫자값'].items():
            print(f'   ⚠ {c} 열의 비숫자 값 {len(lst)}건(원문 그대로 실음): ' +
                  ' · '.join(f"{e['년도']} {e['공연명']} = {e['값']!r}" for e in lst[:4]))


if __name__ == '__main__':
    main()
