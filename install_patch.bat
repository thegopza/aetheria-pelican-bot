@echo off
title Aetheria Online - Pelican Bot Installer
color 0b

echo ========================================================
echo   PELICAN BOT AUTO-INJECTOR INSTALLER (AETHERIA EXE)
echo ========================================================
echo.

set "GAME_DIR=%LOCALAPPDATA%\Programs\Aetheria Online"
set "RES_DIR=%GAME_DIR%\resources"
set "APP_DIR=%RES_DIR%\app"

if not exist "%GAME_DIR%" (
    echo [ERROR] Game directory not found at:
    echo "%GAME_DIR%"
    echo Please make sure Aetheria Online is installed.
    echo.
    pause
    exit /b 1
)

echo [1/4] Checking running processes...
tasklist /fi "imagename eq Aetheria Online.exe" 2>nul | find /i "Aetheria Online.exe" >nul
if %errorlevel% equ 0 (
    echo [INFO] Game is running. Closing game to apply patch...
    taskkill /f /im "Aetheria Online.exe" >nul 2>&1
    timeout /t 2 /nobreak >nul
)

echo [2/4] Backing up original app.asar...
if exist "%RES_DIR%\app.asar" (
    if not exist "%RES_DIR%\app.asar.original" (
        copy /y "%RES_DIR%\app.asar" "%RES_DIR%\app.asar.original" >nul
        echo       - Created backup: app.asar.original
    )
    ren "%RES_DIR%\app.asar" "app.asar.disabled" >nul 2>&1
)

echo [3/4] Installing Pelican Launcher and Bot Payload...
if not exist "%APP_DIR%" mkdir "%APP_DIR%"

copy /y "%~dp0main.js" "%APP_DIR%\main.js" >nul
copy /y "%~dp0package.json" "%APP_DIR%\package.json" >nul
copy /y "%~dp0bot.js" "%RES_DIR%\bot.js" >nul

echo [4/4] Installation Complete!
echo ========================================================
echo   [SUCCESS] Pelican Bot installed successfully!
echo.
echo   * Launch Aetheria Online.exe normally.
echo   * Press F5 in-game anytime to reload the bot code.
echo   * Edit bot script at: %RES_DIR%\bot.js
echo ========================================================
echo.
pause
