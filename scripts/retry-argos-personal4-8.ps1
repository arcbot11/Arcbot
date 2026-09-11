param([ValidateSet('Preview','Execute')][string]$Mode = 'Preview')
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$token = '0xe86688530c456e099732f953ed7aa7c583026680'
$previousBatch = $env:ARGOS_PERSONAL_BATCH_ID
$failures = @()
Push-Location -LiteralPath $project
try {
    foreach ($wallet in @('Personal4','Personal8')) {
        try {
            $env:ARGOS_PERSONAL_BATCH_ID = 'two-passes-20260911'
            $oldPath = ".deployment-private/argos-buy-$($wallet.ToLowerInvariant())-$token-two-passes-20260911-v1.json"
            $old = Get-Content -LiteralPath $oldPath -Raw | ConvertFrom-Json
            if ($wallet -eq 'Personal4') {
                if ($old.status -eq 'completed') { Write-Host 'Personal4 already completed. Skipping.'; continue }
                $step = if ($Mode -eq 'Execute') { 'Resume' } else { 'Preview' }
                & "$PSScriptRoot/buy-personal-argos.ps1" -Wallet $wallet -Percent 95 -Mode $step
                continue
            }
            # A fresh buy is allowed only after the previous buy is definitively reverted.
            $buy = @($old.transactions | Where-Object { $_.label -eq 'Personal8:buy' })
            if ($buy.Count -ne 1 -or $buy[0].status -ne 'reverted') { throw 'Personal8 previous buy is not verified reverted. Inspect its status.' }
            if ($Mode -eq 'Preview') {
                Write-Host 'Personal8: execution will verify the old receipts, unlock the reverted attempt, then buy with 95% of the remaining available USDC.'
                continue
            }
            if ($old.status -ne 'aborted') {
                & "$PSScriptRoot/buy-personal-argos.ps1" -Wallet Personal8 -Percent 95 -Mode Abort
            }
            # Separate durable retry journal. Rerunning never repeats a completed purchase.
            $env:ARGOS_PERSONAL_BATCH_ID = 'two-passes-20260911-retry1'
            $retryPath = ".deployment-private/argos-buy-personal8-$token-two-passes-20260911-retry1-v1.json"
            $step = 'Execute'
            if (Test-Path -LiteralPath $retryPath) {
                $saved = Get-Content -LiteralPath $retryPath -Raw | ConvertFrom-Json
                if ($saved.status -eq 'completed') { Write-Host 'Personal8 retry already completed. Skipping.'; continue }
                if ($saved.status -eq 'aborted') { throw 'Personal8 retry was aborted. Inspect its journal.' }
                $step = 'Resume'
            }
            & "$PSScriptRoot/buy-personal-argos.ps1" -Wallet Personal8 -Percent 95 -Mode $step
        } catch {
            $failures += $wallet
            Write-Warning $_.Exception.Message
        }
    }
    if ($failures.Count) { throw "Stopped: $($failures -join ', '). Journals retained. No automatic replacement trades." }
} finally {
    $env:ARGOS_PERSONAL_BATCH_ID = $previousBatch
    Pop-Location
}
