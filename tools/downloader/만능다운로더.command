#!/usr/bin/env bash
# ===============================================
#   만능 다운로더 v6.1 (macOS 판)
#   YT/IG/X/TT/FB/Threads - 비디오 + 이미지 + 자막
#   최고화질 자동 + 1080p 초과 가로영상은 1080p mp4 동반
#   윈도우 .bat 판(v6.1)과 화질 로직 100% 동일 · macOS 네이티브 이식
# -----------------------------------------------
#   [실행] 파인더에서 더블클릭(터미널 자동 실행) 또는
#          터미널에서:  bash 만능다운로더.command  [URL(선택)]
#   [준비] Homebrew 도구 설치(한 줄):
#            brew install yt-dlp ffmpeg gallery-dl
#   [다운로드 차단 뜰 때] 터미널에서 한 번:
#            xattr -d com.apple.quarantine "만능다운로더.command"
#   [인코딩] 이 파일은 UTF-8 · LF 로 저장(맥 터미널 기본) — CP949 아님(윈도우 판만 CP949)
# ===============================================

# ===== 설정 (필요할 때 이 부분만 수정) =====
SUBLANG="en,ko"                 # 받을 자막 언어: "en,ko" / "en" / "ko" / "all" 등
MAKE_SUBTXT=1                   # 1=srt를 타임코드 뗀 txt로도 변환, 0=srt만
LOCAL="$HOME/Downloads/yt-dlp"  # 로컬 저장 폴더
COOKIES="$HOME/Downloads/yt-dlp/cookies.txt"  # (선택) IG/X 이미지용 쿠키. 없으면 무시됨
CLOUD_OVERRIDE=""               # 구글드라이브 Shared 경로 직접 지정(비우면 자동 탐지)
# ==========================================

set +e  # 개별 명령 실패해도 계속(윈도우 판의 관대한 흐름 계승)

echo "==============================================="
echo "  만능 다운로더 v6.1 (macOS)"
echo "  YT/IG/X/TT/FB/Threads - 비디오 + 이미지 + 자막"
echo "  최고화질 자동 + 1080p 초과 가로영상은 1080p mp4 동반"
echo "  URL 인자/클립보드=첫 URL 자동 / 이후 계속 입력 (q 종료)"
echo "==============================================="
echo

# ---- 도구 자동 탐지: PATH → Homebrew(Apple실리콘/인텔) → pip user ----
_find_bin() {
  local name="$1" c
  c="$(command -v "$name" 2>/dev/null)"; [ -n "$c" ] && { echo "$c"; return; }
  for c in "/opt/homebrew/bin/$name" "/usr/local/bin/$name" "$HOME/.local/bin/$name"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
  for c in "$HOME/Library/Python/"*/bin/"$name"; do
    [ -x "$c" ] && { echo "$c"; return; }
  done
}
YTDLP="$(_find_bin yt-dlp)"
FFMPEG="$(_find_bin ffmpeg)"
GDL="$(_find_bin gallery-dl)"

if [ -z "$YTDLP" ]; then
  echo "[오류] yt-dlp 를 못 찾음. 설치하고 다시 실행해줘:"
  echo "        brew install yt-dlp ffmpeg gallery-dl"
  echo
  read -r -p "엔터를 누르면 닫힘..." _; exit 1
fi
echo "[확인] yt-dlp: $YTDLP"
FFDIR=""
if [ -n "$FFMPEG" ]; then FFDIR="$(dirname "$FFMPEG")"; echo "[확인] ffmpeg: $FFMPEG"
else echo "[경고] ffmpeg 없음 → 병합(mp4)·자막 변환 실패 가능. brew install ffmpeg"; fi
if [ -n "$GDL" ]; then echo "[확인] gallery-dl: $GDL"
else echo "[알림] gallery-dl 없음 → 이미지 다운로드 비활성. brew install gallery-dl"; fi

# 쿠키 인자(배열이라 공백 경로도 안전) — 있으면 자동 사용
CK=()
[ -f "$COOKIES" ] && { CK=(--cookies "$COOKIES"); echo "[확인] 쿠키 파일 있음 (IG/X 이미지 가능)"; }
[ ! -f "$COOKIES" ] && echo "[알림] 쿠키 파일 없음 → IG/X 이미지는 쿠키 필요"
# ffmpeg 위치 인자
FF=()
[ -n "$FFDIR" ] && FF=(--ffmpeg-location "$FFDIR")

echo "[확인] 자막 언어: $SUBLANG / txt 변환: $MAKE_SUBTXT"
mkdir -p "$LOCAL"

# ---- 클라우드(구글드라이브 Shared) 자동 탐지 ----
#   1) 모던 마운트: ~/Library/CloudStorage/GoogleDrive-<계정>/My Drive(내 드라이브)/Shared
#   2) 구형: ~/Google Drive/My Drive/Shared · ~/Google Drive/Shared
#   실존 폴더만 채택(유령 폴더 차단) · 없으면 로컬만(fail-soft)
_detect_cloud() {
  local gd md
  if [ -n "$CLOUD_OVERRIDE" ]; then [ -d "$CLOUD_OVERRIDE" ] && { echo "$CLOUD_OVERRIDE"; return; }; fi
  for gd in "$HOME/Library/CloudStorage/"GoogleDrive-*/; do
    [ -d "$gd" ] || continue
    for md in "My Drive" "내 드라이브"; do
      [ -d "$gd$md/Shared" ] && { echo "$gd$md/Shared"; return; }
    done
    for md in "My Drive" "내 드라이브"; do
      [ -d "$gd$md" ] && { echo "$gd$md/Shared"; return; }
    done
  done
  for md in "My Drive" "내 드라이브"; do
    [ -d "$HOME/Google Drive/$md/Shared" ] && { echo "$HOME/Google Drive/$md/Shared"; return; }
    [ -d "$HOME/Google Drive/$md" ] && { echo "$HOME/Google Drive/$md/Shared"; return; }
  done
  [ -d "$HOME/Google Drive" ] && { echo "$HOME/Google Drive/Shared"; return; }
}
CLOUD="$(_detect_cloud)"
DUAL=0
GD_WHY=""
if [ -z "$CLOUD" ]; then
  GD_WHY="구글드라이브 마운트 미발견 - 데스크톱 앱 실행/로그인 또는 CLOUD_OVERRIDE 지정"
  echo "[알림] 구글드라이브 Shared 미발견 → 이번엔 로컬에만 저장"
else
  mkdir -p "$CLOUD" 2>/dev/null
  if [ -d "$CLOUD" ] && ( : > "$CLOUD/_write_test.tmp" ) 2>/dev/null; then
    rm -f "$CLOUD/_write_test.tmp" 2>/dev/null
    DUAL=1
    echo "[확인] 클라우드(자동감지): $CLOUD"
    # ---- 낙오자 재송 스위프: 지난 7일 미전송분 자동 재송(파일명 앞 8자리 날짜 기준) ----
    echo "[스위프] 지난 7일 미전송분 재송 확인..."
    for i in 0 1 2 3 4 5 6 7; do
      d="$(TZ='Asia/Seoul' date -v-${i}d +%Y%m%d 2>/dev/null)"
      [ -z "$d" ] && continue
      while IFS= read -r f; do
        [ -f "$f" ] || continue
        b="$(basename "$f")"
        [ -f "$CLOUD/$b" ] || cp -f "$f" "$CLOUD/" 2>/dev/null
      done < <(find "$LOCAL" -maxdepth 1 -type f -name "${d}_*" 2>/dev/null)
    done
  else
    GD_WHY="Shared 폴더 생성/쓰기 실패"
    echo "[알림] 클라우드 쓰기 불가 → 로컬만 저장"
  fi
fi
echo "[확인] 로컬: $LOCAL"
[ "$DUAL" = "1" ] && echo "[확인] 클라우드: $CLOUD"

# ---- URL 정제: 앞 쓰레기 제거 + ttps/ttp → https/http 보정 + trim ----
_clean_url() {
  local u
  u="$(printf '%s' "$1" | tr -d '\r' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
  # 정상 스킴이 어딘가 있으면 거기부터(앞 쓰레기 제거)
  case "$u" in
    *https://*) printf '%s' "https://${u#*https://}"; return;;
    *http://*)  printf '%s' "http://${u#*http://}"; return;;
  esac
  # 없으면 ttps/ttp 오타만 보정
  case "$u" in
    *ttps://*) printf '%s' "https://${u#*ttps://}"; return;;
    *ttp://*)  printf '%s' "http://${u#*ttp://}"; return;;
  esac
  printf '%s' "$u"
}

# ---- srt → txt: 인덱스/타임코드/빈줄 제거 + 태그 제거 + 연속중복 제거 ----
_srt_to_txt() {
  awk '{
    line=$0; gsub(/\r/,"",line)
    if (line ~ /^[0-9]+$/) next
    if (line ~ /-->/) next
    gsub(/<[^>]+>/,"",line)
    sub(/^[ \t]+/,"",line); sub(/[ \t]+$/,"",line)
    if (line=="") next
    if (line==prev) next
    print line; prev=line
  }' "$1"
}

# ================= URL 1건 처리 =================
process_url() {
  local URL PLAT TS VW VH GET1080 lc
  URL="$(_clean_url "$1")"
  case "$URL" in
    https://*|http://*) ;;
    *) echo "[오류] 유효한 URL 아님: $URL"; echo "       https:// 로 시작하는 주소를 넣어줘."; return;;
  esac
  echo
  echo "-----------------------------------------------"
  echo "[URL] $URL"

  # 플랫폼 감지
  lc="$(printf '%s' "$URL" | tr 'A-Z' 'a-z')"
  PLAT="ETC"
  case "$lc" in
    *youtube.com*|*youtu.be*) PLAT="YT";;
    *instagram.com*) PLAT="IG";;
    *x.com*|*twitter.com*) PLAT="X";;
    *tiktok.com*) PLAT="TT";;
    *facebook.com*|*fb.watch*) PLAT="FB";;
    *threads.net*|*threads.com*) PLAT="TH";;
  esac
  TS="$(TZ='Asia/Seoul' date +%Y%m%d_%H%M%S)"
  echo "[감지] 플랫폼: $PLAT / 시각: $TS"
  [ "$PLAT" = "TH" ] && echo "[안내] Threads는 지원이 불안정 — 실패 가능. 일단 시도."
  [ "$PLAT" != "YT" ] && echo "[안내] 자막은 YouTube가 가장 안정적 — 그 외는 자막이 없을 수 있음."

  # ---- [1/2] yt-dlp 비디오 + 자막 ----
  echo
  echo "[1/2] yt-dlp 비디오 + 자막 시도..."

  # 최고화질 해상도 1회 선행조회(다운로드 없음 · --print=simulate)
  #   bv*/b/best = 실제 선택될 최고화질의 가로x세로 픽셀.
  #   세로>1080 AND 가로영상(가로>=세로)일 때만 최고화질 + 1080p mp4 동반.
  #   세로형(릴스·틱톡·쇼츠)/1080 이하/조회실패 = 최고화질 1개만(안전 폴백).
  VW=""; VH=""
  read -r VW VH < <("$YTDLP" --no-warnings --no-cache-dir "${CK[@]}" -f "bv*/b/best" \
      --print "%(width)s %(height)s" --playlist-items 1 "$URL" 2>/dev/null | head -1)
  GET1080=0
  if printf '%s' "$VH" | grep -Eq '^[0-9]+$' && printf '%s' "$VW" | grep -Eq '^[0-9]+$'; then
    if [ "$VH" -gt 1080 ] && [ "$VW" -ge "$VH" ]; then GET1080=1; fi
  fi
  if [ "$GET1080" = "1" ]; then
    echo "[화질] 최고화질 ${VW}x${VH} (1080p 초과 가로영상) - 최고화질 + 1080p mp4 동반 다운로드"
  else
    echo "[화질] 최고화질 1개만 다운로드 (1080p 이하 / 세로영상 / 조회불가)"
  fi

  # 최고화질 본편 + 자막(항상)
  "$YTDLP" --no-cache-dir "${FF[@]}" "${CK[@]}" --trim-filenames 120 --windows-filenames \
    -P "$LOCAL" -P "temp:${TMPDIR:-/tmp}" \
    -o "${TS}_${PLAT}_%(uploader_id)s_%(title)s.%(ext)s" \
    -o "subtitle:%(title)s/${TS}_${PLAT}_%(uploader_id)s.%(ext)s" \
    --write-subs --write-auto-subs --sub-langs "$SUBLANG" --convert-subs srt \
    -f "bv*+ba/b/best" --merge-output-format mp4 -N 4 "$URL"
  [ $? -ne 0 ] && echo "[yt-dlp] 비디오 못 받음. 이미지 게시물일 가능성."

  # 1080p mp4 동반본(최고화질이 1080p 초과 가로영상일 때만 · 자막 재다운로드 안 함)
  #   파일명 앞에 1080p_ 표식 → --trim-filenames는 뒤(제목)를 자르므로 앞표식은 안 잘림 → 본편과 충돌 없음
  if [ "$GET1080" = "1" ]; then
    echo
    echo "[1080p] 호환용 1080p mp4 동반본 다운로드..."
    "$YTDLP" --no-cache-dir "${FF[@]}" "${CK[@]}" --trim-filenames 120 --windows-filenames \
      -P "$LOCAL" -P "temp:${TMPDIR:-/tmp}" \
      -o "${TS}_${PLAT}_1080p_%(uploader_id)s_%(title)s.%(ext)s" \
      --no-write-subs --no-write-auto-subs \
      -f "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]" \
      --merge-output-format mp4 -N 4 "$URL"
    [ $? -ne 0 ] && echo "[1080p] 동반본 다운로드 실패 (본편은 정상)"
  fi

  # ---- 자막 후처리: txt 변환 + Shared 바닥 평평 복사(제목폴더명 파일명에 삽입) ----
  echo
  echo "[자막] 후처리: txt 변환=$MAKE_SUBTXT / Shared 평평 복사=$DUAL..."
  while IFS= read -r srt; do
    [ -f "$srt" ] || continue
    txt="${srt%.srt}.txt"
    if [ "$MAKE_SUBTXT" = "1" ]; then
      _srt_to_txt "$srt" > "$txt" 2>/dev/null
      [ -s "$txt" ] && echo "  [txt] $(basename "$txt")" || rm -f "$txt" 2>/dev/null
    fi
    if [ "$DUAL" = "1" ]; then
      d="$(dirname "$srt")"; base="$(basename "$srt")"
      if [ "$d" != "$LOCAL" ]; then
        fold="$(basename "$d")"; pre="${base%%.*}"; rest="${base#*.}"
        cbase="${pre}_${fold}.${rest}"
      else
        cbase="$base"
      fi
      cp -f "$srt" "$CLOUD/$cbase" 2>/dev/null
      [ -f "$txt" ] && cp -f "$txt" "$CLOUD/${cbase%.srt}.txt" 2>/dev/null
      echo "  [Shared 자막] $cbase"
    fi
  done < <(find "$LOCAL" -type f -name "${TS}_${PLAT}_*.srt" 2>/dev/null)

  # ---- [2/2] gallery-dl 이미지 ----
  echo
  if [ "$PLAT" = "YT" ]; then
    echo "[2/2] YouTube - 이미지 없음, 스킵"
  elif [ -z "$GDL" ]; then
    echo "[2/2] gallery-dl 미설치 - 스킵"
  else
    echo "[2/2] gallery-dl 이미지 시도..."
    GTEMP="$LOCAL/_gallery_temp"
    rm -rf "$GTEMP" 2>/dev/null; mkdir -p "$GTEMP"
    "$GDL" -D "$GTEMP" --filter "extension not in ('mp4','m4v','webm','mov','m3u8','mp3','m4a','ts','aac','ogg')" "${CK[@]}" "$URL"
    n=0
    while IFS= read -r f; do
      [ -f "$f" ] || continue
      mv -f "$f" "$LOCAL/${TS}_${PLAT}_gallery_$(basename "$f")" 2>/dev/null && n=$((n+1))
    done < <(find "$GTEMP" -type f 2>/dev/null)
    rm -rf "$GTEMP" 2>/dev/null
    if [ "$n" -gt 0 ]; then echo "[gallery-dl] ${n}개 이미지 받음"
    else echo "[gallery-dl] 받은 이미지 없음 (쿠키 필요/만료 가능)"; fi
  fi

  # ---- 클라우드 복사(바닥 평평: LOCAL 루트의 TS_PLAT_* 파일만 · 자막은 위에서 이미 복사) ----
  echo
  local why="$GD_WHY"
  if [ "$DUAL" = "1" ]; then
    echo "[복사] 클라우드 동기화..."
    while IFS= read -r f; do
      cp -f "$f" "$CLOUD/" 2>/dev/null || why="cp 실패(권한/용량)"
    done < <(find "$LOCAL" -maxdepth 1 -type f -name "${TS}_${PLAT}_*" 2>/dev/null)
  else
    echo "[복사] 클라우드 비활성 - 로컬만 저장"
  fi

  # ---- 끝 화면: 로컬/GDRIVE 결과 ----
  gd_cnt=0
  [ "$DUAL" = "1" ] && gd_cnt="$(find "$CLOUD" -maxdepth 1 -type f -name "${TS}_${PLAT}_*" 2>/dev/null | wc -l | tr -d ' ')"
  echo
  echo "==============================================="
  echo "  다운로드 완료"
  echo "  로컬:    $LOCAL"
  if [ "$DUAL" = "1" ] && [ -z "$why" ]; then
    echo "  GDRIVE : 전송 완료 ${gd_cnt}개 - $CLOUD"
  elif [ "$DUAL" = "1" ]; then
    echo "  GDRIVE : 전송 이상 - 도착 ${gd_cnt}개 / $why"
  else
    echo "  GDRIVE : 미전송 - $why"
  fi
  echo "==============================================="
}

# ---- 첫 URL: 인자 → 없으면 클립보드(URL일 때만) ----
ARGURL="$1"
ARGSRC="인자로 받은"
if [ -z "$ARGURL" ]; then
  clip="$(pbpaste 2>/dev/null | head -1)"
  case "$(printf '%s' "$clip" | tr 'A-Z' 'a-z')" in
    https://*|http://*|ttps://*|ttp://*) ARGURL="$clip"; ARGSRC="클립보드에서 감지한";;
  esac
fi
if [ -n "$ARGURL" ]; then
  echo
  echo "[자동] ${ARGSRC} 첫 URL 사용 (이후 계속 입력 가능)"
  process_url "$ARGURL"
fi

# ---- 이후 계속 입력(q 종료) ----
while true; do
  echo
  printf 'URL 붙여넣기 (q=종료): '
  IFS= read -r URL || break
  case "$URL" in
    q|Q) break;;
    "") continue;;
    *) process_url "$URL";;
  esac
done

echo
echo "종료합니다."
