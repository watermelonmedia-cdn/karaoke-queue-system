param([string]$Message)

# Commits any pending changes and pushes them to GitHub.
# Writes a transcript to push-log.txt so failures can be diagnosed.
#
# Run:  double-click PUSH.bat

# NOTE: deliberately NOT using ErrorActionPreference='Stop'. In PowerShell 5.1
# that combined with native-command stderr redirection throws NativeCommandError,
# which is what killed the previous version of this script.
$ErrorActionPreference = "Continue"

Set-Location $PSScriptRoot
$log = Join-Path $PSScriptRoot "push-log.txt"
Start-Transcript -Path $log -Force | Out-Null

function Step($n, $msg) { Write-Host "`n=== $n. $msg ===" -ForegroundColor Cyan }

Step 1 "Environment"
Write-Host "Folder : $PSScriptRoot"
git --version
if ($LASTEXITCODE -ne 0) {
    Write-Host "git is not on PATH. Install Git for Windows, then re-run." -ForegroundColor Red
    Stop-Transcript | Out-Null
    exit 1
}

Step 2 "Clearing cached GitHub credentials"
# cmd /c swallows stderr entirely so a missing credential cannot abort the run.
foreach ($t in @("git:https://github.com", "git:https://github.com/")) {
    cmd /c "cmdkey /delete:$t >nul 2>&1"
}
Write-Host "Cached github.com credentials cleared (if any existed)."

Step 3 "Checking remote"
$expected = "https://github.com/watermelonmedia-cdn/karaoke-queue-system.git"
$current = cmd /c "git remote get-url origin 2>nul"
if ($current) { $current = $current.Trim() }
if ($current -ne $expected) {
    Write-Host "Setting origin -> $expected"
    cmd /c "git remote remove origin >nul 2>&1"
    git remote add origin $expected
} else {
    Write-Host "origin already correct."
}
git remote -v

Step 4 "Clearing stale git lock files"
# A crashed or sandboxed git process can leave .git/index.lock behind, which
# silently blocks every subsequent 'git add'. Remove locks only when no git
# process is actually running.
$gitRunning = @(Get-Process git -ErrorAction SilentlyContinue).Count
if ($gitRunning -gt 0) {
    Write-Host "A git process is running; leaving lock files alone." -ForegroundColor Yellow
} else {
    $locks = Get-ChildItem -Path (Join-Path $PSScriptRoot ".git") -Filter "*.lock" -Recurse -Force -ErrorAction SilentlyContinue
    if ($locks) {
        foreach ($l in $locks) {
            Write-Host "Removing stale lock: $($l.FullName)"
            Remove-Item -LiteralPath $l.FullName -Force -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "No stale locks found."
    }
}

Step 5 "Staging"
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "git add failed. See the error above." -ForegroundColor Red
}
$staged = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace($staged)) {
    Write-Host "Nothing new to stage."
} else {
    Write-Host "Staged files:"
    ($staged -split "`r?`n") | Where-Object { $_ } | ForEach-Object { Write-Host "   $_" }

    if ($Message) {
        $msg = $Message
    } else {
        $msg = "Update karaoke app - " + (Get-Date -Format "yyyy-MM-dd HH:mm")
    }
    Write-Host "Commit message: $msg"
    git commit -m $msg
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Commit failed. See output above." -ForegroundColor Red
    }
}

Step 6 "Commits present"
git log --oneline

Step 7 "Pushing"
Write-Host "A sign-in window may open. Use the watermelonmedia-cdn account." -ForegroundColor Yellow
git branch -M main
git push -u origin main
$pushCode = $LASTEXITCODE

Step 8 "Result"
if ($pushCode -eq 0) {
    Write-Host "PUSH SUCCEEDED" -ForegroundColor Green
    Write-Host "https://github.com/watermelonmedia-cdn/karaoke-queue-system"
    Write-Host "Vercel will start a deploy if the repo is connected."
} else {
    Write-Host "PUSH FAILED (exit $pushCode)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Most likely causes:"
    Write-Host "  - Signed in as the wrong GitHub account"
    Write-Host "  - The account lacks write access to watermelonmedia-cdn"
    Write-Host ""
    Write-Host "Send me push-log.txt from this folder and I'll read the error."
}

git status --short
Stop-Transcript | Out-Null

Write-Host "`nLog written to: $log" -ForegroundColor Cyan
