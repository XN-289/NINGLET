@echo off
chcp 65001 >nul 2>&1
title NINGLET - 短篇分支 Stop

echo.
echo ========================================
echo   Stopping NINGLET 短篇分支 (20010)...
echo ========================================
echo.

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :20010 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>&1
    echo Killed process %%a
)

echo.
echo Done!
timeout /t 2 /nobreak >nul
