param(
    [ValidateSet('Preview','Execute')]
    [string]$Mode = 'Preview'
)
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$token = '0xe86688530c456e099732f953ed7aa7c583026680'
$batchName = 'two-passes-20260911'
$previousBatch = $env:ARGOS_PERSONAL_BATCH_ID
$workers = @()
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
    $runName = 'parallel-' + [Guid]::NewGuid().ToString('N')
    $logDirectory = Join-Path $privateDirectory $runName
    New-Item -ItemType Directory -Path $logDirectory | Out-Null
    foreach ($number in @(4,5,7,8)) {
        $wallet = "Personal$number"
        try {
            $journalPath = Join-Path $privateDirectory "argos-buy-$($wallet.ToLowerInvariant())-$token-$batchName-v1.json"
            $oldPass = Join-Path $privateDirectory "argos-buy45-$($wallet.ToLowerInvariant())-$token-$batchName-v1.json"
            if (Test-Path -LiteralPath $oldPass) { throw "$wallet has a saved 45% second-pass trade; inspect that first." }
            $step = $Mode.ToLowerInvariant()
            if ($Mode -eq 'Execute' -and (Test-Path -LiteralPath $journalPath)) {
                $saved = Get-Content -LiteralPath $journalPath -Raw | ConvertFrom-Json
                if ($saved.status -eq 'completed') { Write-Host "$wallet : 95% buy already completed. Skipping."; continue }
                if ($saved.status -eq 'aborted') { throw "$wallet : previous run aborted. Inspect its journal." }
                $step = 'resume'
            }
            $stdout = Join-Path $logDirectory "$wallet.stdout.log"
            $stderr = Join-Path $logDirectory "$wallet.stderr.log"
            $arguments = @('--use-system-ca','--env-file=.env.local','--import','./scripts/register-typescript.mjs','scripts/argos-launch.mjs',"--$step",'--personal',$wallet,'--token',$token,'--percent','95')
            # Start every wallet before waiting for any of them; no inter-wallet delay.
            $process = Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory $project -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
            $workers += [pscustomobject]@{ Wallet=$wallet; Process=$process; Stdout=$stdout; Stderr=$stderr }
            Write-Host "$wallet : $step started, 95% of available USDC."
        } catch {
            $failures += $wallet
            Write-Warning $_.Exception.Message
        }
    }
    Write-Host "All eligible wallets started. Logs: $logDirectory"
    foreach ($worker in $workers) {
        $worker.Process.WaitForExit()
        Write-Host "--- $($worker.Wallet) ---"
        Get-Content -LiteralPath $worker.Stdout
        if ($worker.Process.ExitCode -ne 0) {
            $failures += $worker.Wallet
            Get-Content -LiteralPath $worker.Stderr
        }
    }
    if ($failures.Count) { throw "Stopped wallets: $($failures -join ', '). Rerun this same script to resume saved work; completed buys are skipped. Logs: $logDirectory" }
    Write-Host 'All selected wallets finished.'
} finally {
    # Do not kill children during cleanup: signing/broadcast may already be in progress.
    if ($batchLock) { $batchLock.Dispose() }
    $env:ARGOS_PERSONAL_BATCH_ID = $previousBatch
    Pop-Location
}
