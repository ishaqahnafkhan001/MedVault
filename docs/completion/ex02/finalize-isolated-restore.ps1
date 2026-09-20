# Final offline verification for the exact, already-restored EX-02 local cluster.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$medvaultRun = 'C:\Users\user\MedVault-Recovery\ex02-20260911'
$medvaultData = Join-Path $medvaultRun 'pgdata'
$medvaultPgBin = 'C:\Users\user\MedVault-Recovery\tools\postgresql-17.11-3\pgsql\bin'
$medvaultFolder = Join-Path $medvaultRun 'snapshot-20260912T055058Z'
$medvaultRestoreResult = Join-Path $medvaultFolder 'restore-result.json'
$medvaultEvidence = Join-Path $medvaultFolder 'post-stop-verification.json'
if (Test-Path -LiteralPath $medvaultEvidence) { throw 'Post-stop evidence already exists; inspect instead of repeating.' }
$medvaultResult = Get-Content -LiteralPath $medvaultRestoreResult -Raw | ConvertFrom-Json
if ($medvaultResult.result -ne 'PASS_APPLICATION_LOGICAL_RESTORE' -or $medvaultResult.hostedMutation -ne $false) { throw 'Expected restore result is unavailable.' }
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
& (Join-Path $medvaultPgBin 'pg_ctl.exe') -D $medvaultData status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The exact isolated server is not running; inspect before finalization.' }
$medvaultListeners = @(Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction Stop)
if ($medvaultListeners.Count -ne 1 -or $medvaultListeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected restore listener; stop.' }
& (Join-Path $medvaultPgBin 'pg_ctl.exe') -D $medvaultData -m fast -w -t 30 stop
if ($LASTEXITCODE -ne 0) { throw 'Exact isolated-server stop needs inspection.' }
if (Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction SilentlyContinue) { throw 'Restore port remains active after stop.' }
& (Join-Path $medvaultPgBin 'pg_checksums.exe') -D $medvaultData --check
if ($LASTEXITCODE -ne 0) { throw 'Offline page-checksum verification failed.' }
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
$medvaultFiles = @(Get-ChildItem -LiteralPath $medvaultRun -Recurse -Force -File)
foreach ($medvaultFile in $medvaultFiles) { $medvaultFile.Refresh() }
$medvaultUnencryptedFiles = @($medvaultFiles | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::Encrypted) })
if ($medvaultUnencryptedFiles.Count -ne 0) { throw 'Post-stop file scan found an unencrypted file; no PASS evidence may be written.' }
$medvaultRecord = [ordered]@{
    result = 'PASS_POST_STOP_PHYSICAL_PROTECTION'
    completedAt = [DateTime]::UtcNow.ToString('o')
    dataDirectory = 'approved EX-02 recovery tree'
    serverStopped = $true
    listenerCount = 0
    postgresMajor = 17
    pageChecksums = 'PASS'
    encryptedFiles = $medvaultFiles.Count
    unencryptedFiles = $medvaultUnencryptedFiles.Count
    reparsePoints = @(Get-ChildItem -LiteralPath $medvaultRun -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count
    acl = 'current user and SYSTEM FullControl; fixed Codex sandbox group ReadAndExecute only; EFS decryptor independently checked'
    efsRecoveryKeyAndOffDeviceCustody = 'PENDING_OPERATOR'
    hostedMutation = $false
}
[IO.File]::WriteAllText($medvaultEvidence, (($medvaultRecord | ConvertTo-Json -Depth 4) + "`n"), (New-Object Text.UTF8Encoding($false)))
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
$medvaultRecord | ConvertTo-Json -Compress
