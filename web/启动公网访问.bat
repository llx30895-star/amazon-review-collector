@echo off
chcp 65001 >nul
title Amazon 评论采集器 - 公网访问

echo.
echo ==============================================
echo    Amazon 评论采集器 - 公网访问
echo ==============================================
echo.

:: 检查本地服务
netstat -ano | findstr ":18888 " | findstr LISTENING >nul
if %errorlevel% neq 0 (
    echo [ERROR] 本地服务未启动！
    echo 请先运行: node server.js
    pause
    exit /b 1
)
echo [OK] 本地服务已就绪 (localhost:18888)
echo.

:: 优先用 cloudflared（若存在且完整），否则用 SSH 隧道
set TUNNEL_CMD=

if exist "C:\cloudflared\cloudflared.exe" (
    echo [INFO] 使用 Cloudflare Tunnel 方案...
    set TUNNEL_CMD=C:\cloudflared\cloudflared.exe tunnel --url http://localhost:18888
) else (
    echo [INFO] 使用 SSH Tunnel 方案（无需安装）...
    echo 注意：如果是第一次用 SSH 隧道，会提示输入密码，直接回车即可
    echo.
    set TUNNEL_CMD=ssh -o StrictHostKeyChecking=no -R 80:localhost:18888 nokey@localhost.run
)

echo.
echo ==============================================
echo   隧道启动中，请等待 5-10 秒...
echo   看到类似 https://xxxxx.localhost.run 的链接即成功
echo   按 Ctrl+C 停止
echo ==============================================
echo.

%TUNNEL_CMD%

echo.
echo 按任意键退出...
pause >nul
