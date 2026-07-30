# SmartGarden Android 一键启动脚本
# 自动打开 Metro 服务器 → 启动 Android 模拟器应用

$projectDir = Split-Path -Parent $PSScriptRoot
$smartGardenDir = Join-Path $projectDir "SmartGarden"

Write-Host "🌿 SmartGarden 启动中..." -ForegroundColor Green

# ━━ 1. 检查 Metro 是否已在运行 ━━
$metroRunning = $false
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8081/status" -TimeoutSec 2 -ErrorAction Stop
    $metroRunning = $true
} catch {}

if ($metroRunning) {
    Write-Host "✅ Metro 已在运行" -ForegroundColor Green
} else {
    Write-Host "🚇 启动 Metro 服务器..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "Write-Host '🚇 Metro 开发服务器' -ForegroundColor Cyan; cd '$smartGardenDir'; npx react-native start"
    )
    Write-Host "   等待 Metro 就绪..." -ForegroundColor Yellow
    Start-Sleep -Seconds 8
}

# ━━ 2. 启动 Android 应用 ━━
Write-Host "📱 启动 Android 应用..." -ForegroundColor Cyan
Set-Location $smartGardenDir
npx react-native run-android
