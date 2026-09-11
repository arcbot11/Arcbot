param(
    [ValidateSet('Preview', 'Execute', 'Resume', 'Status', 'Abort', 'DeployBackend')]
    [string]$Mode = 'Preview'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location -LiteralPath $projectRoot
try {
    if (-not (Test-Path -LiteralPath '.env.local')) { throw 'Project .env.local is missing.' }
    if ($Mode -eq 'DeployBackend') {
        # Use the existing deployment key in .env.local, not a new empty backend.
        & node --use-system-ca --env-file=.env.local scripts/deploy-launch-backend.mjs
    } else {
        $operatorMode = '--' + $Mode.ToLowerInvariant()
        & node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/argos-launch.mjs $operatorMode
    }
    if ($LASTEXITCODE -ne 0) { throw 'Stopped. Inspect Status before retrying. Do not delete the launch journal.' }
} finally {
    Pop-Location
}
