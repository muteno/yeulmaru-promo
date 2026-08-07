#!/usr/bin/env python3
# ============================================================
# 260807 운영관리대장 정본 동기 — 계획 산출기 (운영자 「이 내용을 다 반영 · 겹쳐서 다르면 이게 정본(공연명 등 제외)」)
#
# 원본 = 운영자 업로드 「2026 공연장 운영관리대장」 xlsx (SharePoint 마스터의 다운로드본).
#   시트 3장 중 **세부운영관리대장**(회차 단위 원장 2,246행)이 운영_세부운영관리대장(정리)의 원천이다.
#   나머지 2장(공연장운영관리대장 = 공연 단위 요약 · 기획공연판매현황 = 2024~ 기획공연 판매)은 이 시트의
#   집계·부가정보라 **여기선 안 건드린다**(반입하려면 별도 시트 신설 = 운영자 결정 · 하단 「미반입」 참조).
#
# 산출 = docs/260807_대장정본_계획.json  — {fingerprint, headers, rows, diff}
#   · rows = **병합 완료된 시트 전문**(그대로 POST하면 되는 최종형). 세션이 손으로 만든 값 0 —
#     전량이 원본 xlsx 아니면 라이브 현재값에서 온다.
#   · fingerprint = 계획을 계산한 **라이브 스냅샷의 지문**. 반입 스크립트가 실행 직전 라이브를 다시 읽어
#     지문이 다르면 **거부**한다(그 사이 누가 모달로 고쳤다는 뜻 = 계획이 낡음 → 이 스크립트 재실행).
#     build_annual_yr.mjs의 「후퇴 = 거울 낡음 신호로 거부」와 같은 축.
#
# 【정합 규칙】 — 값 창작 0. 아래가 전부다.
#   ① 행 정렬 = (년도,월,일,기본좌석) 키의 최장공통부분수열(difflib). 두 원장이 같은 시간순이라 이걸로 붙는다.
#      정렬 결과가 replace(같은 자리·값만 다름)면 **공연명 유사도**를 재검사해 다른 공연이 붙었으면 즉시 중단.
#   ② 덮어쓰기(= xlsx가 정본) = 월·일·사업구분·공연구분·티켓구분·기본좌석·발권유료
#   ③ 안 건드림 = 공연명(운영자 명시 제외) · 장르1 · 공연ID · 전체순번
#      ⚠ 장르1을 왜 빼나: xlsx엔 대응 열이 **없다**. 실측 교차표(2012~2024 1,987행)에서
#        (복합,뮤지컬) 583행이 라이브 장르1로는 뮤지컬 283 / 어린이·가족 113 / 대중 27 / 발레·연극 9로 갈린다
#        = 라이브 장르1은 xlsx 세부장르의 사본이 아니라 **앱이 따로 정제한 축**이다. 세부장르로 덮으면
#        어린이·가족 분류 113행이 통째로 사라지고, 어휘에 없는 값(콘서트·행사·교육·영화)이 새로 들어온다.
#   ④ xlsx 공란 · 라이브 값 있음 = **안 덮는다**(원장 미기입을 실데이터 말소로 바꾸지 않는다).
#     같은 축으로, 기본좌석의 **비숫자 표기**(비대면 4행 · 연기 1행 · '-' 4행)도 안 쓴다 — 숫자 열에
#     문자를 넣는 것이라 앱이 어차피 NaN→공란으로 떨구고(_bizNum), 라이브의 공란이 이미 같은 뜻이다.
#     그 표기가 지닌 정보는 이미 다른 열에 있다(예: '연기' 1행 = 라이브 상태 '취소공연'으로 기록됨).
#   ⑤ xlsx에만 있는 행 = 추가. 시간열이 「(19:30)\n취소」·「연기」면 상태='취소공연'(라이브 기존 5행과 같은 표기) —
#      이 표기라야 _bizClean(index.html)이 걸러낸다. 상태를 '정상'으로 넣으면 2020년 코로나 취소 회차
#      43행이 **점유율 0%인 정상 공연**으로 집계돼 그 해 통계가 무너진다.
#   ⑥ 라이브에만 있는 행 = 유지(2026 4~6월 16행 = 260804 인터파크 원장 반입분. xlsx 스냅샷이 그보다 옛것).
#   ⑦ 신규 열 「발권초대」 = xlsx 원장에 있고 라이브엔 없던 무료·초대 발권 수. 맨 끝에 append.
#      (앱 주석이 「원장엔 무료·초대 열이 없다」로 남긴 그 구멍 — index.html L13091 환산 각주의 원인)
#
# 사용법: python3 docs/260807_대장정본_plan.py <원본.xlsx> [--live docs/260807_live.json]
#   --live 생략 시 Worker API에서 직접 fresh 조회(GET은 앱 비번만으로 된다).
# 의존: openpyxl (tools/build_exhib_daily.py와 동일)
# ============================================================
import difflib, json, os, re, sys, urllib.request, hashlib

try:
    import openpyxl
except ImportError:
    sys.exit('openpyxl 필요: pip install openpyxl')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'docs', '260807_대장정본_계획.json')
API = 'https://yeulmaru-promo-api.yeulmarumaster.workers.dev'
SHEET = '세부운영관리대장(정리)'

# xlsx 세부운영관리대장 열 위치(0-based) — 2행이 머리글
C_순번, C_년도, C_월, C_일, C_시간, C_공연명 = 0, 2, 3, 4, 6, 7
C_사업, C_공연구분, C_장르, C_세부장르, C_장소, C_좌석, C_티켓, C_유료, C_초대 = 8, 9, 10, 11, 12, 13, 14, 15, 16

# 라이브가 정본인 열(앱 정제 축) — 덮어쓰기 금지
KEEP = ('공연명', '장르1', '공연ID', '전체순번', '상태')
# xlsx가 정본인 열 → xlsx 열 위치
OVERWRITE = {'월': C_월, '일': C_일, '사업구분': C_사업, '공연구분': C_공연구분,
             '티켓구분': C_티켓, '기본좌석': C_좌석, '발권유료': C_유료}
NEWCOL = '발권초대'


def S(v):
    return '' if v is None else str(v).strip()


def num(v):
    """엑셀이 숫자로 준 값의 '1.0' 꼬리 제거. 숫자가 아니면 원문 유지(비대면·연기·- 등)."""
    s = S(v)
    if s == '':
        return ''
    try:
        f = float(s)
        return str(int(f)) if f == int(f) else s
    except ValueError:
        return s


def md(v):
    """'2012년'·'1월'·'11일' 접미사 제거 — 원장 표기가 연도마다 흔들린다(2019년치 월열 전량이 'N월')."""
    return num(re.sub(r'[년월일]\s*$', '', S(v)))


def uname(s):
    """공연명 정규화 — 꺾쇠·공백·'- 여수' 접미사 제거(index.html _uName과 같은 축)."""
    s = re.sub(r'[-–]\s*여수\s*$', '', S(s))
    return re.sub(r'[^0-9A-Za-z가-힣]', '', s)


def read_xlsx(path):
    wb = openpyxl.load_workbook(path, data_only=True, read_only=True)
    ws = wb['세부운영관리대장']
    out, tot, cur = [], {}, ''
    for i, r in enumerate(ws.iter_rows(min_row=3, values_only=True)):
        y = md(r[C_년도])
        if y:
            cur = y
        if S(r[C_순번]) == '합계':                  # 연 집계행 = 검산 기준
            tot[cur] = (F(r[C_유료]), F(r[C_초대]), F(r[23]), F(r[24]), S(r[C_월]))   # 발권 · 공연 · 범위라벨
            continue
        if S(r[C_순번]) == '소계':                  # 월 집계행
            continue
        if not (S(r[C_공연명]) and (y or S(r[C_월]))):   # 빈 서식행
            continue
        cancelled = bool(re.search(r'취소|연기', S(r[C_시간]))) or S(r[C_사업]) in ('취소', '연기')
        out.append({'_row': i + 3, '_r': r, '_cancel': cancelled, '_y': y or cur})
    return out, tot


def F(v):
    try:
        return float(S(v))
    except ValueError:
        return 0.0


def verify_parse(X, tot):
    """검산 — 내가 읽은 행들의 연도별 합이 원장 「합계」행과 맞는가.

    ⚠ 원장 합계행은 **두 축**을 든다(실측): 발권유료/발권초대 열(P·Q)과 공연유료/공연무료 열(X·Y).
      연도마다 어느 쪽을 채웠는지가 다르고(2012~2020은 P·Q, 2022~는 X·Y, 2021은 둘 다·값이 서로 다름),
      한 해 안에서도 두 축이 어긋난다 = **원장 자체의 SUM 범위 문제**다. 그래서 「둘 중 하나와 맞으면 OK」로 본다.
      끝까지 안 맞는 해는 표시만 하고 값은 **안 고친다** — 원장 산식은 세션이 손댈 자리가 아니다
      (실측 2023 = 마지막 행 「연극 <옥탑방 고양이>」 12/25 유료 149·초대 8이 합계 SUM 범위 밖).
      합계행 라벨이 「전체」가 아닌 해(실측 2025 = 「상반기」)는 애초에 연 전체 기준이 아니라 참고만 한다.
    """
    mine = {}
    for x in X:
        a = mine.setdefault(x['_y'], [0.0, 0.0])
        a[0] += F(x['_r'][C_유료]); a[1] += F(x['_r'][C_초대])
    rep, bad = [], 0
    for y in sorted(set(mine) | set(tot)):
        m = mine.get(y, [0.0, 0.0]); t = tot.get(y)
        if not t:
            rep.append((y, m, None, '합계행 없음')); continue
        cands = [c for c in ((t[0], t[1]), (t[2], t[3])) if c[0] or c[1]]
        hit = any(abs(m[0] - c[0]) < 0.5 and abs(m[1] - c[1]) < 0.5 for c in cands)
        partial = t[4] and t[4] != '전체'
        if not hit and not partial:
            bad += 1
        ref = next((c for c in cands if abs(m[0] - c[0]) < 0.5), cands[0] if cands else (0, 0))
        note = 'OK' if hit else (f'참고(합계행 범위 = {t[4]})' if partial else '원장 SUM 범위 누락 — 값 미보정')
        rep.append((y, m, ref, note))
    return rep, bad


def fetch_live(cache):
    if cache and os.path.exists(cache):
        return json.load(open(cache, encoding='utf-8'))
    url = API + '/api/ops?sheet=' + urllib.request.quote(SHEET) + '&fresh=1'
    req = urllib.request.Request(url, headers={'X-App-Password': os.environ.get('YM_PW', '0510')})
    with urllib.request.urlopen(req, timeout=60) as f:
        d = json.load(f)
    if cache:
        json.dump(d, open(cache, 'w', encoding='utf-8'), ensure_ascii=False)
    return d


def fingerprint(rows, headers):
    """라이브 스냅샷 지문 — 헤더 + 모든 셀 값. 한 칸이라도 바뀌면 달라진다."""
    h = hashlib.sha256()
    h.update(('\x1f'.join(headers) + '\x1e').encode())
    for r in rows:
        h.update(('\x1f'.join(S(r.get(k)) for k in headers) + '\x1e').encode())
    return h.hexdigest()[:16]


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if not src or not os.path.exists(src):
        sys.exit('사용법: python3 docs/260807_대장정본_plan.py <운영관리대장.xlsx> [--live <캐시.json>]')
    cache = None
    if '--live' in sys.argv:
        cache = sys.argv[sys.argv.index('--live') + 1]

    X, tot = read_xlsx(src)
    live = fetch_live(cache)
    L = live['rows']
    headers = list(live['headers'])
    print(f'원본 {len(X)}행 · 라이브 {len(L)}행 (헤더 {len(headers)}열)')

    rep, bad = verify_parse(X, tot)
    print('\n[검산] 파싱 합 vs 원장 「합계」행')
    for y, m, ref, note in rep:
        r = f'{ref[0]:>9,.0f} {ref[1]:>8,.0f}' if ref else ' ' * 18
        print(f'   {y or "(연도공란)":8s} 유료 {m[0]:>9,.0f} 초대 {m[1]:>8,.0f} | 원장 {r} | {note}')
    print(f'   → 일치 {len(rep)-bad}/{len(rep)}년' + (' (차이는 원장 SUM 범위 누락 — 값 미보정)' if bad else ''))

    # ── ① 행 정렬 ────────────────────────────────────────────────
    #   2단: 먼저 (년,월,일,좌석,유료) **완전 일치**로 붙이고, 남은 구간만 (년,월,일)로 다시 붙인다.
    #   1단만 쓰면 같은 날 회차가 둘인 공연에서 값이 다른 쪽끼리 임의로 짝지어져 「없던 충돌」이 생긴다
    #   (실측 = 2022 라이어2탄 12/17 두 회차 197·154가 엇갈려 붙어 197→154 덮어쓰기로 잡혔다).
    K5 = lambda y, m, d, s, p: (y, m, d, s, p)
    kx5 = [K5(md(x['_r'][C_년도]), md(x['_r'][C_월]), md(x['_r'][C_일]), num(x['_r'][C_좌석]), num(x['_r'][C_유료])) for x in X]
    kl5 = [K5(md(r['년도']), md(r['월']), md(r['일']), num(r['기본좌석']), num(r['발권유료'])) for r in L]
    kx3 = [k[:3] for k in kx5]
    kl3 = [k[:3] for k in kl5]

    def align(ix, jx):
        """ix·jx = 원본/라이브 인덱스 리스트. [(xi|None, lj|None)] 을 원장 순서대로 돌려준다."""
        out = []
        sub_x, sub_l = [kx5[i] for i in ix], [kl5[j] for j in jx]
        for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, sub_x, sub_l, autojunk=False).get_opcodes():
            if tag == 'equal':
                out += [(ix[i], jx[j]) for i, j in zip(range(i1, i2), range(j1, j2))]
                continue
            # 2단 — 남은 구간을 (년,월,일)만으로 다시 붙인다
            gi, gj = ix[i1:i2], jx[j1:j2]
            g_x, g_l = [kx3[i] for i in gi], [kl3[j] for j in gj]
            for t2, a1, a2, b1, b2 in difflib.SequenceMatcher(None, g_x, g_l, autojunk=False).get_opcodes():
                if t2 == 'equal':
                    out += [(gi[a], gj[b]) for a, b in zip(range(a1, a2), range(b1, b2))]
                elif t2 == 'replace':
                    n = min(a2 - a1, b2 - b1)
                    out += [(gi[a], gj[b]) for a, b in zip(range(a1, a1 + n), range(b1, b1 + n))]
                    out += [(gi[a], None) for a in range(a1 + n, a2)]
                    out += [(None, gj[b]) for b in range(b1 + n, b2)]
                elif t2 == 'delete':
                    out += [(gi[a], None) for a in range(a1, a2)]
                else:
                    out += [(None, gj[b]) for b in range(b1, b2)]
        return out

    plan_seq = align(list(range(len(X))), list(range(len(L))))
    pairs = [(X[i], L[j]) for i, j in plan_seq if i is not None and j is not None]
    addX = [X[i] for i, j in plan_seq if i is not None and j is None]
    keepL = [L[j] for i, j in plan_seq if i is None and j is not None]
    print(f'정렬: 짝 {len(pairs)} · xlsx전용 {len(addX)} · 라이브전용 {len(keepL)}')

    # 짝지어진 행의 공연명 유사도 검사 — 엉뚱한 행이 붙으면 즉시 중단(값 오염 방지)
    bad = [(x['_row'], S(x['_r'][C_공연명]), S(l['공연명'])) for x, l in pairs
           if difflib.SequenceMatcher(None, uname(x['_r'][C_공연명]), uname(l['공연명'])).ratio() < 0.6]
    if bad:
        print(f'✗ 공연명이 어긋난 짝 {len(bad)}건 — 정렬 실패로 보고 중단합니다:')
        for b in bad[:20]:
            print('   xlsx행%-6d %-40s ↔ live %s' % (b[0], b[1][:38], b[2][:38]))
        sys.exit(1)

    # ── ②③④ 값 병합 ────────────────────────────────────────────
    if NEWCOL not in headers:
        headers.append(NEWCOL)
    diff = {'덮어씀': [], '보강': [], '추가': [], '비숫자좌석': [], '유지': len(keepL), '초대신규': 0}

    # 공연ID = 라이브 규칙(YYMMDD_NN) 계승 — 같은 날·같은 공연의 기존 ID가 있으면 그걸 잇고, 없으면 새로 딴다.
    idbyday, namebyid = {}, {}
    for l in L:
        i = S(l.get('공연ID'))
        if not i:
            continue
        namebyid[i] = S(l['공연명'])
        if len(i) == 9 and '_' in i:
            idbyday.setdefault(i[:6], set()).add(int(i[7:]))

    seq = []
    for i, j in plan_seq:
        if i is not None and j is not None:              # ②③④ 짝 = 라이브 행 위에 xlsx 값을 얹는다
            x, l = X[i], L[j]
            r = {h: S(l.get(h)) for h in headers}
            for col, cix in OVERWRITE.items():
                xv = md(x['_r'][cix]) if col in ('월', '일') else num(x['_r'][cix])
                lv = md(l.get(col)) if col in ('월', '일') else num(l.get(col))
                if xv == lv or xv == '':                 # ④ xlsx 공란은 안 덮는다
                    continue
                if col == '기본좌석' and not re.fullmatch(r'\d+(\.\d+)?', xv):
                    diff['비숫자좌석'].append({'행': x['_row'], '공연명': S(l['공연명']), 'xlsx': xv})
                    continue                             # ④ 숫자 열에 문자 표기는 안 쓴다
                r[col] = xv
                (diff['보강'] if lv == '' else diff['덮어씀']).append(
                    {'행': x['_row'], '공연명': S(l['공연명']), '열': col, 'live': lv, 'xlsx': xv})
            r[NEWCOL] = num(x['_r'][C_초대])              # ⑦ 발권초대
            if r[NEWCOL] != '':
                diff['초대신규'] += 1
            seq.append(r)
        elif i is not None:                              # ⑤ xlsx 전용 = 신규 행
            r0 = X[i]['_r']
            y, m, d = md(r0[C_년도]), md(r0[C_월]), md(r0[C_일])
            r = {h: '' for h in headers}
            r['공연명'] = S(r0[C_공연명])
            r['전체순번'] = num(r0[C_순번])
            r['년도'], r['월'], r['일'] = y, m, d
            for col, cix in OVERWRITE.items():
                if col in ('월', '일'):
                    continue
                v = num(r0[cix])
                if col == '기본좌석' and v and not re.fullmatch(r'\d+(\.\d+)?', v):
                    v = ''                               # ④ 숫자 열에 문자 표기('비대면'·'-') 금지
                r[col] = v
            r[NEWCOL] = num(r0[C_초대])
            r['상태'] = '취소공연' if X[i]['_cancel'] else '정상'
            if y.isdigit() and m.isdigit() and d.isdigit():
                day = '%02d%02d%02d' % (int(y) % 100, int(m), int(d))
                same = sorted(k for k, n in namebyid.items() if k[:6] == day and uname(n) == uname(r['공연명']))
                if same:
                    r['공연ID'] = same[0]
                else:
                    nn = max(idbyday.get(day, {0})) + 1
                    idbyday.setdefault(day, set()).add(nn)
                    r['공연ID'] = '%s_%02d' % (day, nn)
                    namebyid[r['공연ID']] = r['공연명']
            diff['추가'].append({'행': X[i]['_row'], '공연명': r['공연명'], '년월일': f'{y}-{m}-{d}',
                                 '상태': r['상태'], '기본좌석': r['기본좌석'], '발권유료': r['발권유료'],
                                 '발권초대': r[NEWCOL], '공연ID': r.get('공연ID', '')})
            seq.append(r)
        else:                                            # ⑥ 라이브 전용 = 그대로 유지
            seq.append({h: S(L[j].get(h)) for h in headers})
    assert len(seq) == len(pairs) + len(addX) + len(keepL), '행 수 불일치'

    plan = {'src': os.path.basename(src), 'sheet': SHEET,
            'fingerprint': fingerprint(L, list(live['headers'])),
            'live_count': len(L), 'headers': headers, 'rows': seq, 'diff': diff}
    json.dump(plan, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    print(f'\n[계획] {os.path.relpath(OUT, ROOT)}  ({len(seq)}행 · {len(headers)}열 · 지문 {plan["fingerprint"]})')
    print(f"  · 덮어씀(양쪽 값 다름) {len(diff['덮어씀'])}건")
    for e in diff['덮어씀'][:20]:
        print(f"      {e['공연명'][:30]:32s} {e['열']}: {e['live']} → {e['xlsx']}")
    print(f"  · 보강(라이브 공란 채움) {len(diff['보강'])}건 " +
          str({k: sum(1 for e in diff['보강'] if e['열'] == k) for k in OVERWRITE if any(e['열'] == k for e in diff['보강'])}))
    print(f"  · 신규 행 {len(diff['추가'])}건 (취소공연 {sum(1 for e in diff['추가'] if e['상태']=='취소공연')} · 정상 {sum(1 for e in diff['추가'] if e['상태']=='정상')})")
    print(f"  · 라이브 전용 유지 {diff['유지']}행 · 발권초대 채운 행 {diff['초대신규']}")
    if diff['비숫자좌석']:
        print(f"  · 기본좌석 비숫자 표기 {len(diff['비숫자좌석'])}건 = 미반영(공란 유지): " +
              ', '.join(sorted({e['xlsx'] for e in diff['비숫자좌석']})))


if __name__ == '__main__':
    main()
