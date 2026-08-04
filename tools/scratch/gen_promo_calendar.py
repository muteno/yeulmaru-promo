# -*- coding: utf-8 -*-
"""홍보 캘린더 반영안 HTML 생성기 (일회성 스냅샷 · docs/reports/)

값의 출처(전부 실측 · 창작 0):
  · 프로그램 풀네임/홍보창 = 이관본/miso_db.json datasets.programs (2026-07-30 스냅샷)
  · 접수 규칙            = index.html canApplyOnDate / canApplyAtTime / _validateScheduleChange
  · 플랫폼 색            = index.html PLAT_COLORS
  · 토큰                 = index.html :root 2블록
운영자 지시(260804): 인스타 11:00~17:00 · 카카오톡 11:00 또는 14:00 · 토요일 가능
사용: python3 tools/scratch/gen_promo_calendar.py
"""
import datetime, html, json, os, sys

OUT = "docs/reports/20260804_홍보캘린더_반영안_9-10월.html"
TODAY = datetime.date(2026, 8, 4)

# ── 프로그램 정본(풀네임 = 프로그램 시트 C열 그대로 · 신청 시 이 문자열이어야 매칭된다) ──
PROG = {
    "SEM": ("여수세계섬박람회 기념 음악회",                       "260910_01", "2026-07-01", "2026-09-10", "2026-09-10", "ss"),
    "JJH": ("조재혁 피아노 리사이틀",                             "260912_01", "2026-07-01", "2026-09-12", "2026-09-12", "cl"),
    "GND": ("뮤지컬 <그날들>",                                   "260918_01", "2026-07-01", "2026-09-20", "2026-09-18", "mu"),
    "CHJ": ("뮤지컬 <이상한 나라의 춘자씨>",                       "261009_01", "2026-07-01", "2026-10-10", "2026-10-09", "mu"),
    "TRP": ("국립현대무용단 <트리플 빌>",                          "261014_01", "2026-07-01", "2026-10-14", "2026-10-14", "dn"),
    "C18": ("18세기, 시대악기로 만나는 바로크의 정점과 고전의 새벽",  "261022_01", "2026-07-01", "2026-10-22", "2026-10-22", "cl"),
    "PNP": ("다비드 바뱅 & 아드리앙 몽도 <피아노 & 피아노>",         "261027_01", "2026-07-01", "2026-10-27", "2026-10-27", "pf"),
}
SHORT = {"SEM": "섬박람회 음악회", "JJH": "조재혁", "GND": "그날들", "CHJ": "춘자씨",
         "TRP": "트리플 빌", "C18": "18세기", "PNP": "피아노 & 피아노"}

# ── 플랫폼 (색 = index.html PLAT_COLORS 실값) ──
PLAT = {
    "카카오톡":     ("#C8900A", "-"),
    "인스타그램":   ("#C02872", "-"),
    "블로그·맘카페": ("#1B7A34", "블로그"),
}

# ── 반영안 (날짜, 시간, 플랫폼1, 형식, 프로그램키, 제목, 내용, 게시담당자) ──
E = [
    ("2026-08-05", "11:00", "카카오톡",     "이미지", "JJH", "조기예매 25% 마감 D-3",       "8/8(토) 마감 · R 60,000→45,000 / S 40,000→30,000", "황세웅"),
    ("2026-08-06", "14:00", "카카오톡",     "이미지", "SEM", "티켓오픈 안내",               "9/10(목) 대극장 · 박람회 개막주 첫 공연",           "황세웅"),
    ("2026-08-06", "15:00", "인스타그램",   "이미지", "SEM", "티켓오픈 카드",               "섬박람회 계정 공동작업자 1순위 대상",              "심희은"),
    ("2026-08-07", "16:00", "인스타그램",   "이미지", "JJH", "조기예매 25% 마감 D-1",       "스토리 · 내일 마감 리마인드",                     "심희은"),
    ("2026-08-08", "11:00", "카카오톡",     "이미지", "JJH", "조기예매 25% 오늘 마감",      "토요일 발송 · 마감 당일 마지막 푸시",              "황세웅"),
    ("2026-08-12", "11:00", "카카오톡",     "이미지", "CHJ", "티켓오픈 안내",               "10/9~10 대극장 · R 30,000 / S 20,000",            "황세웅"),
    ("2026-08-12", "14:00", "인스타그램",   "영상",   "CHJ", "티켓오픈 릴스",               "2024 공연예술창작산실 올해의 신작",                "심희은"),
    ("2026-08-14", "15:00", "인스타그램",   "이미지", "JJH", "영화관 대신 공연장 ① 만원의 행복", "학생 전학년 1만원 정액 2종 = 9/12 조재혁 · 10/22 18세기", "심희은"),
    ("2026-08-19", "11:00", "카카오톡",     "이미지", "C18", "티켓오픈 안내",               "10/22(목) 소극장 · 학생 전학년 1만원",             "황세웅"),
    ("2026-08-19", "14:00", "인스타그램",   "이미지", "C18", "티켓오픈 카드",               "시대악기 = 거트현·바깥으로 휜 활·목재 관악기·가죽 타악기", "심희은"),
    ("2026-08-21", "15:00", "인스타그램",   "이미지", "JJH", "바로크의 정점에서 고전의 새벽까지 — 예울마루의 18세기",
     "9/12 현대 피아노(조재혁 = 모차르트 270주년 프로젝트) ↔ 10/22 시대악기 · 학생 둘 다 1만원", "심희은"),
    ("2026-08-26", "16:00", "인스타그램",   "영상",   "GND", "출연 배우 인사영상",          "서울 종연(8/23) 직후 · 김광석 30주기",             "심희은"),
    ("2026-09-01", "14:00", "인스타그램",   "이미지", "SEM", "박람회 보러 온 김에, 저녁엔 예울마루", "공동작업자 · 회기 9/5~11/4 시즌 안내",     "심희은"),
    ("2026-09-03", "15:00", "인스타그램",   "이미지", "CHJ", "영화관 대신 공연장 ② %할인 3종", "춘자씨 50%(초·중·고) · 트리플빌/피아노 30%",     "심희은"),
    ("2026-09-16", "11:00", "카카오톡",     "이미지", "GND", "공연 D-2",                    "9/18~20 4회차 · 10년 만의 재방문",                 "황세웅"),
    ("2026-09-24", "15:00", "인스타그램",   "이미지", "TRP", "10월, 여수에서만 (희소성 묶음)", "트리플 빌 + 피아노 & 피아노 · 학생 30%",         "심희은"),
    ("2026-09-24", "16:00", "블로그·맘카페", "텍스트", "TRP", "10월, 여수에서만 — 롱폼",     "국립 단체 지역투어 + 해외 아티스트 내한",           "심희은"),
    ("2026-10-06", "14:00", "인스타그램",   "영상",   "CHJ", "공연 D-3 릴스",               "10/9~10 · 가족 관람 소구",                        "심희은"),
    ("2026-10-08", "16:00", "블로그·맘카페", "텍스트", "TRP", "윌리엄 포사이스 심화",        "서울 CJ토월 10/2~4 직후 · 검색 유입용",            "심희은"),
    ("2026-10-16", "15:00", "인스타그램",   "이미지", "C18", "시대악기로 듣는 18세기",       "제목 그대로 = 바로크의 정점 → 고전의 새벽 · 소극장",  "심희은"),
    ("2026-10-21", "14:00", "인스타그램",   "영상",   "PNP", "20년 전 아비뇽의 재회",       "babx × Adrien M & Claire B · 2023 초연",          "심희은"),
    ("2026-10-21", "16:00", "블로그·맘카페", "텍스트", "PNP", "미디어아트 롱폼",             "아르떼 컨택 연계 · 검색 유입용",                   "심희은"),
]

# ── 공연일·티켓오픈 마커 ──
PERF_DAYS = {"2026-09-10": "SEM", "2026-09-12": "JJH", "2026-09-18": "GND", "2026-09-19": "GND",
             "2026-09-20": "GND", "2026-10-09": "CHJ", "2026-10-10": "CHJ", "2026-10-14": "TRP",
             "2026-10-22": "C18", "2026-10-27": "PNP"}
OPEN_DAYS = {"2026-08-06": "섬박람회 음악회 티켓오픈", "2026-08-12": "춘자씨 티켓오픈",
             "2026-08-19": "18세기 티켓오픈", "2026-08-08": "조재혁 조기예매 25% 마감"}
EXPO = (datetime.date(2026, 9, 5), datetime.date(2026, 11, 4))

DOW = ["월", "화", "수", "목", "금", "토", "일"]
DOWK = ["일", "월", "화", "수", "목", "금", "토"]


def d(s):
    return datetime.date(*map(int, s.split("-")))


# ── 검증 (앱 규칙 실측 재현) ─────────────────────────────────────────────
def validate():
    rows, bad = [], 0
    seen = {}
    for (dt, tm, p1, fmt, pk, title, cont, mgr) in E:
        dd, msgs = d(dt), []
        # ① 화~토 (자동_일요일 = 일0·월1 차단) — python weekday(): 월0..일6
        if dd.weekday() in (0, 6):
            msgs.append("일·월 차단")
        # ② 09:00~18:00 (자동_낮에만)
        if not ("09:00" <= tm <= "18:00"):
            msgs.append("09~18시 밖")
        # ③ 운영자 지시 시간대
        if p1 == "인스타그램" and not ("11:00" <= tm <= "17:00"):
            msgs.append("인스타 11~17시 밖")
        if p1 == "카카오톡" and tm not in ("11:00", "14:00"):
            msgs.append("카톡 11/14시 아님")
        # ④ 홍보창 = 홍보시작일 ~ 판매종료일
        _, _, ps, se, _, _ = PROG[pk]
        if dt < ps:
            msgs.append("홍보시작 전")
        if dt > se:
            msgs.append("홍보종료(판매종료 %s) 후" % se)
        # ⑤ 지난 날짜
        if dd < TODAY:
            msgs.append("지난 날짜")
        # ⑥ 같은 담당자 같은 시각 충돌
        key = (dt, tm, mgr)
        if key in seen:
            msgs.append("담당자 시간충돌")
        seen[key] = True
        if msgs:
            bad += 1
        rows.append((dt, tm, p1, fmt, pk, title, cont, mgr, msgs))
    return rows, bad


def month_grid(y, m, byday):
    first = datetime.date(y, m, 1)
    last = (datetime.date(y + (m == 12), (m % 12) + 1, 1) - datetime.timedelta(days=1))
    lead = (first.weekday() + 1) % 7          # 일요일 시작 그리드
    cells = [None] * lead + [datetime.date(y, m, i) for i in range(1, last.day + 1)]
    while len(cells) % 7:
        cells.append(None)
    out = ['<div class="cal"><div class="calhd">%d년 %d월</div><div class="grid">' % (y, m)]
    for w in DOWK:
        cls = " off" if w in ("일", "월") else ""
        out.append('<div class="dow%s">%s</div>' % (cls, w))
    for c in cells:
        if c is None:
            out.append('<div class="cell blank"></div>')
            continue
        k = c.isoformat()
        cls = ["cell"]
        if c.weekday() in (0, 6):
            cls.append("off")
        if EXPO[0] <= c <= EXPO[1]:
            cls.append("expo")
        if k == TODAY.isoformat():
            cls.append("today")
        out.append('<div class="%s">' % " ".join(cls))
        out.append('<div class="dnum">%d</div>' % c.day)
        if k in OPEN_DAYS:
            out.append('<div class="mk mk-open">%s</div>' % html.escape(OPEN_DAYS[k]))
        if k in PERF_DAYS:
            pk = PERF_DAYS[k]
            out.append('<div class="mk mk-perf g-%s">🎭 %s</div>' % (PROG[pk][5], html.escape(SHORT[pk])))
        for (tm, p1, pk, title) in byday.get(k, []):
            out.append('<div class="ev" style="--pc:%s"><b>%s</b> %s<small>%s</small></div>'
                       % (PLAT[p1][0], tm, html.escape(SHORT[pk]), html.escape(title)))
        out.append("</div>")
    out.append("</div></div>")
    return "".join(out)


def console_script(rows):
    """앱 탭 콘솔에 붙여넣는 일괄 신청 스크립트.
    앱 자체 함수(_buildRecRow · _validateScheduleChange · api)를 그대로 쓴다 —
    위저드가 타는 경로와 동일(Worker→Graph→SharePoint). 새 저장 경로를 만들지 않는다."""
    items = ",\n".join(
        '{d:"%s",t:"%s",p1:"%s",p2:"%s",f:"%s",prog:%s,ti:"%s",bo:"%s",mg:"%s"}'
        % (dt, tm, p1, PLAT[p1][1], fmt, json.dumps(PROG[pk][0], ensure_ascii=False),
           title.replace('"', "'"), cont.replace('"', "'"), mgr)
        for (dt, tm, p1, fmt, pk, title, cont, mgr, msgs) in rows)
    return '''/* 예울마루 홍보 계획 %d건 일괄 신청 — 앱 탭(로그인 상태) 콘솔에 붙여넣기
   붙여넣고 Enter → 검증 표가 뜨고 「등록할까요?」 팝업 → [확인]을 눌러야 저장된다.
   [취소]하면 아무것도 저장되지 않는다. (검증만 하고 끝내려면 ASK를 false로)
   앱 자체 함수(_validateScheduleChange · _buildRecRow · api)를 그대로 사용 = 위저드와 같은 경로. */
(async () => {
  const ASK = true;                       // false = 검증만 하고 종료(저장 안 함)

  const E = [
%s
  ];

  const miss = ['api','_buildRecRow','_validateScheduleChange','_findPerfByName','records','userRole','syncReload','password']
    .filter(n => { try { return typeof eval(n) === 'undefined'; } catch (e) { return true; } });
  if (miss.length) { console.error('앱 페이지에서 실행하세요. 없는 심볼:', miss); return; }
  if (!password)   { console.error('로그인 후 실행하세요 (password 비어 있음).'); return; }

  const status = (userRole === 'admin') ? '예정' : '신청 중';
  const ok = [], ng = [];
  E.forEach((e, i) => {
    if (!_findPerfByName(e.prog)) { ng.push({ '#': i + 1, 날짜: e.d, 사유: '프로그램 시트에서 못 찾음: ' + e.prog }); return; }
    const v = _validateScheduleChange(null, e.d, e.t, { action: 'submit', plat1: e.p1, applicant: e.mg, program: e.prog });
    if (!v.ok) { ng.push({ '#': i + 1, 날짜: e.d + ' ' + e.t, 제목: e.ti, 사유: v.reason }); return; }
    ok.push(e);
  });
  console.log('%%c[홍보계획] 검증 %%d/%%d 통과 · 실패 %%d · 진행상태=%%s',
    'font-weight:bold', ok.length, E.length, ng.length, status);
  if (ng.length) console.table(ng);
  console.table(ok.map(e => ({ 날짜: e.d, 시간: e.t, 플랫폼: e.p1, 프로그램: e.prog, 제목: e.ti, 게시: e.mg })));
  if (!ok.length) { console.warn('등록할 게 없습니다.'); return; }
  if (!ASK) { console.warn('검증만 하고 종료 — 저장 안 함.'); return; }
  const dup = records.filter(r => ok.some(e => String(r['프로그램'] || '') === e.prog && String(r['콘텐츠 제목'] || '') === e.ti)).length;
  if (!confirm('예울마루 홍보 계획 ' + ok.length + '건을 지금 등록할까요?\\n\\n'
      + '진행 상태: ' + status + '\\n'
      + (dup ? '\\u26a0 같은 프로그램·제목이 이미 ' + dup + '건 있습니다(중복 등록될 수 있음)\\n' : '')
      + '\\n[확인] = 등록  /  [취소] = 아무것도 저장 안 함')) {
    console.warn('취소됨 — 저장 안 함.'); return;
  }

  let n = 0;
  for (const e of ok) {
    const pw = {
      date: e.d, time: e.t, plat1: e.p1, plat2: e.p2, format: e.f,
      programType: (_findPerfByName(e.prog) || {}).t || 'c', program: e.prog,
      title: e.ti, applicant: e.mg, memo: '', folders: [],
      kakaoText: e.p1 === '카카오톡' ? e.bo : '', instaText: e.p1 === '인스타그램' ? e.bo : '',
      blogDirection: e.p1.indexOf('블로그') === 0 ? e.bo : '',
      b2bIntraText: '', b2bLink: '', smsBody: '', freeText: '', intent: '', customPlatform: ''
    };
    try {
      await api('POST', '/api/records', { values: _buildRecRow(pw, status, records.length + 1 + n, false) });
      n++; console.log('  ' + n + '/' + ok.length + ' \\u2713 ' + e.d + ' ' + e.t + ' [' + e.p1 + '] ' + e.ti);
    } catch (err) {
      console.error('  \\u2717 ' + e.d + ' ' + e.t + ' ' + e.ti + ' \\u2014 ' + err.message);
      console.warn('여기서 중단합니다. 앞의 ' + n + '건은 이미 등록됐습니다.'); break;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  await syncReload(n);
  console.log('%%c완료 — ' + n + '건 등록. 캘린더를 확인하세요.', 'font-weight:bold;color:#1A6B3C');
})();
''' % (len(rows), items)


def build():
    rows, bad = validate()
    byday = {}
    for (dt, tm, p1, fmt, pk, title, cont, mgr, msgs) in rows:
        byday.setdefault(dt, []).append((tm, p1, pk, title))
    for k in byday:
        byday[k].sort()

    cal = "".join(month_grid(2026, m, byday) for m in (8, 9, 10))

    trs = []
    for i, (dt, tm, p1, fmt, pk, title, cont, mgr, msgs) in enumerate(rows, 1):
        full, pid, _, _, _, g = PROG[pk]
        dd = d(dt)
        ok = '<span class="ok">통과</span>' if not msgs else '<span class="ng">%s</span>' % " · ".join(msgs)
        trs.append(
            '<tr><td class="c num">%d</td><td class="num nowrap">%s<small>(%s)</small></td>'
            '<td class="c num">%s</td><td class="c"><span class="pl" style="--pc:%s">%s</span></td>'
            '<td class="c">%s</td><td class="c">%s</td><td>%s</td><td><b>%s</b><small>%s</small></td>'
            '<td class="c">%s</td><td class="c">%s</td></tr>'
            % (i, dt[5:].replace("-", "/"), DOWK[(dd.weekday() + 1) % 7], tm,
               PLAT[p1][0], html.escape(p1), html.escape(PLAT[p1][1]), html.escape(fmt),
               html.escape(full), html.escape(title), html.escape(cont), html.escape(mgr), ok))

    js = console_script(rows)
    open("tools/scratch/apply_promo_calendar.js", "w", encoding="utf-8").write(js)

    tpl = open("tools/scratch/promo_calendar_tpl.html", encoding="utf-8").read()
    out = (tpl.replace("{{CAL}}", cal)
              .replace("{{SCRIPT}}", html.escape(js))
              .replace("{{ROWS}}", "".join(trs))
              .replace("{{N}}", str(len(rows)))
              .replace("{{BAD}}", str(bad))
              .replace("{{NKAKAO}}", str(sum(1 for r in rows if r[2] == "카카오톡")))
              .replace("{{NINSTA}}", str(sum(1 for r in rows if r[2] == "인스타그램")))
              .replace("{{NBLOG}}", str(sum(1 for r in rows if r[2] == "블로그·맘카페"))))
    open(OUT, "w", encoding="utf-8").write(out)
    print("생성: %s · 항목 %d건 · 규칙 위반 %d건" % (OUT, len(rows), bad))
    return bad


if __name__ == "__main__":
    sys.exit(1 if build() else 0)
