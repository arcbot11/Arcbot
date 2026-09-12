param(
    [ValidateSet('Preview','Execute','Status')][string]$Mode='Preview',
    [ValidatePattern('^[a-zA-Z0-9-]{1,48}$')][string]$Run='first'
)
$ErrorActionPreference='Stop'
$previousBatch=$env:ARGOS_PERSONAL_BATCH_ID
$previousRun=$env:ARGOS_CRANK_RUN_ID
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    Remove-Item Env:ARGOS_PERSONAL_BATCH_ID -ErrorAction SilentlyContinue
    $env:ARGOS_CRANK_RUN_ID=$Run
    $step='--'+$Mode.ToLowerInvariant()
    $journal=Join-Path '.deployment-private' ('argos-crank-'+$Run+'-v1.json')
    if ($Mode -eq 'Execute' -and (Test-Path -LiteralPath $journal)) { $step='--resume' }
    & node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/argos-launch.mjs $step --crank-fees
    if ($LASTEXITCODE -ne 0) { throw "Crank stopped. Rerun Execute with -Run $Run to recover. Keep the journal; do not start a new run while this one is unresolved." }
} finally {
    $env:ARGOS_PERSONAL_BATCH_ID=$previousBatch
    $env:ARGOS_CRANK_RUN_ID=$previousRun
    Pop-Location
}
