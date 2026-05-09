@echo off
chcp 65001 >nul
title Amazon Collector - Public Access

echo.
echo ==============================================
echo    Amazon Collector - Public Access Launcher
echo ==============================================
echo.

:: Check local service
netstat -ano | findstr ":18888 " | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [ERROR] Local service not running!
    echo Please run in another window: node server.js
    pause
    exit /b 1
)
echo [OK] Local service is running (localhost:18888)
echo.

:: Detect tunnel method
set USE_CF=0
if exist "C:\cloudflared\cloudflared.exe" (
    :: Check if file size looks valid (should be ~60MB = 60000000 bytes)
    for %%A in ("C:\cloudflared\cloudflared.exe") do set CFSIZE=%%~zA
)
if defined CFSIZE (
    if %CFSIZE% GEQ 30000000 (
        set USE_CF=1
    )
)

if "%USE_CF%"=="1" (
    echo [Method] Cloudflare Tunnel
    echo.
    echo Waiting for tunnel URL...
    echo ==============================================
    C:\cloudflared\cloudflared.exe tunnel --url http://localhost:18888
) else (
    echo [Method] SSH Tunnel (no download needed)
    echo.
    echo If first time: press Enter when asked for password
    echo Wait 5-10 seconds for the public URL to appear
    echo ==============================================
    ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=60 -R 80:localhost:18888 nokey@localhost.run
)

echo.
echo Tunnel exited. Press any key to close...
pause >nul
