@echo off
chcp 65001 >nul
title Amazon 评论采集器 - 公网访问

echo.
echo ========================================
echo   Amazon 评论采集器 - 公网访问启动器
echo ========================================
echo.

:: 检查 Chrome 调试端口是否就绪
netstat -ano | findstr ":18800 " | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [WARN] Chrome 远程调试端口 18800 未开启
    echo.
    echo 请先关闭所有 Chrome 窗口，然后重新打开 Chrome：
    echo.
    echo 路径（复制到 Chrome 地址栏回车）：
    echo.
    echo %ProgramFiles%\Google\Chrome\Application\chrome.exe --remote-debugging-port=18800
    echo.
    echo 或右键 Chrome 快捷方式 → 目标后面加：
    echo     --remote-debugging-port=18800
    echo.
    pause
    exit /b 1
)
echo [OK] Chrome 调试端口就绪

:: 检查服务是否已启动
netstat -ano | findstr ":18888 " | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [INFO] 启动本地服务 (http://localhost:18888) ...
    start "Amazon采集服务" cmd /c "cd /d %~dp0 && node server.js"
    timeout /t 3 /nobreak >nul
) else (
    echo [OK] 本地服务已在运行
)

:: 检查 cloudflared
where cloudflared >nul 2>&1
if %errorlevel% neq 0 (
    echo [WARN] 未找到 cloudflared，将尝试下载...
    echo.
    echo 正在下载 cloudflared（约 60MB）...

    :: 尝试下载
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'C:\cloudflared\cloudflared.exe' -UseBasicParsing" >nul 2>&1

    if exist "C:\cloudflared\cloudflared.exe" (
        echo [OK] cloudflared 下载完成
    ) else (
        echo [ERROR] 下载失败，请手动下载：
        echo.
        echo 1. 浏览器打开：
        echo    https://github.com/cloudflare/cloudflared/releases/latest
        echo.
        echo 2. 下载 cloudflared-windows-amd64.exe
        echo.
        echo 3. 放到 C:\cloudflared\cloudflared.exe
        echo.
        echo 4. 重新运行此脚本
        echo.
        pause
        exit /b 1
    )
)

echo.
echo [INFO] 启动 Cloudflare Tunnel（生成公网链接）...
echo [INFO] 链接生成后分享给他人即可使用
echo.

:: 启动 cloudflared 并捕获输出
"C:\cloudflared\cloudflared.exe" tunnel --url http://localhost:18888

echo.
echo 按任意键退出...
pause >nul
