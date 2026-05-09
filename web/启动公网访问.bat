@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

title Amazon 评论采集器 - 公网访问

echo.
echo ==============================================
echo    Amazon 评论采集器 - 公网访问启动器 v3
echo ==============================================
echo.

:: 记录日志到同目录
set LOGFILE=%~dp0startup.log
echo [%date% %time%] ===== 启动 ===== > "!LOGFILE!"

:: === Step 1: 检查 Chrome 调试端口 ===
echo [Step 1] 检查 Chrome 调试端口 (18800)...
echo [Step 1] 检查 Chrome 调试端口 (18800)... >> "!LOGFILE!"
netstat -ano | findstr ":18800 " | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo     [OK] Chrome 18800 端口就绪
    echo     [OK] Chrome 18800 端口就绪 >> "!LOGFILE!"
) else (
    echo     [WARN] Chrome 18800 端口未开启
    echo     [WARN] Chrome 18800 端口未开启 >> "!LOGFILE!"
    echo.
    echo     请先关闭所有 Chrome 窗口，然后：
    echo.
    echo     方法1（推荐）：右键 Chrome 快捷方式 ^> 目标
    echo     后面加上: --remote-debugging-port=18800
    echo.
    echo     方法2：按 Win+R，输入以下命令回车:
    echo     chrome.exe --remote-debugging-port=18800
    echo.
    echo     完成后重新运行此脚本
    echo.
    pause
    exit /b 1
)

:: === Step 2: 启动本地服务 ===
echo [Step 2] 检查本地服务 (18888)...
echo [Step 2] 检查本地服务 (18888)... >> "!LOGFILE!"
netstat -ano | findstr ":18888 " | findstr LISTENING >nul
if %errorlevel% equ 0 (
    echo     [OK] 本地服务已在运行
    echo     [OK] 本地服务已在运行 >> "!LOGFILE!"
) else (
    echo     [INFO] 启动本地服务...
    echo     [INFO] 启动本地服务... >> "!LOGFILE!"
    :: 用 cmd /c 在新窗口运行，不阻塞
    start "Amazon采集服务" cmd /k "cd /d \"%~dp0\" && node server.js"
    echo     等待 5 秒让服务启动...
    timeout /t 5 /nobreak >nul
    netstat -ano | findstr ":18888 " | findstr LISTENING >nul
    if %errorlevel% equ 0 (
        echo     [OK] 本地服务启动成功
        echo     [OK] 本地服务启动成功 >> "!LOGFILE!"
    ) else (
        echo     [ERROR] 本地服务启动失败！请确保已安装 Node.js
        echo     [ERROR] 本地服务启动失败 >> "!LOGFILE!"
        pause
        exit /b 1
    )
)

:: === Step 3: 检查 / 下载 cloudflared ===
echo [Step 3] 检查 cloudflared...
echo [Step 3] 检查 cloudflared... >> "!LOGFILE!"

set CFD=
if exist "C:\cloudflared\cloudflared.exe" (
    set CFD=C:\cloudflared\cloudflared.exe
    echo     [OK] 发现 cloudflared: !CFD!
    echo     [OK] 发现 cloudflared: !CFD! >> "!LOGFILE!"
) else (
    echo     [INFO] 未找到 cloudflared，准备下载（约 60MB）...
    echo     [INFO] 准备下载 cloudflared >> "!LOGFILE!"
    if not exist "C:\cloudflared" mkdir "C:\cloudflared"
    echo     正在下载，请稍候（首次可能较慢）...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'C:\cloudflared\cloudflared.exe' -UseBasicParsing -TimeoutSec 120" >> "!LOGFILE!" 2>&1
    if exist "C:\cloudflared\cloudflared.exe" (
        set CFD=C:\cloudflared\cloudflared.exe
        echo     [OK] cloudflared 下载完成
        echo     [OK] cloudflared 下载完成 >> "!LOGFILE!"
    ) else (
        echo     [ERROR] cloudflared 下载失败！
        echo     [ERROR] cloudflared 下载失败 >> "!LOGFILE!"
        echo.
        echo     请手动下载：
        echo     1. 浏览器打开: github.com/cloudflare/cloudflared/releases
        echo     2. 下载 cloudflared-windows-amd64.exe
        echo     3. 保存为: C:\cloudflared\cloudflared.exe
        echo.
        pause
        exit /b 1
    )
)

:: === Step 4: 启动 Cloudflare Tunnel ===
echo.
echo ==============================================
echo    启动公网链接...
echo ==============================================
echo.
echo 稍候会生成公网链接（格式: https://xxxx.trycloudflare.com）
echo 把该链接分享给他人即可使用
echo.
echo 按 Ctrl+C 可停止隧道
echo.
echo 日志文件: !LOGFILE!
echo.

:: 直接运行 cloudflared（不捕获输出，这样能看到实时日志）
"!CFD!" tunnel --url http://localhost:18888

echo.
echo 隧道已退出。按任意键退出...
pause >nul
