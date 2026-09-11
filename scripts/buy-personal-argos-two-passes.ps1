param(
    [ValidateSet('Preview','Execute')]
    [string]$Mode = 'Preview'
)
# One durable batch. Rerunning resumes its existing trades, never creates a new batch.
# Pass two spends 95% of the balance remaining THEN, not 95% of the original balance.
$ErrorActionPreference = 'Stop'
$batchName = 'two-passes-20260911'
$token = '0xe86688530c456e099732f953ed7aa7c583026680'
$previousBatch = $env:ARGOS_PERSONAL_BATCH_ID
$batchLock = $null
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    $env:ARGOS_PERSONAL_BATCH_ID = $batchName
    if ($Mode -eq 'Execute') {
        New-Item -ItemType Directory -Path '.deployment-private' -Force | Out-Null
        $batchLock = [System.IO.File]::Open((Join-Path (Get-Location) ".deployment-private/$batchName.lock"), 'OpenOrCreate', 'ReadWrite', 'None')
    }
    foreach ($percent in @(50,95)) {
        Write-Host "Pass: spend $percent% of each wallet's remaining available USDC."
        foreach ($number in 1..8) {
            $wallet = "Personal$number"
            # Match the operator's existing 95% journal name (buy, not buy95).
            $buyPrefix = if ($percent -eq 95) { 'buy' } else { "buy$percent" }
            $journalPath = ".deployment-private/argos-$buyPrefix-$($wallet.ToLowerInvariant())-$token-$batchName-v1.json"
            $oldSecondPass = ".deployment-private/argos-buy45-$($wallet.ToLowerInvariant())-$token-$batchName-v1.json"
            if ($percent -eq 95 -and (Test-Path -LiteralPath $oldSecondPass)) {
                throw "$wallet has a saved 45% second-pass trade. Inspect it before starting a different second pass."
            }
            # Refresh immediately before each wallet, including the second pass.
            $balanceOutput = & node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/personal-argos-balances.mjs
            if ($LASTEXITCODE -ne 0) { throw 'Could not verify balances. No further buys submitted.' }
            $snapshot = ($balanceOutput -join "`n") | ConvertFrom-Json
            $row = @($snapshot.rows | Where-Object { $_.name -eq $wallet })
            if ($row.Count -ne 1 -or $row[0].error) { throw "Cannot verify $wallet. Stopping." }
            $stepMode = $Mode
            if ($Mode -eq 'Execute' -and (Test-Path -LiteralPath $journalPath)) {
                $saved = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
                if ($saved.status -eq 'completed') { Write-Host "$wallet pass $percent already completed."; continue }
                if ($saved.status -eq 'aborted') { throw "$wallet pass $percent was aborted. Stopping." }
                $stepMode = 'Resume'
            } elseif ([decimal]::Parse($row[0].availableUSDC, [Globalization.CultureInfo]::InvariantCulture) -lt [decimal]5) {
                Write-Host "$wallet skipped: less than 5 USDC available."
                continue
            }
            if ($stepMode -ne 'Resume' -and $row[0].activeTransaction) { throw "$wallet has an active transaction. Stopping." }
            $started = Get-Date
            Write-Host "$wallet : $percent% : $stepMode"
            & "$PSScriptRoot/buy-personal-argos.ps1" -Wallet $wallet -Percent $percent -TokenAddress $token -Mode $stepMode
            # The shared operator verifies delivery and releases its lock before returning.
            # Leave at least 40 seconds between starts; slow verification can extend this.
            if ($Mode -eq 'Execute') {
                $remaining = 40 - ((Get-Date) - $started).TotalSeconds
                if ($remaining -gt 0) { Start-Sleep -Seconds ([int][Math]::Ceiling($remaining)) }
            }
        }
    }
    if ($Mode -eq 'Preview') { Write-Host 'Preview only. Pass-two previews use current balances; execution recalculates after pass one.' }
    else { Write-Host 'Both purchase passes completed. Wallets below 5 USDC were skipped.' }
} finally {
    if ($batchLock) { $batchLock.Dispose() }
    $env:ARGOS_PERSONAL_BATCH_ID = $previousBatch
    Pop-Location
}
