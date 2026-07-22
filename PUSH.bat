@echo off
REM Double-click this to commit and push the karaoke changes to GitHub.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" -Message "Add Supabase Auth with legacy fallback, duet badges on the singer display, and a two-column desktop layout"
echo.
pause
