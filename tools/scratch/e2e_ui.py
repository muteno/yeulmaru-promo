#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""의뢰서 모달 UI E2E — index.html의 실제 _tkt 렌더 코드를 크로미움 실DOM에서 구동.
구분↔장소 연동 select · 직접 입력 폴백 · PPT 자동값 스냅(_tktVenueSnap)을 검증(분신술 감사5 B2 영구화)."""
import http.server, os, socketserver, threading, sys

REPO = '/home/user/yeulmaru-promo'
src = open(os.path.join(REPO, 'index.html'), encoding='utf-8').read()
start = src.index('var _TKT_TEMPLATE_URL')
b = src.index('function _tktBuild()')
i = src.index('{', b); d = 0
while True:
    if src[i] == '{': d += 1
    elif src[i] == '}':
        d -= 1
        if d == 0: break
    i += 1
harness = os.path.join(REPO, '_e2e_ui.html')
open(harness, 'w', encoding='utf-8').write(
    '<!DOCTYPE html><meta charset="utf-8"><body><div id="tkt-body"></div><script>\n'
    'function escapeHtml(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");}\n'
    'function showToast(){}function _btnBusy(){}function yymmddName(){return "260710";}\n'
    '</script><script>\n' + src[start:i + 1] + '\n</script>')

os.chdir(REPO)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
httpd = socketserver.TCPServer(('127.0.0.1', 0), Q)
port = httpd.server_address[1]
threading.Thread(target=httpd.serve_forever, daemon=True).start()

try:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        try:
            browser = p.chromium.launch()
        except Exception:
            browser = p.chromium.launch(executable_path='/opt/pw-browsers/chromium-1194/chrome-linux/chrome')
        pg = browser.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/_e2e_ui.html')
        r = pg.evaluate('''()=>{
          _tktState=_tktDefaultState();_tktRender();
          var out={};
          var cat=document.querySelector('select[aria-label="구분"]'), ven=document.querySelector('select[aria-label="장소"]');
          out.cats=[...cat.options].map(o=>o.value);
          out.venues0=[...ven.options].map(o=>o.textContent);
          _tktCatIn('전시');
          out.venues1=[...document.querySelector('select[aria-label="장소"]').options].map(o=>o.textContent);
          _tktVenueIn('GS칼텍스 예울마루 장도 전시실');
          out.pick=[_tktState.f['구분'],_tktState.f['장소']];
          _tktVenueIn('__custom__');
          out.customInput=!!document.querySelector('input[placeholder*="진남문예회관"]');
          _tktIn('장소','여수 진남문예회관');
          _tktCatIn('공연');
          out.customKept=_tktState.f['장소'];
          // PPT 자동값 스냅: 「예울마루 대극장」 → 정식명+구분 동기
          _tktState=_tktDefaultState();_tktState.f['장소']='예울마루 대극장';_tktState.f['구분']='전시';
          _tktVenueSnap();_tktRender();
          out.snap=[_tktState.f['구분'],_tktState.f['장소'],_tktState._venueCustom];
          out.snapSelected=document.querySelector('select[aria-label="장소"]').value;
          // PPT 자동값이 진짜 외부 장소면 직접입력 확정 → 구분 전환에도 유지
          _tktState=_tktDefaultState();_tktState.f['장소']='순천문화예술회관';
          _tktVenueSnap();_tktRender();
          _tktCatIn('예술교육');
          out.extKept=[_tktState._venueCustom,_tktState.f['장소']];
          return out;
        }''')
        browser.close()
finally:
    if os.path.exists(harness):
        os.remove(harness)
    httpd.shutdown()

print('PAGEERROR:', errs)
print(r)
assert not errs
assert r['cats'] == ['공연', '전시', '예술교육']
assert '대극장' in ''.join(r['venues0']) and '7층 전시실' in ''.join(r['venues1'])
assert r['pick'] == ['전시', 'GS칼텍스 예울마루 장도 전시실']
assert r['customInput'] and r['customKept'] == '여수 진남문예회관'
assert r['snap'] == ['공연', 'GS칼텍스 예울마루 대극장', False]
assert r['snapSelected'] == 'GS칼텍스 예울마루 대극장'
assert r['extKept'] == [True, '순천문화예술회관']
print('UI 연동·스냅 검증 전부 통과 ✓')
