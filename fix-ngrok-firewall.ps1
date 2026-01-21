# ngrok Windows 방화벽 예외 추가 스크립트
# 관리자 권한으로 실행해야 합니다

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  ngrok Firewall Exception Setup" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# 관리자 권한 확인
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "[ERROR] This script requires Administrator privileges!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please:" -ForegroundColor Yellow
    Write-Host "  1. Right-click PowerShell" -ForegroundColor Yellow
    Write-Host "  2. Select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "  3. Run this script again" -ForegroundColor Yellow
    Write-Host ""
    pause
    exit 1
}

Write-Host "[CHECK] Running with Administrator privileges ✓" -ForegroundColor Green
Write-Host ""

# ngrok 바이너리 경로 찾기
$projectPath = Split-Path -Parent $PSCommandPath
$ngrokBinPath = Join-Path $projectPath "node_modules\.bin\ngrok.cmd"
$ngrokExePath = Join-Path $projectPath "node_modules\@expo\ngrok-bin\bin\ngrok.exe"

Write-Host "[SEARCH] Looking for ngrok binaries..." -ForegroundColor Yellow

if (Test-Path $ngrokBinPath) {
    Write-Host "[FOUND] ngrok.cmd: $ngrokBinPath" -ForegroundColor Green
} else {
    Write-Host "[WARN] ngrok.cmd not found at: $ngrokBinPath" -ForegroundColor Yellow
}

if (Test-Path $ngrokExePath) {
    Write-Host "[FOUND] ngrok.exe: $ngrokExePath" -ForegroundColor Green
} else {
    Write-Host "[WARN] ngrok.exe not found at: $ngrokExePath" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "[ACTION] Adding firewall rules..." -ForegroundColor Cyan

# 방화벽 규칙 추가
try {
    # Rule 1: ngrok.cmd
    if (Test-Path $ngrokBinPath) {
        New-NetFirewallRule -DisplayName "Expo ngrok (CMD)" `
            -Direction Outbound `
            -Program $ngrokBinPath `
            -Action Allow `
            -ErrorAction SilentlyContinue
        Write-Host "[OK] Added rule for ngrok.cmd" -ForegroundColor Green
    }

    # Rule 2: ngrok.exe
    if (Test-Path $ngrokExePath) {
        New-NetFirewallRule -DisplayName "Expo ngrok (EXE)" `
            -Direction Outbound `
            -Program $ngrokExePath `
            -Action Allow `
            -ErrorAction SilentlyContinue
        Write-Host "[OK] Added rule for ngrok.exe" -ForegroundColor Green
    }

    # Rule 3: Node.js (Expo CLI를 실행하는 node.exe도 허용)
    $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
    if ($nodePath) {
        New-NetFirewallRule -DisplayName "Expo Node.js" `
            -Direction Outbound `
            -Program $nodePath `
            -Action Allow `
            -ErrorAction SilentlyContinue
        Write-Host "[OK] Added rule for Node.js: $nodePath" -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "[SUCCESS] Firewall rules added successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "You can now run: auto-run-tunnel.bat" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "[ERROR] Failed to add firewall rules:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Try adding rules manually:" -ForegroundColor Yellow
    Write-Host "  1. Open 'Windows Defender Firewall with Advanced Security'" -ForegroundColor Yellow
    Write-Host "  2. Click 'Outbound Rules' -> 'New Rule'" -ForegroundColor Yellow
    Write-Host "  3. Select 'Program' and browse to ngrok.exe" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
