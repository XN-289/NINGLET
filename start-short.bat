@echo off
chcp 65001 >nul 2>&1
title NINGLET 短篇创作台

echo.
echo ========================================
echo   NINGLET 短篇创作台 Starting... (port 20010)
echo ========================================
echo.

cd /d "%~dp0"

:: 杀干净所有旧的 app.py 进程（含子进程，避免僵尸堆积）
echo [1/3] 清理旧进程...
wmic process where "name='python.exe' and commandline like '%%app.py%%'" call terminate >nul 2>&1
timeout /t 1 /nobreak >nul

:: 启动
echo [2/3] 启动服务...
start "" python app.py
timeout /t 2 /nobreak >nul

:: 等待健康检查
echo [3/3] 等待服务就绪...
set count=0
:check
if %count% geq 20 goto :fail
timeout /t 1 /nobreak >nul
set /a count+=1
curl -s http://localhost:20010/api/health >nul 2>&1
if %errorlevel% neq 0 goto :check

echo.
echo ========================================
echo   启动成功!
echo   地址: http://localhost:20010
echo ========================================
start http://localhost:20010
exit /b 0

:fail
echo.
echo 启动失败，请检查:
echo   1. Python 已安装?
echo   2. .env 里 API_KEY 配好没?
echo   3. 端口 20010 被占用?
pause
exit /b 1
