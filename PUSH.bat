@echo off
REM Double-click this to commit and push the karaoke changes to GitHub.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" -Message "Design refresh: logo palette, unified chips, icons, styled dialogs, avatars, equaliser, confetti"
echo.
pause
