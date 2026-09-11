param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Personal1','Personal2','Personal3','Personal4','Personal5','Personal6','Personal7','Personal8')]
    [string]$Wallet,
    [ValidatePattern('^0x[0-9a-fA-F]{40}$')]
    [string]$TokenAddress = '0xe86688530C456E099732f953ed7aA7C583026680',
    [ValidateSet('Preview','Execute','Resume','Status','Abort')]
    [string]$Mode = 'Preview'
)
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
try {
    $operatorMode = '--' + $Mode.ToLowerInvariant()
    & node --use-system-ca --env-file=.env.local --import ./scripts/register-typescript.mjs scripts/argos-launch.mjs $operatorMode --personal-sell $Wallet --token $TokenAddress
    if ($LASTEXITCODE -ne 0) { throw 'Stopped. Use Status or Resume with this same wallet. Do not delete its sell journal.' }
} finally {
    Pop-Location
}
