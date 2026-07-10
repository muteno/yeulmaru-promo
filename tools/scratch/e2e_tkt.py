#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""의뢰서 생성기 E2E — index.html의 실제 _tkt 코드를 추출해 크로미움에서 실행,
새 템플릿(reference/ticketlink_template.xlsm)으로 생성한 산출물을 전수 검증."""
import base64, http.server, json, os, re, socketserver, threading, zipfile, io, subprocess, sys

REPO = '/home/user/yeulmaru-promo'
SCRATCH = os.path.dirname(os.path.abspath(__file__))

# ── 1) index.html에서 _tkt 코드 슬라이스 (상수부터 _tktBuild 끝까지 — 브레이스 매칭) ──
src = open(os.path.join(REPO, 'index.html'), encoding='utf-8').read()
start = src.index('var _TKT_TEMPLATE_URL')
bstart = src.index('function _tktBuild()')
i = src.index('{', bstart)
depth = 0
while True:
    c = src[i]
    if c == '{': depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0: break
    i += 1
tkt_js = src[start:i + 1]
assert '_tktCellRepl' in tkt_js and 'generateAsync' in tkt_js
print(f'슬라이스: {len(tkt_js)} chars')

# ── 2) JSZip 로컬 확보 ──
jszip_path = os.path.join(SCRATCH, 'jszip.min.js')
if not os.path.exists(jszip_path):
    subprocess.run(['curl', '-sS', '-o', jszip_path,
                    'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'], check=True)
assert os.path.getsize(jszip_path) > 50000

# ── 3) 하네스 페이지 (레포 루트에 임시 생성 — 커밋 금지·종료 시 삭제) ──
harness = os.path.join(REPO, '_e2e_tkt.html')
open(harness, 'w', encoding='utf-8').write(
    '<!DOCTYPE html><meta charset="utf-8"><body><script src="_e2e_jszip.js"></script>\n'
    '<script>\n'
    'window.__toasts=[];window.__blob=null;\n'
    'function showToast(m,t){window.__toasts.push([t,m]);}\n'
    'function _btnBusy(){}\n'
    'function yymmddName(){return "260710";}\n'
    'var _ocu=URL.createObjectURL.bind(URL);\n'
    'URL.createObjectURL=function(b){window.__blob=b;return _ocu(b);};\n'
    'HTMLAnchorElement.prototype.click=function(){};\n'
    '</script>\n'
    '<script src="_e2e_tkt_slice.js"></script>\n'
    '<script>\n'
    'window.__gen=function(state){\n'
    '  return new Promise(function(res,rej){\n'
    '    _tktState=Object.assign(_tktDefaultState(),{});\n'
    '    Object.assign(_tktState.f,state.f);\n'
    '    if(state.seats)state.seats.forEach(function(s,i){Object.assign(_tktState.seats[i],s);});\n'
    '    window.__blob=null;window.__toasts=[];\n'
    '    _tktBuild();\n'
    '    var t0=Date.now();\n'
    '    (function poll(){\n'
    '      if(window.__blob){var fr=new FileReader();fr.onload=function(){res({b64:fr.result.split(",")[1],toasts:window.__toasts});};fr.readAsDataURL(window.__blob);return;}\n'
    '      if(window.__toasts.some(function(t){return t[0]==="error";}))return rej(new Error(JSON.stringify(window.__toasts)));\n'
    '      if(Date.now()-t0>20000)return rej(new Error("timeout"));\n'
    '      setTimeout(poll,100);\n'
    '    })();\n'
    '  });\n'
    '};\n'
    '</script>')
open(os.path.join(REPO, '_e2e_jszip.js'), 'wb').write(open(jszip_path, 'rb').read())
open(os.path.join(REPO, '_e2e_tkt_slice.js'), 'w', encoding='utf-8').write(tkt_js)

# ── 4) 로컬 서버 + 크로미움 실행 ──
os.chdir(REPO)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), Q)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

CASES = {
    'perf': {'f': {'제목': '브런치 콘서트 Ⅳ', '부제목': '가을의 문턱', '기간': '2026년 10월 8일(목)',
                   '시간': '11:00', '장소': 'GS칼텍스 예울마루 소극장', '구분': '공연',
                   '관람연령': '8세 이상', '러닝타임': '약 80분', '인터미션': '15분',
                   '장르': '클래식/무용', '부가장르': '해당없음', '검색키워드': '브런치, 클래식',
                   '할인정보': '10%_예울마루회원(1인2매)_web\n20%_20인이상_전화', '출연': '피아니스트 아무개',
                   '후원': '여수시', '공연내용': '가을 아침을 여는 클래식.\n두 번째 줄.',
                   '오픈일시': '2026-08-01T14:00', '공지노출': '2026-07-20T10:00',
                   '마감일시': '2026-10-07T17:00', '선오픈': '', '가격요약': 'R석 2만원',
                   '담당자명': '홍길동', '담당자휴대폰': '010-1111-2222', '담당자이메일': 'hong@example.com',
                   '세금담당자명': '', '세금휴대폰': '', '세금이메일': '',
                   '티켓링크ID': 'testid@example.com', '티켓링크이름': '홍길동(GS칼텍스 예울마루)', '티켓링크연락처': '010-3333-4444'},
             'seats': [{'등급': 'R', '권종': '일반', '정가': '20,000', '석수': '300', '비고': ''},
                       {'등급': 'R', '권종': '휠체어', '정가': '20000', '석수': '12', '비고': '고정'}]},
    'exhib': {'f': {'제목': '섬냥이 특별전', '기간': '2026.11.1~11.30', '시간': '10:00~18:00',
                    '장소': 'GS칼텍스 예울마루 7층 전시실', '구분': '전시', '장르': '전시/축제',
                    '오픈일시': '2026-10-01T10:00', '가격요약': '전석 5천원'}},
}

from playwright.sync_api import sync_playwright
out = {}
try:  # 하네스 임시파일은 크래시에도 반드시 정리(레포 오염 방지 — 감사5 L3)
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:
            browser = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/_e2e_tkt.html')
        for name, case in CASES.items():
            r = page.evaluate('(c)=>window.__gen(c)', case)
            out[name] = base64.b64decode(r['b64'])
            print(f"[{name}] 생성 {len(out[name])}B toasts={r['toasts']}")
        browser.close()
finally:
    for f in ('_e2e_tkt.html', '_e2e_jszip.js', '_e2e_tkt_slice.js'):
        fp = os.path.join(REPO, f)
        if os.path.exists(fp):
            os.remove(fp)
    httpd.shutdown()
assert not errors, f'PAGEERROR: {errors}'

# ── 5) 산출물 검증 ──
def cell(xml, ref, sst=None):
    m = re.search(rf'<c r="{ref}"([^>]*?)(?:/>|>([\s\S]*?)</c>)', xml)
    assert m, f'셀 없음 {ref}'
    attrs, body = m.group(1) or '', m.group(2) or ''
    t = re.search(r'<(?:t|v)[^>]*>([\s\S]*?)</(?:t|v)>', body)
    val = (t.group(1) if t else '')
    if 't="s"' in attrs and sst is not None and val != '':
        val = sst[int(val)]
    return val.replace('&amp;', '&').replace('&#10;', '\n')

def check(name, data, exp):
    z = zipfile.ZipFile(io.BytesIO(data))
    sst = [re.sub(r'<[^>]+>', '', s) for s in
           re.findall(r'<si>([\s\S]*?)</si>', z.read('xl/sharedStrings.xml').decode())]
    s1 = z.read('xl/worksheets/sheet2.xml').decode()
    s2 = z.read('xl/worksheets/sheet3.xml').decode()
    v1 = z.read('xl/drawings/vmlDrawing1.vml').decode()
    v2 = z.read('xl/drawings/vmlDrawing2.vml').decode()
    wb = z.read('xl/workbook.xml').decode()
    fails = []
    def eq(what, got, want):
        if got != want: fails.append(f'{what}: {got!r} ≠ {want!r}')
    def has(what, hay, needle, want=True):
        if (needle in hay) != want: fails.append(f'{what}: {needle!r} {"없음" if want else "잔존"}')
    for ref, want in exp['cells1'].items(): eq(f's1!{ref}', cell(s1, ref, sst), want)
    for ref, want in exp['cells2'].items(): eq(f's2!{ref}', cell(s2, ref, sst), want)
    # 드롭다운 Sel
    m = re.search(r'\$AK\$2:\$AK\$10</x:FmlaRange>(?:(?!</x:ClientData>)[\s\S])*?<x:Sel>(\d+)</x:Sel>', v1)
    eq('장르 Sel', m.group(1), str(exp['gsel']))
    has('ctrlProp9', z.read('xl/ctrlProps/ctrlProp9.xml').decode(), f'sel="{exp["gsel"]}"')
    # 체크박스 상태
    for label, want in exp['checks'].items():
        mm = [s for s in re.findall(r'<v:shape id="[^"]+"[\s\S]*?</v:shape>', v2)
              if ''.join(re.findall(r'<font[^>]*>([^<]*)</font>', s)).replace('&amp;', '&').replace(' ', '') == label]
        assert len(mm) == 1, f'{label} 매칭 {len(mm)}'
        eq(f'☑{label}', '<x:Checked>1</x:Checked>' in mm[0], want)
    has('fullCalcOnLoad', wb, 'fullCalcOnLoad')
    has('공지문 잔재수식(AG15)', s2, "!BD6", False)
    has('D12/D13 잔재 가격수식', s2, '!R24', False)  # 좌석 2·3행 참조 수식 = 「0원」 오출력원(감사4 HIGH)
    has('Claude Log 시트 부재', json.dumps(z.namelist()), 'sheet1.xml', False)  # 감사5 B1
    # VBA·구시트 무결
    has('vbaProject', json.dumps(z.namelist()), 'xl/vbaProject.bin')
    has('구 sheet5 없음', json.dumps(z.namelist()), 'sheet5.xml', False)
    z.close()
    print(f'[{name}] ' + ('전부 통과 ✓' if not fails else 'FAIL:\n  ' + '\n  '.join(fails)))
    return not fails

ok = True
ok &= check('perf', out['perf'], {
    'cells1': {'G4': '브런치 콘서트 Ⅳ', 'G5': '가을의 문턱', 'G8': 'GS칼텍스 예울마루 소극장',
               'AH8': '공연', 'G9': '클래식/무용', 'AA6': '8세', 'AB7': '약 80', 'AA8': '15',
               'G21': '브런치, 클래식', 'E33': '   ▣ 출연 : 피아니스트 아무개', 'E36': '   ▣ 후원 : 여수시',
               'AA14': '2026년 8월 1일 토요일 14시', 'AA15': '2026년 10월 7일 수요일 17시',
               'E39': '홍길동', 'AA39': 'hong@example.com', 'E54': 'testid@example.com',
               'E23': 'R', 'J23': '일반', 'R23': '20000', 'Y23': '300', 'J24': '휠체어', 'AA24': '고정'},
    'cells2': {'I6': '해당 없음', 'W6': '2026. 8. 1. (토) 14:00', 'L8': '2026년 10월 8일(목)',
               'L9': '11:00', 'L10': 'GS칼텍스 예울마루 소극장', 'L11': 'R석 2만원',
               'D22': '가을 아침을 여는 클래식.\n두 번째 줄.',
               'D3': '브런치 콘서트 Ⅳ : 가을의 문턱', 'D20': '   ◎ 협찬 : 여수시',
               'D12': '', 'D13': ''},
    'gsel': 5,
    'checks': {'클래식/무용': True, '뮤지컬': False, '전시/축제': False, '즉시': False, '일시선택': True}})
ok &= check('exhib', out['exhib'], {
    'cells1': {'G4': '섬냥이 특별전', 'AH8': '전시', 'G8': 'GS칼텍스 예울마루 7층 전시실', 'G9': '전시/축제',
               'O39': '사무실: 061-808-7003\n휴대폰: ', 'E39': '강명희'},
    'cells2': {'L10': 'GS칼텍스 예울마루 7층 전시실', 'L11': '전석 5천원', 'I6': '해당 없음',
               'D12': '', 'D13': ''},
    'gsel': 7,
    'checks': {'전시/축제': True, '클래식/무용': False, '즉시': True, '일시선택': False}})

open(os.path.join(SCRATCH, 'e2e_perf.xlsm'), 'wb').write(out['perf'])
sys.exit(0 if ok else 1)
