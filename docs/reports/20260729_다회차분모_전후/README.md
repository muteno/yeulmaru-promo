# 260729 다회차 분모 전/후 실측 ([Q.09])

- `before.png` / `after.png` — 「진행 중인 프로그램」(판매 현황) 표 헤드리스 실렌더.
- `shot.mjs` — 전/후 스샷 하네스. `reg.mjs` — 분모 7경로 회귀 매트릭스.

## 재현
```
python3 - <<'PY' &   # 로컬 HTTPS(index.html 6행이 http→https 강제라 file://·http 불가)
import http.server, ssl, functools
h=functools.partial(http.server.SimpleHTTPRequestHandler, directory='.')
s=http.server.ThreadingHTTPServer(('127.0.0.1',8766),h)
c=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain('cert.pem','key.pem')
s.socket=c.wrap_socket(s.socket, server_side=True); s.serve_forever()
PY
node shot.mjs before.png    # 수정 전(git stash 상태)
node reg.mjs                # 회귀 매트릭스
```
※ 실데이터 미접촉 — `?qa=1`(실API 차단) 위에 화면용 픽스처를 `_salesState`/`PERFS`로 직주입해 렌더만 시킨다.

## 결과
| 프로그램 | 회차 | 전 | 후 |
|---|---|---|---|
| 뮤지컬 <그날들> | 3일 3회 | 99% (921/926) | **33% (921/2,778)** |
| 뮤지컬 <달 샤베트> | 3일 3회 | 100% (938/926) | **34% (938/2,778)** |
| 뮤지컬 <러커스 더 스쿨> | 3일 3회 | 15% (140/926) | **5% (140/2,778)** |
| 브런치 콘서트 III | 1일 1회 | 31% (288/926) | 31% (288/926) |
| 조재혁 피아노 리사이틀 | 1일 1회 | 10% (97/926) | 10% (97/926) |
| 다비드 바뱅 & 아드리앙 몽도 | 1일 1회 | 2% (19/926) | 2% (19/926) |
| 여수세계섬박람회 기념 음악회 | 1일 1회 | — (「113일 1회 추정」 오표기) | — (「1일 1회 추정」) |
