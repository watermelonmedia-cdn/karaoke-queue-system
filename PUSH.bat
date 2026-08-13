@echo off
REM Double-click this to commit and push the karaoke changes to GitHub.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" -Message "Remove event start times and fix the timezone shift; add set list and name-clash detection"
echo.
pause
