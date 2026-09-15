param(
    [ValidateSet('Preview','Execute','Resume','Status','Abort')]
    [string]$Mode = 'Execute'
)
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    Write-Host 'Sell 600,000 ARGUS from arguswallet for Arc USDC. Slippage limit: 1%.'
    Write-Host 'Wallet: 0xf950F0Da8659C62Fb8E0B5462f05f9CACDF56938'
    Write-Host 'ARGUS: 0xece5ca8bf9220718e5727754026757512212cb3c'
    Write-Host 'Token taxes may increase the total token debit. Gas is paid in Arc USDC.'
    Write-Host ('Mode: ' + $Mode)
    if ($Mode -eq 'Preview') { Write-Host 'Read-only: no approvals or sale will be submitted.' }
    $operatorMode = '--' + $Mode.ToLowerInvariant()
    & node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs --import ./scripts/operator-paced-rpc.mjs scripts/argos-launch.mjs $operatorMode --personal-sell arguswallet --token 0xece5ca8bf9220718e5727754026757512212cb3c --tokens 600000
    $operatorExit = $LASTEXITCODE
    if ($operatorExit -ne 0) {
        Write-Host ('Stopped (exit ' + $operatorExit + '). Read the error immediately above.') -ForegroundColor Red
        if ($Mode -eq 'Preview') {
            Write-Host 'This preview did not sign or submit any transaction.'
        } else {
            Write-Host 'Check saved status: .\scripts\sell-arguswallet.ps1 -Mode Status'
            Write-Host 'Recover the same sale: .\scripts\sell-arguswallet.ps1 -Mode Resume'
            Write-Host 'Do not delete the journal or start a replacement sale if signing or submission is pending.'
        }
        exit $operatorExit
    }
} finally {
    Pop-Location
}
