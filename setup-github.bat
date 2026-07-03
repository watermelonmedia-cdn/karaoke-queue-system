@echo off
REM Initialize git repo and connect to GitHub
cd /d "%~dp0"

echo Initializing git repository...
git init
git config user.name "Ross Karaoke"
git config user.email "docjakesimages@gmail.com"

echo.
echo Adding all files...
git add .

echo.
echo Creating initial commit...
git commit -m "Initial commit: Karaoke app with React, TypeScript, and Supabase"

echo.
echo ===============================================
echo Next steps:
echo 1. Go to GitHub: https://github.com/new
echo 2. Create a new repository named: ross-karaoke-app
echo 3. Copy the HTTPS clone URL
echo 4. Run this command in PowerShell or Command Prompt:
echo.
echo git remote add origin https://github.com/watermelonmedia-cdn/ross-karaoke-app.git
echo git branch -M main
echo git push -u origin main
echo.
echo ===============================================
pause
