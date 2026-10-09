@echo off
title Aetheria PmheeAether Bot - GitHub Publisher
color 0b

echo ========================================================
echo   PUBLISH AETHERIA PMHEEAETHER BOT TO GITHUB
echo ========================================================
echo.

gh auth status >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] You are not logged in to GitHub yet.
    echo Starting 1-click browser login...
    echo.
    gh auth login --web -h github.com -p https
)

echo.
echo [1/3] Preparing Git Repository...
cd /d "%~dp0"
if not exist ".git" (
    git init -b main
    git config user.name "Aetheria Player"
    git config user.email "player@aetheria.local"
    git add .
    git commit -m "feat: Initial release of Aetheria PmheeAether Bot & Auto-Injector"
) else (
    git add .
    git commit -m "update: Update bot payload and launcher"
)

echo.
echo [2/3] Publishing to GitHub...
gh repo create aetheria-pelican-bot --public --source=. --remote=origin --push 2>nul
if %errorlevel% neq 0 (
    git push -u origin main
)

echo.
echo [3/3] Generating Raw Auto-Update Link...
for /f "tokens=*" %%i in ('gh repo view --json owner -q .owner.login 2^>nul') do set "GH_USER=%%i"

if "%GH_USER%"=="" (
    echo [INFO] Repository published. Please check your GitHub profile!
) else (
    echo ========================================================
    echo   [SUCCESS] Bot published to GitHub!
    echo.
    echo   Repo: https://github.com/%GH_USER%/aetheria-pelican-bot
    echo   Raw Link: https://raw.githubusercontent.com/%GH_USER%/aetheria-pelican-bot/main/bot.js
    echo ========================================================
)
echo.
pause
