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

Step 2 "Authentication setup"
# This used to delete the stored GitHub credential on EVERY run, left over from
# fixing a wrong-account problem. The effect was that every push re-authenticated
# and hijacked the default browser, which may be signed in as the wrong user.
# Credentials are now left alone unless the push actually fails on auth.

# Device-code flow for THIS repo only: if authentication is ever needed, git
# prints a short code and a URL instead of launching a browser. You then open
# it in whichever browser and profile is signed in as watermelonmedia-cdn.
cmd /c "git config --local credential.gitHubAuthModes device >nul 2>&1"
Write-Host "Using device-code sign-in, so no browser is opened automatically."
Write-Host "Existing saved credentials left in place."

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
git branch -M main
git push -u origin main 2>&1 | Tee-Object -Variable pushOutput | Out-Host
$pushCode = $LASTEXITCODE

# Only touch saved credentials when authentication is genuinely the problem.
# Clearing them pre-emptively is what forced a browser sign-in every time.
if ($pushCode -ne 0) {
    $text = ($pushOutput | Out-String)
    $looksLikeAuth =
        $text -match "Authentication failed" -or
        $text -match "could not read Username" -or
        $text -match "403" -or
        $text -match "denied to" -or
        $text -match "Permission to .* denied"

    if ($looksLikeAuth) {
        Write-Host "`nThat looks like an authentication problem." -ForegroundColor Yellow
        Write-Host "Clearing the saved GitHub credential and retrying ONCE."
        foreach ($t in @("git:https://github.com", "git:https://github.com/")) {
            cmd /c "cmdkey /delete:$t >nul 2>&1"
        }
        Write-Host "`nGit will print a short code and a github.com/login/device URL."
        Write-Host "Open that URL in the browser profile signed in as watermelonmedia-cdn." -ForegroundColor Cyan
        git push -u origin main
        $pushCode = $LASTEXITCODE
    }
}

Step 8 "Result"
if ($pushCode -eq 0) {
    Write-Host "PUSH SUCCEEDED" -ForegroundColor Green
    # Surface the account actually used, so a wrong-account push is obvious.
    $who = cmd /c "cmdkey /list:git:https://github.com 2>nul"
    $user = ($who | Select-String -Pattern "User:\s*(.+)$").Matches.Groups[1].Value
    if ($user) { Write-Host "Authenticated as: $($user.Trim())" -ForegroundColor Cyan }
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
