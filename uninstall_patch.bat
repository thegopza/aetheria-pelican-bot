@echo off
title Aetheria Online - Restore Original Launcher
color 0e

echo ========================================================
echo   RESTORE ORIGINAL AETHERIA ONLINE LAUNCHER
echo ========================================================
echo.

set "GAME_DIR=%LOCALAPPDATA%\Programs\Aetheria Online"
set "RES_DIR=%GAME_DIR%\resources"
set "APP_DIR=%RES_DIR%\app"

echo Closing Aetheria Online...
taskkill /f /im "Aetheria Online.exe" >nul 2>&1
timeout /t 1 /nobreak >nul

if exist "%APP_DIR%" (
    echo Removing modded app directory...
    rmdir /s /q "%APP_DIR%"
)

if exist "%RES_DIR%\app.asar.disabled" (
    echo Restoring original app.asar...
    ren "%RES_DIR%\app.asar.disabled" "app.asar" >nul 2>&1
)

echo.
echo [SUCCESS] Original game launcher restored!
echo ========================================================
echo.
pause
