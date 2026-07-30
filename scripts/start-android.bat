@echo off
chcp 65001 >nul
echo 🌿 SmartGarden 启动中...

cd /d "%~dp0..\SmartGarden"

:: 检查 Metro 是否已运行
curl -s http://localhost:8081/status >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ Metro 已在运行
) else (
    echo 🚇 启动 Metro 服务器（新窗口）...
    start "Metro" cmd /k "cd /d %cd% && npx react-native start"
    echo    等待 Metro 就绪...
    timeout /t 8 /nobreak >nul
)

echo 📱 启动 Android 应用...
npx react-native run-android
pause
