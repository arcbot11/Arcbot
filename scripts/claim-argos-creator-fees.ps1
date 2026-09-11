param([ValidateSet('Preview','Execute','Status','Abort')][string]$Mode='Preview')
$ErrorActionPreference='Stop'
$previousBatch=$env:ARGOS_PERSONAL_BATCH_ID
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    Remove-Item Env:ARGOS_PERSONAL_BATCH_ID -ErrorAction SilentlyContinue
    $step='--'+$Mode.ToLowerInvariant()
    if ($Mode -eq 'Execute' -and (Test-Path -LiteralPath '.deployment-private/argos-creator-fees-20260911-v1.json')) { $step='--resume' }
    & node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/argos-launch.mjs $step --creator-fees
    if ($LASTEXITCODE -ne 0) { throw 'Creator fee claim stopped. Keep its journal; rerun Execute to recover the same attempt.' }
} finally {
    $env:ARGOS_PERSONAL_BATCH_ID=$previousBatch
    Pop-Location
}
