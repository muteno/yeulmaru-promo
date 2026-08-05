#!/usr/bin/env python3
# ============================================================
# 260805 기획전시 일일실적 거울 빌더 — 운영자 업로드 일일보고 xlsx → data/exhib_daily_2026.js
#
# 소스 = 「2026 기획전시 일일실적내역.xlsx」(운영자 260805 커밋 94dc024) — 일자별 시트(MMDD) 하나가
#   그날의 「기획전시 판매현황」 보고서. 시트 안에 전시 블록이 1~3개(행 B「전시명 :」이 블록 머리):
#   전시명(C) · 전시일(G) · 목표 매출액(I) · 「합계」 행 = 당일 매수(D)·금액(E) + 누계 총인원(F)·총 금액(G)·무료(H)·유료(I).
#
# 산출 = data/exhib_daily_2026.js (전역 상수 EXHIB_DAILY_2026 — data/perf_access_stats.js와 같은 인클루드 축).
#   ⚠ 기계산출물 — 손편집 금지. 값 수정 = 원본 xlsx 교체(운영자) 후 이 스크립트 재실행.
#   결정적 출력(타임스탬프 없음) = 같은 입력이면 같은 파일 → diff가 값 변화만 말한다.
#
# 반입 규칙(실측 기반):
#   · 이름 없는 블록(전시 교체기 빈 서식 0324~0326) = 건너뜀
#   · 전시 기간 표기가 보고 중 바뀌면(프리뷰 3.15→3.22 연장 실측) **마지막 보고**가 정본
#   · 누계 금액이 전 기간 0/공란 = 무료 행사(free:true — 창작스튜디오 오픈스튜디오 실측) →
#     앱 판매 축은 무료 전시 제외 규칙(_anaExhibBuild와 동일)을 그대로 적용해 걸러 그린다
#   · 누계 감소(정정 보고)는 있는 그대로 싣고 경고만 출력 — 값 창작·보정 금지
#
# 사용법: python3 tools/build_exhib_daily.py ["2026 기획전시 일일실적내역.xlsx"]
# 의존: openpyxl (pip install openpyxl — docs/260803_sales_hist_parse.py와 동일 의존)
# ============================================================
import json, os, re, sys

try:
    import openpyxl
except ImportError:
    sys.exit('openpyxl 필요: pip install openpyxl')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '2026 기획전시 일일실적내역.xlsx')
OUT = os.path.join(ROOT, 'data', 'exhib_daily_2026.js')
YEAR = 2026

# ── 운영자 판정 제외(260805 「5월에 시작한 21은 빼도 될듯. 대관인거같은데」) ──────────────
#   실체 = 전시가 아니라 **부대 워크숍** — 원본 기간 표기가 「2026. 4. 16(토) ~ 5. 30(토), 4회차」(회차 프로그램)이고
#   일일보고도 종료일 1일치(21명·1,852,000원)뿐이다. 전시 곡선은 「기간 동안 차오르는 누계 관람」 축이라
#   회차 프로그램을 같은 축에 그리면 기준이 섞인다(운영자 판단과 같은 방향).
#   ⚠ 되돌리려면 이 목록에서 지우고 재실행하면 된다 — 원본 xlsx는 무접촉이고 거울만 다시 만들어진다.
EXCLUDE = ['어린이미술전 <우리 SUM 타볼래> 워크숍']
def _norm(s):
    return re.sub(r'\s+', '', str(s or '')).lower()
EXCLUDE_KEYS = set(_norm(x) for x in EXCLUDE)

def num(v):
    if v is None or v == '':
        return None
    try:
        return int(round(float(str(v).replace(',', ''))))
    except ValueError:
        return None

# 전시일 표기 파서 — '2026. 2. 13(금) ~ 3. 22(일)' · '~ 11. 1(일)' · '~ 5. 30(토), 4회차'
RANGE_RE = re.compile(r'(\d{4})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2}).*?~\s*(?:(\d{4})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})')
def parse_range(s):
    m = RANGE_RE.search(str(s or ''))
    if not m:
        return None, None
    y1, m1, d1, y2, m2, d2 = m.groups()
    start = f'{int(y1):04d}-{int(m1):02d}-{int(d1):02d}'
    end = f'{int(y2 or y1):04d}-{int(m2):02d}-{int(d2):02d}'
    return start, end

wb = openpyxl.load_workbook(SRC, data_only=True, read_only=True)
ex = {}          # name -> dict
skipped = []
dropped = set()  # EXCLUDE로 걸러낸 이름(로그용 — 목록이 실제로 물렸는지 매 실행 확인)
for sn in wb.sheetnames:
    if not re.fullmatch(r'\d{4}', sn):
        skipped.append(f'시트명 비일자 {sn}')
        continue
    day = f'{YEAR}{sn}'
    ws = wb[sn]
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    heads = [i for i, r in enumerate(rows) if len(r) > 1 and str(r[1] or '').strip().startswith('전시명')]
    for bi, i in enumerate(heads):
        end_i = heads[bi + 1] if bi + 1 < len(heads) else len(rows)
        name = re.sub(r'\s+', ' ', str(rows[i][2] or '').strip())
        if not name:
            continue                     # 빈 서식 블록(전시 교체기)
        if _norm(name) in EXCLUDE_KEYS:
            dropped.add(name)            # 운영자 판정 제외(위 EXCLUDE)
            continue
        rng = str(rows[i][6] or '').strip() if len(rows[i]) > 6 else ''
        goal = None
        tot = paid = free_n = rev = None
        for j in range(i, end_i):
            r = rows[j]
            if any(isinstance(c, str) and '목표 매출액' in c for c in r if c):
                goal = num(r[8]) if len(r) > 8 else None
            if len(r) > 2 and str(r[2] or '').strip() == '합계':
                tot, rev = num(r[5]) if len(r) > 5 else None, num(r[6]) if len(r) > 6 else None
                free_n, paid = num(r[7]) if len(r) > 7 else None, num(r[8]) if len(r) > 8 else None
        if tot is None:
            skipped.append(f'{sn} {name}: 합계 미검출')
            continue
        e = ex.setdefault(name, {'name': name, 'rng': '', 'goal': None, 'daily': []})
        if rng:
            e['rng'] = rng               # 마지막 보고가 정본(연장 반영)
        if goal is not None:
            e['goal'] = goal
        e['daily'].append([day, tot, paid, rev])

wb.close()

out_list = []
for name, e in ex.items():
    start, end = parse_range(e['rng'])
    if not start:
        skipped.append(f'{name}: 전시일 파싱 실패 {e["rng"]!r}')
    daily = sorted(e['daily'])
    last = daily[-1]
    is_free = all((p[3] or 0) == 0 for p in daily)
    for idx, lab in ((1, '총인원'), (2, '유료')):   # 감소 = 정정/재기재 신호 — 그대로 반입하되 로그로 남긴다(어린이미술전 0329 유료 647→96 실측)
        for k in range(len(daily) - 1):
            if (daily[k][idx] or 0) > (daily[k + 1][idx] or 0):
                print(f'⚠ 누계 {lab} 감소(정정 보고 추정 · 그대로 반입): {name} {daily[k][0]} {daily[k][idx]} → {daily[k + 1][0]} {daily[k + 1][idx]}')
    out_list.append({
        'name': name, 'start': start, 'end': end, 'goalRev': e['goal'],
        'free': is_free, 'tot': last[1], 'paid': last[2], 'rev': last[3],
        'days': len(daily), 'daily': daily,
    })
out_list.sort(key=lambda x: (x['start'] or '9999', x['name']))

js_items = []
for o in out_list:
    daily_js = ','.join(
        '[%s,%s,%s,%s]' % (json.dumps(p[0]),
                           'null' if p[1] is None else p[1],
                           'null' if p[2] is None else p[2],
                           'null' if p[3] is None else p[3])
        for p in o['daily'])
    js_items.append(
        ' {name:%s,start:%s,end:%s,goalRev:%s,free:%s,tot:%s,paid:%s,rev:%s,days:%d,\n  daily:[%s]}' % (
            json.dumps(o['name'], ensure_ascii=False), json.dumps(o['start']), json.dumps(o['end']),
            'null' if o['goalRev'] is None else o['goalRev'], 'true' if o['free'] else 'false',
            'null' if o['tot'] is None else o['tot'], 'null' if o['paid'] is None else o['paid'],
            'null' if o['rev'] is None else o['rev'], o['days'], daily_js))

header = (
    '// [기계산출물 — 손편집 금지] tools/build_exhib_daily.py가 「2026 기획전시 일일실적내역.xlsx」(운영자 업로드)에서 생성.\n'
    '// 값 수정 = 원본 xlsx 교체 후 재실행. 소비처 = index.html _bizExhibRows(3면 기획 전시 누적범위 차트 — 전시DB에 없는 전시만 보충).\n'
    '// daily 항목 = [기준일자 YYYYMMDD, 누계 총인원, 누계 유료, 누계 총 금액(원)] · free = 전 기간 금액 0(무료 행사 — 판매 축 제외 대상).\n')
body = 'var EXHIB_DAILY_2026={year:%d,src:%s,list:[\n%s\n]};\n' % (
    YEAR, json.dumps(os.path.basename(SRC), ensure_ascii=False), ',\n'.join(js_items))
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, 'w', encoding='utf-8') as f:
    f.write(header + body)

print(f'✓ {os.path.relpath(OUT, ROOT)} — 전시 {len(out_list)}건')
for o in out_list:
    print(' · %-34s %s~%s %3d일 최종 총 %s명 · 유료 %s · 매출 %s원%s' % (
        o['name'][:34], o['start'], o['end'], o['days'],
        o['tot'], o['paid'], o['rev'], ' · 무료(판매 축 제외)' if o['free'] else ''))
for d in sorted(dropped):
    print(' ⛔ 제외(운영자 판정 · EXCLUDE): %s' % d)
for miss in sorted(EXCLUDE_KEYS - set(_norm(d) for d in dropped)):
    print(' ⚠ EXCLUDE 목록에 있으나 원본에서 못 찾음(이름 바뀜?): %s' % miss)   # 조용히 무효가 되지 않게
if skipped:
    print('건너뜀/경고:')
    for s in skipped[:12]:
        print(' ⚠', s)
