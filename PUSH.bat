@echo off
REM Double-click this to commit and push the karaoke changes to GitHub.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" -Message "Add stage and spotlight visual language across singer and host views"
echo.
pause
