@echo off
chcp 949 >nul
setlocal enabledelayedexpansion

REM === 인자 모드 (v5.1): 단축키 등으로 URL을 넘기면 그 URL을 첫 입력으로 자동 처리 ===
REM     처리 후 종료하지 않고 계속 다음 URL 입력 대기 (q로 종료)
REM === v5.3: [자동] 괄호 이스케이프(파서 픽스) + CP949 저장(깨진문자 커맨드 픽스) + 자막=영상제목 폴더 ===
REM === v5.5: ESC 2번 = 창 닫기 (안정판: 키 감지는 단일키 게이트만, URL 입력은 원본 set /p 유지) ===
REM === v5.6: 구글드라이브 자동 탐지(아무 드라이브 문자/한·영 UI/폴더·미러 마운트) - 계정 무관 Shared 복사 ===
REM === v5.7: 라이브 마운트 우선+앱 구동 체크(잔재 폴더 오탐 픽스) + 자막 Shared 바닥 평평 복사 ===
REM === v5.8: 끝 화면에 GDRIVE 전송 결과 상시 표시(도착 개수 실측 / 미전송 사유) ===
REM === v5.9: 클라우드 경로 고정 - 유저프로필\Google Drive 스트리밍\내 드라이브\Shared (자동탐지 폐기 · Q226) ===
REM === v5.9.1: 스트리밍 폴더 실존 게이트(유령 로컬 폴더 차단) + 끝화면 robocopy 실패 오보 봉합 - 오퍼스 3인 검증 반영 ===
REM === v5.9.2: 낙오자 재송 스위프 - 시작 시 지난 7일 미전송분 자동 재송(날짜 = 파일명 앞 8자리 · 아이데이션 Q229 반영) ===
REM === v5.9.3: 클라우드 = G:\내 드라이브\Shared 문자 마운트 고정(스트리밍 폴더 경로 폐기 · 운영자 260721) ===
REM === v6.0: 클라우드 = 드라이브 문자 자동 감지 복원(계정 동일 · G:/I: 등 문자 가변 PC 대응 - 볼륨 라벨 우선 + 문자 스캔 폴백 · 운영자 260723) ===
REM === v6.1: 최고화질 강제 + 최고화질이 1080p 초과(가로영상)면 최고화질 + 1080p mp4 동반본 다운로드 · 화질 1회 선행조회 · 쿠키 인자 통합(운영자 260723) ===
REM === 주의: 이 파일은 CP949/ANSI로만 저장할 것 - UTF-8 재저장 시 한글 고정경로가 깨져 유령 폴더 생성 ===
set "ARGURL=%~1"

echo ===============================================
echo   만능 다운로더 v6.1
echo   YT/IG/X/TT/FB/Threads - 비디오 + 이미지 + 자막
echo   최고화질 자동 + 1080p 초과 가로영상은 1080p mp4 동반
echo   인자/클립보드=첫 URL 자동 / 이후 계속 입력 가능 (q 종료)
echo   ESC 2번 연속 = 창 닫기
echo ===============================================
echo.

REM === 클립보드 모드 (v5.2): 인자 없이 실행하면(더블클릭·단축키 등) 클립보드가 URL일 때 첫 입력으로 자동 사용 ===
set "ARGSRC=인자로 받은"
if defined ARGURL goto argsrc_done
for /f "usebackq delims=" %%a in (`powershell -noprofile -c "$l=@(Get-Clipboard -ErrorAction SilentlyContinue)[0]; if($l){$l=$l.Trim(); $t=$l.ToLower(); foreach($p in 'https://','http://','ttps://','ttp://'){ if($t.StartsWith($p)){ Write-Output $l; break } } }"`) do set "ARGURL=%%a"
if defined ARGURL set "ARGSRC=클립보드에서 감지한"
:argsrc_done

REM === 경로 설정 ===
set "YTDLP=%OneDriveCommercial%\황세웅\6.  Nomute\창고\05. Utility\yt-dlp"
set "GDL=%YTDLP%\gallery-dl.exe"
set "COOKIES=%YTDLP%\cookies.txt"
REM === 클라우드 저장 = 드라이브 문자 자동 감지 (v6.0 · 운영자 260723) - 문자:\내 드라이브\Shared ===
REM     PC마다 마운트 문자가 G:/I: 등 달라도(구글 계정 동일) 같은 '내 드라이브\Shared'를 찾아 복사
REM     감지 = 아래 [검증] 단계에서 1)Google Drive 볼륨 라벨 문자 2)문자 전수 스캔(Shared 있는 마운트 우선) 순
REM     GDFS_ON(앱 실행 체크)은 유지: 앱 꺼짐 시 로컬만(죽은 잔재 폴더 오탐 방지 · v5.7 계승)
set "GDFS_ON=0"
tasklist /fi "imagename eq GoogleDriveFS.exe" 2>nul | find /i "GoogleDriveFS.exe" >nul && set "GDFS_ON=1"
REM 클라우드 경로 = 아래 [검증]에서 자동 감지로 확정 (미감지 = 이번 실행 로컬만)
set "CLOUD="
set "LOCAL=%USERPROFILE%\Downloads\yt-dlp"
set "GTEMP=%LOCAL%\_gallery_temp"

REM === 자막 설정 (v4.9) ===
REM   SUBLANG    : 받을 자막 언어. "en,ko" / "en" / "ko" / "all" 등. -로 제외 가능("all,-live_chat")
REM   MAKE_SUBTXT: 1=srt를 타임코드 제거한 txt로도 변환, 0=srt만 유지
set "SUBLANG=en,ko"
set "MAKE_SUBTXT=1"

REM === OneDriveCommercial 환경변수 체크 (v4.8) ===
if "%OneDriveCommercial%"=="" (
    echo [오류] OneDriveCommercial 환경변수 없음.
    echo        OneDrive 회사/학교 계정 동기화 상태 확인.
    pause
    goto end
)

REM === yt-dlp 체크 ===
if not exist "%YTDLP%\yt-dlp.exe" (
    echo [오류] yt-dlp.exe 없음. OneDrive 동기화 확인.
    pause
    goto end
)

REM === ffmpeg 체크 (v4.8) ===
if not exist "%YTDLP%\ffmpeg.exe" (
    echo [경고] ffmpeg.exe 없음. 영상 병합^(mp4^) 및 자막 srt 변환이 실패할 수 있음.
)

REM === gallery-dl 체크 ===
set "HAS_GDL=0"
if exist "%GDL%" set "HAS_GDL=1"
if "!HAS_GDL!"=="1" echo [확인] gallery-dl 사용 가능
if "!HAS_GDL!"=="0" echo [경고] gallery-dl.exe 없음. 이미지 다운로드 비활성화.

REM === 쿠키 파일 체크 ===
set "HAS_COOKIES=0"
if exist "%COOKIES%" set "HAS_COOKIES=1"
if "!HAS_COOKIES!"=="1" echo [확인] 쿠키 파일 있음 (IG/X 이미지 가능)
if "!HAS_COOKIES!"=="0" echo [알림] 쿠키 파일 없음. IG/X 이미지는 쿠키 필요.

REM === 자막 설정 표시 (v4.9) ===
echo [확인] 자막 언어: !SUBLANG! / txt 변환: !MAKE_SUBTXT!

REM === 로컬 폴더 ===
if not exist "%LOCAL%" mkdir "%LOCAL%"

REM === 클라우드 사전 검증 ===
echo.
echo [검증] 클라우드 쓰기 테스트...
set "DUAL=0"
set "GD_WHY="
if "%GDFS_ON%"=="0" (
    echo [알림] 구글드라이브 앱이 실행 중이 아님 - 미설치/꺼짐/로그인 전
    echo        앱 켜고 로그인하면 클라우드 복사 활성화. 이번엔 로컬에만 저장
    set "GD_WHY=드라이브 앱 꺼짐/미로그인 - 시작메뉴에서 Google Drive 실행"
    goto cloud_done
)
REM v6.0: 드라이브 문자 자동 감지 - 계정 동일 전제, 마운트 문자(G:/I: 등)는 PC마다 달라도 됨
REM       1순위 = Google Drive 볼륨 라벨의 문자(앱이 어디 마운트했든 정확) · 2순위 = 문자 전수 스캔(C: 제외)
REM       각 단계 = Shared 이미 있는 마운트 우선(오탐 최소화) · 한/영 로케일(내 드라이브/My Drive) 모두 지원
REM       실존 폴더만 채택 = 유령 로컬 폴더 차단(v5.9.1 계승) · Shared 생성은 감지된 마운트 안에서만
set "GLET="
for /f "usebackq delims=" %%a in (`powershell -noprofile -c "foreach($d in [IO.DriveInfo]::GetDrives()){ try{ if($d.IsReady -and $d.VolumeLabel -like 'Google Drive*'){ $d.Name.Substring(0,1); break } }catch{} }"`) do set "GLET=%%a"
set "GROOT="
for %%d in (!GLET! G H I J K L M N O P Q R S T U V W X Y Z D E F) do if not defined GROOT if exist "%%d:\내 드라이브\Shared\" set "GROOT=%%d:\내 드라이브"
for %%d in (!GLET! G H I J K L M N O P Q R S T U V W X Y Z D E F) do if not defined GROOT if exist "%%d:\My Drive\Shared\" set "GROOT=%%d:\My Drive"
for %%d in (!GLET! G H I J K L M N O P Q R S T U V W X Y Z D E F) do if not defined GROOT if exist "%%d:\내 드라이브\" set "GROOT=%%d:\내 드라이브"
for %%d in (!GLET! G H I J K L M N O P Q R S T U V W X Y Z D E F) do if not defined GROOT if exist "%%d:\My Drive\" set "GROOT=%%d:\My Drive"
if not defined GROOT (
    echo [알림] 어느 드라이브에서도 '내 드라이브' 마운트를 못 찾음. 이번엔 로컬에만 저장
    set "GD_WHY=내 드라이브 마운트 미발견 - 드라이브 앱 설정에서 문자 마운트 확인"
    goto cloud_done
)
set "CLOUD=!GROOT!\Shared"
echo [확인] 클라우드(자동감지): !CLOUD!
set "GD_WHY=Shared 폴더 생성/쓰기 실패"
if not exist "%CLOUD%" mkdir "%CLOUD%" 2>nul
if not exist "%CLOUD%" goto cloud_done
echo test_%RANDOM% > "%CLOUD%\_write_test.tmp" 2>nul
if not exist "%CLOUD%\_write_test.tmp" goto cloud_done
del "%CLOUD%\_write_test.tmp" >nul 2>&1
set "DUAL=1"
set "GD_WHY="
echo [확인] 클라우드 쓰기 가능
REM v5.9.2: 낙오자 재송 스위프 - 지난 실행에서 클라우드에 못 간 파일(앱 꺼짐·robocopy 실패) 자동 재송
REM         날짜 필터 = 파일명 TS 앞 8자리. mtime /MAXAGE 금지 - yt-dlp가 mtime을 영상 업로드일로 바꿔 최신 파일도 옛날로 보임
REM         동명·동크기·동시각 = robocopy 자동 스킵(이미 간 파일 재복사 0) · 자막 제목폴더 = 무 /S라 비대상 · PS 실패 시 = 스위프 건너뜀
set "SWEEP_PATS="
for /f "usebackq delims=" %%d in (`powershell -noprofile -c "foreach($i in 0..7){ (Get-Date).AddDays(-$i).ToString('yyyyMMdd')+'_*' }"`) do set "SWEEP_PATS=!SWEEP_PATS! %%d"
if defined SWEEP_PATS echo [스위프] 지난 7일 미전송분 재송 확인...
if defined SWEEP_PATS robocopy "%LOCAL%" "%CLOUD%" !SWEEP_PATS! /R:2 /W:2 /NJH /NJS /NDL /NC /NS /NP

:cloud_done
echo [확인] 로컬: %LOCAL%
if "!DUAL!"=="1" echo [확인] 클라우드: %CLOUD%
cd /d "%LOCAL%"

:loop
echo.
echo -----------------------------------------------
REM === v5.2: 인자/클립보드로 URL 받았으면 그걸 첫 입력으로, 아니면 직접 입력 ===
if defined ARGURL (
    set "URL=!ARGURL!"
    set "ARGURL="
    echo [자동] !ARGSRC! 첫 URL 사용 ^(이후 계속 입력 가능^)
    goto url_have
)
REM === v5.5: 단일키 게이트 - ESC 2번=창닫기 / Q=종료 / 그 외 아무 키=URL 입력 ===
REM     powershell 실행 실패 시(errorlevel 9009 등) 그냥 URL 입력으로 진행됨 = 안전
echo [아무 키 = URL 입력 / Q = 종료 / ESC 2번 = 창 닫기]
powershell -noprofile -c "$e=0;while($true){$k=[Console]::ReadKey($true);if($k.Key -eq 'Escape'){$e=$e+1;if($e -ge 2){exit 27}}elseif($k.KeyChar -eq 'q' -or $k.KeyChar -eq 'Q'){exit 113}else{exit 0}}"
if !errorlevel! equ 27 goto esc_exit
if !errorlevel! equ 113 goto end
set "URL="
set /p URL=URL 붙여넣기 ^(q=종료^):

:url_have
if /i "!URL!"=="q" goto end
if "!URL!"=="" goto loop

REM ===================================================
REM  URL 자동 정제 v4.7+
REM  - 앞에 붙은 쓰레기 텍스트 제거
REM  - ttps:// ttp:// -^> https:// http:// 보정
REM  - 유효성 검증
REM ===================================================

REM --- 원본 백업 (PowerShell 실패 대비) ---
set "URL_BACKUP=!URL!"

REM --- 쓰레기 제거 + scheme 보정 (PowerShell 한 줄) ---
for /f "usebackq delims=" %%a in (`powershell -noprofile -c "$u='!URL!'; foreach($p in 'https://','http://','ttps://','ttp://'){$i=$u.IndexOf($p); if($i -ge 0){$u=$u.Substring($i); break}}; if($u.StartsWith('ttps://')){$u='h'+$u}elseif($u.StartsWith('ttp://')){$u='h'+$u}; Write-Output $u.Trim()"`) do set "URL=%%a"

REM --- PowerShell 실패 시 원본 복원 ---
if "!URL!"=="" set "URL=!URL_BACKUP!"

REM --- ttps/ttp 이중 안전장치 (PowerShell 우회 시 대비) ---
if /i "!URL:~0,7!"=="ttps://" set "URL=h!URL!"
if /i "!URL:~0,6!"=="ttp://" set "URL=h!URL!"

REM --- 유효성 검증 ---
set "URL_VALID=0"
if /i "!URL:~0,8!"=="https://" set "URL_VALID=1"
if /i "!URL:~0,7!"=="http://" set "URL_VALID=1"
if "!URL_VALID!"=="0" (
    echo.
    echo [오류] 유효한 URL이 아님: !URL!
    echo        https:// 로 시작하는 URL을 붙여넣어줘.
    echo.
    goto loop
)

REM --- 정제 완료 ---
echo [URL] !URL!

REM ===================================================

REM 플랫폼 감지
set "PLAT=ETC"
echo "!URL!" | find /i "youtube.com" >nul && set "PLAT=YT"
echo "!URL!" | find /i "youtu.be" >nul && set "PLAT=YT"
echo "!URL!" | find /i "instagram.com" >nul && set "PLAT=IG"
echo "!URL!" | find /i "x.com" >nul && set "PLAT=X"
echo "!URL!" | find /i "twitter.com" >nul && set "PLAT=X"
echo "!URL!" | find /i "tiktok.com" >nul && set "PLAT=TT"
echo "!URL!" | find /i "facebook.com" >nul && set "PLAT=FB"
echo "!URL!" | find /i "fb.watch" >nul && set "PLAT=FB"
echo "!URL!" | find /i "threads.net" >nul && set "PLAT=TH"
echo "!URL!" | find /i "threads.com" >nul && set "PLAT=TH"

for /f %%i in ('powershell -noprofile -c "Get-Date -Format 'yyyyMMdd_HHmmss'"') do set "TS=%%i"
echo [감지] 플랫폼: !PLAT! / 시각: !TS!

REM === Threads 안내 (v4.8) ===
if "!PLAT!"=="TH" (
    echo [안내] Threads는 yt-dlp/gallery-dl 공식 지원이 불안정합니다.
    echo        다운로드 실패 가능성이 높습니다. 일단 시도합니다.
)

REM === 자막 안내 (v4.9) ===
if not "!PLAT!"=="YT" (
    echo [안내] 자막 추출은 YouTube에서 가장 안정적입니다.
    echo        IG/X/TT/FB/Threads는 자막 트랙이 드물어 .srt/.txt가 안 생길 수 있습니다.
)

REM === [1/2] yt-dlp 비디오 + 자막 시도 (v6.1: 최고화질 강제 + 1080p 동반) ===
echo.
echo [1/2] yt-dlp 비디오 + 자막 시도...

REM --- 쿠키 인자 통합(쿠키 유무로 커맨드 2벌 복제하던 것을 변수 1개로) ---
set "CK="
if "!HAS_COOKIES!"=="1" set "CK=--cookies "%COOKIES%""

REM --- 최고화질 해상도 1회 선행조회(다운로드 없이 메타데이터만 · --print = simulate) ---
REM     bv*/b/best = 실제로 선택될 최고화질 영상의 가로x세로 픽셀을 미리 읽음.
REM     세로 1080 초과 + 가로영상(가로>=세로)일 때만 = 최고화질 + 1080p mp4 동반본.
REM     세로형(릴스·틱톡·쇼츠) / 1080 이하 / 조회 실패 = 최고화질 1개만(안전 폴백).
set "VW="
set "VH="
for /f "usebackq tokens=1,2 delims= " %%a in (`"%YTDLP%\yt-dlp.exe" --no-warnings --no-cache-dir !CK! -f "bv*/b/best" --print "%%(width)s %%(height)s" --playlist-items 1 "!URL!" 2^>nul`) do (
    set "VW=%%a"
    set "VH=%%b"
)
set "GET1080=0"
echo !VH!| findstr /r "^[0-9][0-9]*$" >nul && echo !VW!| findstr /r "^[0-9][0-9]*$" >nul && if !VH! gtr 1080 if !VW! geq !VH! set "GET1080=1"
if "!GET1080!"=="1" echo [화질] 최고화질 !VW!x!VH! ^(1080p 초과 가로영상^) - 최고화질 + 1080p mp4 동반 다운로드
if "!GET1080!"=="0" echo [화질] 최고화질 1개만 다운로드 ^(1080p 이하 / 세로영상 / 조회불가^)

REM --- 최고화질 본편 + 자막(항상 실행) ---
"%YTDLP%\yt-dlp.exe" --no-cache-dir --ffmpeg-location "%YTDLP%" !CK! --trim-filenames 120 --windows-filenames -P "%LOCAL%" -P "temp:%TEMP%" -o "!TS!_!PLAT!_%%(uploader_id)s_%%(title)s.%%(ext)s" -o "subtitle:%%(title)s/!TS!_!PLAT!_%%(uploader_id)s.%%(ext)s" --write-subs --write-auto-subs --sub-langs "!SUBLANG!" --convert-subs srt -f "bv*+ba/b/best" --merge-output-format mp4 -N 4 "!URL!"
set "YT_RC=!errorlevel!"
if !YT_RC! neq 0 echo [yt-dlp] 비디오 못 받음. 이미지 게시물일 가능성.

REM --- 1080p mp4 동반본(최고화질이 1080p 초과 가로영상일 때만 · 자막 재다운로드 안 함) ---
REM     파일명 표식 '1080p_'을 앞쪽에 둠 = --trim-filenames 120은 뒤(제목)를 자르므로 앞표식은 안 잘림 → 본편과 충돌 없음.
REM     포맷 = 1080 이하 mp4 우선(h264 mp4 = 어디서나 재생) → 없으면 1080 이하 최선.
if "!GET1080!"=="1" (
    echo.
    echo [1080p] 호환용 1080p mp4 동반본 다운로드...
    "%YTDLP%\yt-dlp.exe" --no-cache-dir --ffmpeg-location "%YTDLP%" !CK! --trim-filenames 120 --windows-filenames -P "%LOCAL%" -P "temp:%TEMP%" -o "!TS!_!PLAT!_1080p_%%(uploader_id)s_%%(title)s.%%(ext)s" --no-write-subs --no-write-auto-subs -f "bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080][ext=mp4]/bv*[height<=1080]+ba/b[height<=1080]" --merge-output-format mp4 -N 4 "!URL!"
    if errorlevel 1 echo [1080p] 동반본 다운로드 실패 ^(본편은 정상^)
)

REM === [2/2] gallery-dl 이미지 시도 ===
echo.
if "!PLAT!"=="YT" goto skip_gallery
if "!HAS_GDL!"=="0" goto skip_gallery_nogdl
goto do_gallery

:skip_gallery
echo [2/2] YouTube - 이미지 없음, 스킵
goto post_download

:skip_gallery_nogdl
echo [2/2] gallery-dl 미설치 - 스킵
goto post_download

:do_gallery
echo [2/2] gallery-dl 이미지 시도...
if exist "%GTEMP%" rmdir /s /q "%GTEMP%" 2>nul
mkdir "%GTEMP%" 2>nul

REM 쿠키 파일 있으면 사용, 없으면 쿠키 없이 시도
if "!HAS_COOKIES!"=="1" goto gdl_with_cookies
goto gdl_without_cookies

:gdl_with_cookies
"%GDL%" -D "%GTEMP%" --filter "extension not in ('mp4','m4v','webm','mov','m3u8','mp3','m4a','ts','aac','ogg')" --cookies "%COOKIES%" "!URL!"
set "GDL_RC=!errorlevel!"
goto gdl_done

:gdl_without_cookies
"%GDL%" -D "%GTEMP%" --filter "extension not in ('mp4','m4v','webm','mov','m3u8','mp3','m4a','ts','aac','ogg')" "!URL!"
set "GDL_RC=!errorlevel!"

:gdl_done
set /a GDL_CNT=0
for /r "%GTEMP%" %%f in (*) do (
    move /Y "%%f" "%LOCAL%\!TS!_!PLAT!_gallery_%%~nxf" >nul 2>&1
    if not errorlevel 1 set /a GDL_CNT+=1
)
rmdir /s /q "%GTEMP%" 2>nul
if !GDL_CNT! gtr 0 goto gallery_ok
if !GDL_RC! neq 0 goto gallery_fail
echo [gallery-dl] 받은 이미지 없음
goto post_download

:gallery_ok
echo [gallery-dl] !GDL_CNT!개 이미지 받음
goto post_download

:gallery_fail
echo [gallery-dl] 실패 (errorlevel=!GDL_RC!)
if "!HAS_COOKIES!"=="0" echo      쿠키 파일 없음. 확장프로그램으로 export 필요.
if "!HAS_COOKIES!"=="1" echo      쿠키 만료 가능성. 재export 필요.
goto post_download

:post_download
REM === 클라우드 복사 ===
echo.
if "!DUAL!"=="0" goto copy_skip
echo [복사] robocopy 동기화...
REM v5.7: /S 제거 = Shared는 바닥 평평 유지(자막은 자막 후처리가 제목 포함 이름으로 이미 바닥 복사)
robocopy "%LOCAL%" "%CLOUD%" "!TS!_!PLAT!_*.*" /R:5 /W:2 /NJH /NJS /NDL /NC /NS /NP /MT:4
set "RC_CODE=!errorlevel!"
if !RC_CODE! geq 8 goto copy_fail
if !RC_CODE! geq 1 goto copy_ok
echo [복사] 새 파일 없음
goto copy_done

:copy_ok
echo [복사] 완료 (rc=!RC_CODE!)
goto copy_done

:copy_fail
echo [복사 실패] robocopy errorlevel=!RC_CODE!
echo      로컬 파일은 안전: %LOCAL%
set "GD_WHY=robocopy 오류 rc=!RC_CODE!"
goto copy_done

:copy_skip
echo [복사] 클라우드 비활성화 - 로컬만 저장

:copy_done
set /a GD_CNT=0
if "!DUAL!"=="1" for /f %%c in ('dir /b "%CLOUD%\!TS!_!PLAT!_*" 2^>nul ^| find /c /v ""') do set "GD_CNT=%%c"
echo.
echo ===============================================
echo   다운로드 완료
echo   로컬:    %LOCAL%
if "!DUAL!"=="1" if not defined GD_WHY echo   GDRIVE : 전송 완료 !GD_CNT!개 - %CLOUD%
if "!DUAL!"=="1" if defined GD_WHY echo   GDRIVE : 전송 이상 - 도착 !GD_CNT!개 / !GD_WHY!
if "!DUAL!"=="0" echo   GDRIVE : 미전송 - !GD_WHY!
echo ===============================================
echo.
goto loop

:esc_exit
echo.
echo [ESC 2번] 창을 닫습니다.
endlocal
exit

:end
echo.
echo 종료합니다.
endlocal
pause
exit /b
