param([ValidateRange(1,9999)][int]$StartAt=1, [ValidateRange(1,9999)][int]$EndAt=8, [ValidatePattern('^(Personal|tempwallet)[1-9][0-9]{0,3}$')][string]$Name, [switch]$CheckOnly, [switch]$FromClipboard, [switch]$ValidateOnly, [switch]$SelfTest)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$helperPath = Join-Path $PSScriptRoot 'import-personal-wallet.mjs'
$envPath = Join-Path $projectRoot '.env.local'
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $envPath)) { throw 'Missing project .env.local.' }

function Read-ImportPrivateKey {
    param([string]$AccountName)
    $secret = New-Object Security.SecureString
    Write-Host "Private key for ${AccountName} (Ctrl+V to paste, Enter to submit): " -NoNewline
    try {
        while ($true) {
            $key = [Console]::ReadKey($true)
            $control = ($key.Modifiers -band [ConsoleModifiers]::Control) -ne 0
            $shift = ($key.Modifiers -band [ConsoleModifiers]::Shift) -ne 0
            if (($control -and $key.Key -eq [ConsoleKey]::C) -or [int]$key.KeyChar -eq 3) {
                throw 'Import cancelled. No key was submitted.'
            }
            if ($key.Key -eq [ConsoleKey]::Enter) {
                Write-Host ''
                return $secret
            }
            if ($key.Key -eq [ConsoleKey]::Backspace) {
                if ($secret.Length -gt 0) { $secret.RemoveAt($secret.Length - 1); Write-Host "`b `b" -NoNewline }
                continue
            }
            if (($control -and $key.Key -eq [ConsoleKey]::V) -or [int]$key.KeyChar -eq 22 -or ($shift -and $key.Key -eq [ConsoleKey]::Insert)) {
                $pasted = Get-Clipboard -Raw
                try {
                    if ($pasted) {
                        $pasted = $pasted.Trim()
                        if ($secret.Length + $pasted.Length -gt 256) { throw 'Input is too long. Copy only the private key and retry.' }
                        foreach ($character in $pasted.ToCharArray()) { $secret.AppendChar($character); Write-Host '*' -NoNewline }
                    }
                } finally { $pasted = $null }
                continue
            }
            if (-not [char]::IsControl($key.KeyChar)) {
                if ($secret.Length -ge 256) { throw 'Input is too long. Copy only the private key and retry.' }
                $secret.AppendChar($key.KeyChar)
                Write-Host '*' -NoNewline
            }
        }
    } catch {
        $secret.Dispose()
        Write-Host ''
        throw
    }
}

function Invoke-PersonalImport {
    param([string]$AccountName, [Security.SecureString]$Secret)
    $startInfo = New-Object System.Diagnostics.ProcessStartInfo
    $startInfo.FileName = $nodePath
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.Arguments = '--use-system-ca --env-file="' + $envPath + '" "' + $helperPath + '" ' + $AccountName
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.RedirectStandardOutput = $true
    $process = New-Object System.Diagnostics.Process
    $process.StartInfo = $startInfo
    $pointer = [IntPtr]::Zero
    $started = $false
    try {
        [void]$process.Start()
        $started = $true
        $ignoredErrors = $process.StandardError.ReadToEndAsync()
        $safeOutput = $process.StandardOutput.ReadToEndAsync()
        if ($null -ne $Secret) {
            $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
            $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
            $process.StandardInput.WriteLine($plain)
            $plain = $null
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
            $pointer = [IntPtr]::Zero
        }
        $process.StandardInput.Close()
        if (-not $process.WaitForExit(180000)) { $process.Kill(); throw 'CDP timed out. Rerun using the same name and key.' }
        $statusLines = @($safeOutput.GetAwaiter().GetResult() -split '\r?\n' | Where-Object { $_.StartsWith('ARC_IMPORT: ') } | ForEach-Object { $_.Substring(12) })
        foreach ($statusLine in $statusLines) { Write-Host $statusLine }
        if ($process.ExitCode -ne 0) {
            $reason = $statusLines -join ' '
            if (-not $reason) {
                # Never display raw Node/SDK stderr: it can contain request data.
                $startupError = $ignoredErrors.GetAwaiter().GetResult()
                if ($startupError -match 'bad option:|unknown option') { $reason = 'Node does not support the required options. Install Node 24 LTS.' }
                elseif ($startupError -match 'ERR_MODULE_NOT_FOUND|Cannot find module') { $reason = 'A Node dependency is missing. Run npm ci in the project folder.' }
                else { $reason = 'The Node helper stopped before reporting a safe status. Check Node and project dependencies.' }
            }
            throw ('Import stopped: ' + $reason + ' Existing imports are retained.')
        }
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $plain = $null
        if ($started -and -not $process.HasExited) { $process.Kill() }
        $process.Dispose()
    }
}

if ($SelfTest) {
    # Disposable public test value. Never imports an account or contacts CDP.
    $testSecret = ConvertTo-SecureString (('0' * 63) + '1') -AsPlainText -Force
    try { Invoke-PersonalImport -AccountName '--validate' -Secret $testSecret }
    finally { $testSecret.Dispose() }
    return
}
if (-not $ValidateOnly) { Invoke-PersonalImport -AccountName '--check' }
if ($CheckOnly) { return }
if ($Name -and ($PSBoundParameters.ContainsKey('StartAt') -or $PSBoundParameters.ContainsKey('EndAt'))) { throw 'Use either Name or StartAt/EndAt.' }
if (-not $Name -and $EndAt -lt $StartAt) { throw 'EndAt must be at least StartAt. For one wallet, set both to the same number.' }
Write-Host 'Importing personal CDP wallets. Keys are hidden. Ctrl+C stops the process.'
Write-Host 'Only names and public addresses are saved. No website, X, or Telegram links are created.'
$accountNames = if ($Name) { @($Name) } else { @($StartAt..$EndAt | ForEach-Object { 'Personal' + $_ }) }
foreach ($accountName in $accountNames) {
    if ($FromClipboard) {
        [void](Read-Host "Copy the key for $accountName, then press Enter here (do not paste it)")
        $clipboardKey = Get-Clipboard -Raw
        if (-not $clipboardKey) { throw 'Clipboard is empty. Copy the private key first.' }
        try { $secureKey = ConvertTo-SecureString $clipboardKey -AsPlainText -Force }
        finally { $clipboardKey = $null }
    } else {
        $secureKey = Read-ImportPrivateKey -AccountName $accountName
    }
    try { Invoke-PersonalImport -AccountName $(if ($ValidateOnly) { '--validate' } else { $accountName }) -Secret $secureKey }
    finally { $secureKey.Dispose() }
    if ($ValidateOnly) { return }
}
Write-Host 'Done. Public address list: .deployment-private/personal-wallets.json'
