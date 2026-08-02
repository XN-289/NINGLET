@echo off
chcp 65001 >nul 2>&1
title Kealin AI Novels

echo.
echo ========================================
echo   Kealin AI Novels Starting...
echo ========================================
echo.

cd /d "%~dp0"

:: Kill only the Flask process on port 20000
echo [1/3] Cleaning up port 20000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :20000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: Start service
echo [2/3] Starting service...
start "" python app.py
timeout /t 2 /nobreak >nul

:: Wait for service
echo [3/3] Waiting for service...
set count=0

:check
if %count% geq 20 goto :fail
timeout /t 1 /nobreak >nul
set /a count+=1
curl -s http://localhost:20000/api/health >nul 2>&1
if %errorlevel% neq 0 goto :check

:: Success
echo.
echo ========================================
echo   SUCCESS!
echo.
echo   URL: http://localhost:20000
echo   Opening browser...
echo ========================================
echo.

start http://localhost:20000
exit /b 0

:fail
echo.
echo ========================================
echo   FAILED! Please check:
echo   1. Python installed?
echo   2. .env config correct?
echo   3. Port 20000 in use?
echo ========================================
echo.
pause
exit /b 1
