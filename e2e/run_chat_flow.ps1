param(
    [string]$OwnerEmail = "",
    [string]$OwnerPassword = "",
    [string]$GuestEmail = "",
    [string]$GuestPassword = "",
    [string]$BaseUrl = "http://localhost:8090",
    [int]$Port = 8090,
    [int]$ServerTimeout = 180,
    [string]$SkillsRoot = "C:\Users\petbl\skills"
)

$ErrorActionPreference = "Stop"

function Use-ValueOrEnv {
    param(
        [string]$ParamValue,
        [string]$EnvName
    )
    if (![string]::IsNullOrWhiteSpace($ParamValue)) {
        return $ParamValue
    }
    return [Environment]::GetEnvironmentVariable($EnvName)
}

$resolvedOwnerEmail = Use-ValueOrEnv -ParamValue $OwnerEmail -EnvName "HC_E2E_OWNER_EMAIL"
$resolvedOwnerPassword = Use-ValueOrEnv -ParamValue $OwnerPassword -EnvName "HC_E2E_OWNER_PASSWORD"
$resolvedGuestEmail = Use-ValueOrEnv -ParamValue $GuestEmail -EnvName "HC_E2E_GUEST_EMAIL"
$resolvedGuestPassword = Use-ValueOrEnv -ParamValue $GuestPassword -EnvName "HC_E2E_GUEST_PASSWORD"

if ([string]::IsNullOrWhiteSpace($resolvedOwnerEmail) -or
    [string]::IsNullOrWhiteSpace($resolvedOwnerPassword) -or
    [string]::IsNullOrWhiteSpace($resolvedGuestEmail) -or
    [string]::IsNullOrWhiteSpace($resolvedGuestPassword)) {
    throw "Missing E2E credentials. Provide params or set HC_E2E_OWNER_EMAIL / HC_E2E_OWNER_PASSWORD / HC_E2E_GUEST_EMAIL / HC_E2E_GUEST_PASSWORD."
}

$withServer = Join-Path $SkillsRoot "webapp-testing\scripts\with_server.py"
if (!(Test-Path $withServer)) {
    throw "with_server.py not found: $withServer"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptDir "..")

Push-Location $repoRoot
try {
    $env:HC_E2E_OWNER_EMAIL = $resolvedOwnerEmail
    $env:HC_E2E_OWNER_PASSWORD = $resolvedOwnerPassword
    $env:HC_E2E_GUEST_EMAIL = $resolvedGuestEmail
    $env:HC_E2E_GUEST_PASSWORD = $resolvedGuestPassword

    Write-Host "[E2E] Starting two-user chat flow..." -ForegroundColor Cyan
    Write-Host "[E2E] Base URL: $BaseUrl | Port: $Port" -ForegroundColor DarkCyan

    python $withServer `
        --server "npm run web" `
        --port $Port `
        --timeout $ServerTimeout `
        -- `
        python "e2e/test_chat_flow.py" --base-url $BaseUrl

    if ($LASTEXITCODE -ne 0) {
        throw "Chat E2E failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}
