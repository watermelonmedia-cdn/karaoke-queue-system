@echo off
REM Double-click this to commit and push the karaoke changes to GitHub.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1" -Message "Credit each singer in a group entry separately, remember names, and prompt on name clashes"
echo.
pause
