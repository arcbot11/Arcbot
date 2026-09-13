param([Parameter(Mandatory=$true)][string]$ExpectedAddress, [switch]$FromClipboard)
$ErrorActionPreference = 'Stop'
if ($ExpectedAddress -notmatch '^0x[0-9a-fA-F]{40}$') { throw 'Invalid expected wallet address.' }
$nodePath = (Get-Command node -ErrorAction Stop).Source
$helperPath = Join-Path $PSScriptRoot 'check-wallet-key.mjs'
Write-Host ('Checking against: ' + $ExpectedAddress)
Write-Host 'Offline check. The key is hidden and is not saved. Both formats (with or without 0x) work.'
$secret = $null
if ($FromClipboard) {
    [void](Read-Host 'Copy the private key now, then press Enter here. Do not paste it')
    $clipboardKey = Get-Clipboard -Raw
    if ([string]::IsNullOrWhiteSpace($clipboardKey)) { throw 'Clipboard is empty. Copy the private key and run again.' }
    try { $secret = ConvertTo-SecureString $clipboardKey -AsPlainText -Force }
    finally { $clipboardKey = $null }
} else {
    $secret = Read-Host 'Paste the private key, then press Enter' -AsSecureString
}
$pointer = [IntPtr]::Zero
$process = New-Object System.Diagnostics.Process
$started = $false
try {
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodePath
    $startInfo.WorkingDirectory = Split-Path -Parent $PSScriptRoot
    $startInfo.Arguments = '"' + $helperPath + '" ' + $ExpectedAddress
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process.StartInfo = $startInfo
    [void]$process.Start()
    $started = $true
    $outputTask = $process.StandardOutput.ReadToEndAsync()
    $errorTask = $process.StandardError.ReadToEndAsync()
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $process.StandardInput.WriteLine($plain)
    $process.StandardInput.Close()
    $plain = $null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $pointer = [IntPtr]::Zero
    if (-not $process.WaitForExit(15000)) { $process.Kill(); throw 'Local check timed out.' }
    $statusLines = @($outputTask.GetAwaiter().GetResult() -split '\r?\n' | Where-Object { $_.StartsWith('CHECK: ') })
    foreach ($line in $statusLines) { Write-Host $line.Substring(7) }
    if ($statusLines.Count -eq 0) { throw 'Checker could not start. Check that Node and the project dependencies are installed.' }
} finally {
    if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    $plain = $null
    $secret.Dispose()
    if ($started -and -not $process.HasExited) { $process.Kill() }
    $process.Dispose()
}
