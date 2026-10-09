@echo off
chcp 65001 > nul
title PmheeAether Control Hub — Aetheria Online (Console Mode)
color 0b

echo ==============================================================================
echo              PMHEEAETHER CONTROL HUB - MULTI-CLIENT MANAGER v4.3
echo                      Aetheria Online Automation Suite
echo ==============================================================================
echo.

set APP_DIR=%~dp0
cd /d "%APP_DIR%"

REM ตรวจหา node.exe แบบ Portable ใน bin\ ก่อน
if exist "%APP_DIR%bin\node.exe" (
    set "NODE_CMD=%APP_DIR%bin\node.exe"
    echo [OK] ใช้งาน Portable Node.js จากโฟลเดอร์ bin
    goto START_SERVER
)

REM ตรวจหา node.exe ในเครื่อง
where node >nul 2>nul
if %errorlevel% equ 0 (
    set "NODE_CMD=node"
    echo [OK] ใช้งาน Node.js จากระบบ Windows
    goto START_SERVER
)

echo [ERROR] ไม่พบ Node.js ในเครื่อง!
echo กรุณาดาวน์โหลดและติดตั้ง Node.js จาก https://nodejs.org/ (เวอร์ชัน LTS)
echo หรือใช้ไฟล์ PelicanManager.exe
pause
exit /b 1

:START_SERVER
echo [OK] กำลังเริ่มเซิร์ฟเวอร์ PmheeAether Control Hub บน Port 3888...
echo [INFO] สามารถกดเปิดบราวเซอร์ที่: http://localhost:3888
echo [INFO] กด Ctrl + C ในหน้านี้เพื่อปิดเซิร์ฟเวอร์
echo ------------------------------------------------------------------------------

REM เปิดหน้า Web Dashboard อัตโนมัติหลังเริ่มเซิร์ฟเวอร์ 2 วินาที
start "" http://localhost:3888

cd /d "%APP_DIR%manager"
"%NODE_CMD%" server.js

pause
