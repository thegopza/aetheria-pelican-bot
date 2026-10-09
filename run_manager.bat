@echo off
title Pelican Multi-Client Hub — Aetheria Online
color 0b

echo ========================================================
echo   PELICAN MULTI-CLIENT MANAGER FOR AETHERIA ONLINE
echo ========================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

echo [1/2] Launching browser on http://localhost:3888 ...
start "" http://localhost:3888

echo [2/2] Starting Pelican Manager Server (Port 3888)...
echo Keep this window open while using the Multi-Client Manager.
echo ========================================================
echo.

:loop
node manager\server.js
echo.
echo [!] Manager server restarted.
timeout /t 1 /nobreak >nul
goto loop