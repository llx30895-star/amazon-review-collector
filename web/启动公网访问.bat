@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title Amazon 评论采集器 - 公网访问
cd /d "%~dp0"

echo.
echo ========================================
echo   Amazon 评论采集器 - 公网访问启动器
echo ========================================
echo.

:: === 检查 Chrome 调试端口 ===
echo [1/3] 检查 Chrome 调试端口 (18800)...
netstat -ano | findstr ":18800 " | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo     [OK] Chrome 18800 端口就绪
) else (
    echo     [WARN] Chrome 18800 端口未开启
    echo.
    echo     请先关闭所有 Chrome 窗口，然后重新打开 Chrome：
    echo.
    echo     按 Win+R，输入以下命令回车:
    echo.
    echo     "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --remote-debugging-port=18800
    echo.
    pause
    exit /b 1
)

:: === 检查并启动本地服务 ===
echo [2/3] 检查本地服务 (18888)...
netstat -ano | findstr ":18888 " | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo     [OK] 本地服务已在运行
) else (
    echo     [INFO] 启动本地服务...
    start "Amazon采集服务" cmd /k "cd /d \"%~dp0\" && node server.js"
    timeout /t 4 /nobreak >nul
    netstat -ano | findstr ":18888 " | findstr LISTENING >nul
    if %errorlevel% equ 0 (
        echo     [OK] 本地服务启动成功
    ) else (
        echo     [ERROR] 本地服务启动失败
        echo     请确保已安装 Node.js
        pause
        exit /b 1
    )
)

:: === 检查 cloudflared ===
echo [3/3] 检查 cloudflared...
set CLOUDFLARED=
if exist "C:\cloudflared\cloudflared.exe" (
    set CLOUDFLARED=C:\cloudflared\cloudflared.exe
) else (
    :: 尝试在同目录找
    if exist "%~dp0cloudflared.exe" (
        set CLOUDFLARED=%~dp0cloudflared.exe
    )
)

if not defined CLOUDFLARED (
    echo     [INFO] 准备下载 cloudflared（约 60MB）...
    if not exist "C:\cloudflared" mkdir "C:\cloudflared"
    echo     正在下载，请稍候...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'C:\cloudflared\cloudflared.exe' -UseBasicParsing -TimeoutSec 60"
    if exist "C:\cloudflared\cloudflared.exe" (
        set CLOUDFLARED=C:\cloudflared\cloudflared.exe
        echo     [OK] cloudflared 下载完成
    ) else (
        echo.
        echo     [ERROR] cloudflared 下载失败
        echo     请手动下载:
        echo     1. 浏览器打开: https://github.com/cloudflare/cloudflared/releases/latest
        echo     2. 下载 cloudflared-windows-amd64.exe
        echo     3. 保存到 C:\cloudflared\cloudflared.exe
        echo.
        pause
        exit /b 1
    )
) else (
    echo     [OK] cloudflared 就绪
)

:: === 启动 Cloudflare Tunnel ===
echo.
echo ========================================
echo   启动公网链接...
echo ========================================
echo.
echo 稍候会生成公网链接，格式如:
echo   https://xxxx.trycloudflare.com
echo.
echo 把该链接分享给他人即可使用
echo 按 Ctrl+C 停止隧道
echo.
"%CLOUDFLARED%" tunnel --url http://localhost:18888

pause
