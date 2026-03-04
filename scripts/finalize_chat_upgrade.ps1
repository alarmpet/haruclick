param(
    [switch]$RunE2E,
    [string]$BaseUrl = "http://localhost:8090",
    [int]$Port = 8090
)

$ErrorActionPreference = "Stop"

function Step($message) {
    Write-Host ""
    Write-Host "==> $message" -ForegroundColor Cyan
}

function Invoke-Checked {
    param(
        [string]$CommandLine
    )
    Invoke-Expression $CommandLine
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed with exit code ${LASTEXITCODE}: $CommandLine"
    }
}

function Check-File($path) {
    if (!(Test-Path -LiteralPath $path)) {
        throw "Missing required file: $path"
    }
    Write-Host "ok  $path" -ForegroundColor Green
}

Step "Validate required files"
Check-File "migrations/20260211_add_calendar_chat.sql"
Check-File "migrations/20260212_fix_chat_fk_and_realtime.sql"
Check-File "migrations/20260213_harden_calendar_chat_policies.sql"
Check-File "docs/sql/verify_calendar_chat.sql"
Check-File "app/calendar/chat/[id].tsx"
Check-File "services/supabase-modules/chat.ts"
Check-File "e2e/test_chat_flow.py"
Check-File "e2e/run_chat_flow.ps1"

Step "TypeScript compile check"
Invoke-Checked "npx tsc --noEmit"

Step "Python script syntax check"
Invoke-Checked "python -m py_compile e2e/test_chat_flow.py e2e/inspect_dom.py"

if ($RunE2E) {
    Step "Run web chat E2E"
    Invoke-Checked "powershell -ExecutionPolicy Bypass -File `"e2e/run_chat_flow.ps1`" -BaseUrl `"$BaseUrl`" -Port $Port"
} else {
    Write-Host ""
    Write-Host "E2E skipped. Run with -RunE2E when test credentials are configured." -ForegroundColor Yellow
}

Step "Manual DB verification checklist"
Write-Host "1) Apply migrations through 20260213 in Supabase SQL Editor." -ForegroundColor White
Write-Host "2) Execute docs/sql/verify_calendar_chat.sql and store results." -ForegroundColor White
Write-Host "3) Confirm legacy chat policies query returns 0 rows." -ForegroundColor White
Write-Host "4) Confirm non-member cannot read/write chat messages." -ForegroundColor White

Write-Host ""
Write-Host "Calendar chat finalization checks completed." -ForegroundColor Green
