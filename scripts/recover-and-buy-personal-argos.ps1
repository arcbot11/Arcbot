param(
    [ValidateSet('Preview','Execute')]
    [string]$Mode = 'Preview'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$token = '0xe86688530c456e099732f953ed7aa7c583026680'
$batchName = 'two-passes-20260911'
$previousBatch = $env:ARGOS_PERSONAL_BATCH_ID
$failures = @()
$batchLock = $null
Push-Location -LiteralPath $project
try {
    $node = (Get-Command node -ErrorAction Stop).Source
    $privateDirectory = Join-Path $project '.deployment-private'
    New-Item -ItemType Directory -Path $privateDirectory -Force | Out-Null
    if ($Mode -eq 'Execute') {
        # Shares the sequential batch lock and journals, preventing duplicate runs.
        $batchLock = [System.IO.File]::Open((Join-Path $privateDirectory "$batchName.lock"), 'OpenOrCreate', 'ReadWrite', 'None')
    }
    $env:ARGOS_PERSONAL_BATCH_ID = $batchName
    foreach ($number in @(4,5,6,8)) {
        $wallet = "Personal$number"
        try {
            # Continue Personal8's existing replacement attempt; never restart its reverted buy.
            $walletBatch = $batchName
            if ($wallet -eq 'Personal8') {
                $walletBatch = 'two-passes-20260911-retry1'
                $originalPath = Join-Path $privateDirectory "argos-buy-personal8-$token-$batchName-v1.json"
                $original = Get-Content -LiteralPath $originalPath -Raw | ConvertFrom-Json
                if ($original.status -ne 'aborted' -or -not $original.wallets[0].released) {
                    throw 'Personal8 original attempt has not been reconciled and unlocked. No replacement submitted.'
                }
            }
            $env:ARGOS_PERSONAL_BATCH_ID = $walletBatch
            $journalPath = Join-Path $privateDirectory "argos-buy-$($wallet.ToLowerInvariant())-$token-$walletBatch-v1.json"
            $oldPass = Join-Path $privateDirectory "argos-buy45-$($wallet.ToLowerInvariant())-$token-$batchName-v1.json"
            if (Test-Path -LiteralPath $oldPass) { throw "$wallet has a saved 45% second-pass trade; inspect that first." }
            $step = $Mode.ToLowerInvariant()
            if ($Mode -eq 'Execute' -and (Test-Path -LiteralPath $journalPath)) {
                $saved = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
                if ($saved.status -eq 'completed') { Write-Host "$wallet : 95% buy already completed. Skipping."; continue }
                if ($saved.status -eq 'aborted') { throw "$wallet : previous run aborted. Inspect its journal." }
                $step = 'resume'
            }
            Write-Host "$wallet : $step, 95% buy."
            # Direct invocation preserves the native exit code and streams progress.
            & $node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/argos-launch.mjs "--$step" --personal $wallet --token $token --percent 95
            $exitCode = $LASTEXITCODE
            if ($Mode -eq 'Execute') {
                $result = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
                if ($result.status -eq 'completed' -and $result.wallets[0].released) {
                    Write-Host "$wallet completed and unlocked."
                } else { throw "$wallet incomplete (exit $exitCode). Saved work retained; see the message above." }
            } elseif ($exitCode -ne 0) { throw "$wallet preview failed (exit $exitCode)." }
        } catch {
            $failures += $wallet
            Write-Warning $_.Exception.Message
        }
    }
    if ($failures.Count) { throw "Incomplete wallets: $($failures -join ', '). Rerun this script to resume. Completed buys are skipped." }
    Write-Host 'All selected wallets finished.'
} finally {
    # Per-wallet durable journals and the shared batch lock prevent duplicates.
    if ($batchLock) { $batchLock.Dispose() }
    $env:ARGOS_PERSONAL_BATCH_ID = $previousBatch
    Pop-Location
}
