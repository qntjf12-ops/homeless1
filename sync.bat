@echo off
echo ==============================================
echo   CareCheck GitHub Auto-Synchronizer
echo ==============================================
echo.
echo [*] Checking for updates...
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "Auto-sync from device: %date% %time%"
"C:\Program Files\Git\cmd\git.exe" push origin main
echo.
echo [*] Synchronization Complete!
echo ==============================================
pause
