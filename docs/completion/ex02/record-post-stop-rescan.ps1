# Corrective, append-only rescan after the first evidence record captured stale file attributes.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$medvaultRun = 'C:\Users\user\MedVault-Recovery\ex02-20260911'
$medvaultData = Join-Path $medvaultRun 'pgdata'
$medvaultPgBin = 'C:\Users\user\MedVault-Recovery\tools\postgresql-17.11-3\pgsql\bin'
$medvaultFolder = Join-Path $medvaultRun 'snapshot-20260912T055058Z'
$medvaultPriorEvidence = Join-Path $medvaultFolder 'post-stop-verification.json'
$medvaultEvidence = Join-Path $medvaultFolder 'post-stop-protection-rescan.json'
if (Test-Path -LiteralPath $medvaultEvidence) { throw 'Corrective evidence already exists; inspect instead of repeating.' }
$medvaultPrior = Get-Content -LiteralPath $medvaultPriorEvidence -Raw | ConvertFrom-Json
if ($medvaultPrior.result -ne 'PASS_POST_STOP_PHYSICAL_PROTECTION' -or $medvaultPrior.unencryptedFiles -ne 64) {
    throw 'The exact inconsistent predecessor record was not found; stop.'
}
if (Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction SilentlyContinue) { throw 'Restore port must be stopped for the corrective scan.' }
& (Join-Path $medvaultPgBin 'pg_ctl.exe') -D $medvaultData status | Out-Null
if ($LASTEXITCODE -ne 3) { throw 'The exact isolated server stop state is unexpected.' }
& (Join-Path $medvaultPgBin 'pg_checksums.exe') -D $medvaultData --check
if ($LASTEXITCODE -ne 0) { throw 'Repeated offline page-checksum verification failed.' }
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
$medvaultItems = @(Get-ChildItem -LiteralPath $medvaultRun -Recurse -Force)
foreach ($medvaultItem in $medvaultItems) { $medvaultItem.Refresh() }
$medvaultFiles = @($medvaultItems | Where-Object { -not $_.PSIsContainer })
$medvaultUnencrypted = @($medvaultFiles | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::Encrypted) })
$medvaultUnencryptedDirectories = @($medvaultItems | Where-Object { $_.PSIsContainer -and -not ($_.Attributes -band [IO.FileAttributes]::Encrypted) })
$medvaultReparsePoints = @($medvaultItems | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
if ($medvaultUnencrypted.Count -ne 0 -or $medvaultUnencryptedDirectories.Count -ne 0 -or $medvaultReparsePoints.Count -ne 0) {
    throw 'Corrective protection rescan failed; stop.'
}
$medvaultRecord = [ordered]@{
    result = 'PASS_POST_STOP_PROTECTION_RESCAN'
    completedAt = [DateTime]::UtcNow.ToString('o')
    supersedes = 'encryption counts only in post-stop-verification.json'
    reason = 'predecessor enumerated file attributes before the final fail-closed refresh; it is retained as inconsistent evidence'
    serverStopped = $true
    listenerCount = 0
    pageChecksumsRepeated = 'PASS'
    filesBeforeThisEvidenceRecord = $medvaultFiles.Count
    unencryptedFiles = 0
    unencryptedDirectories = 0
    reparsePoints = 0
    aclAndCriticalEfsDecryptorCheck = 'PASS'
    efsRecoveryKeyAndOffDeviceCustody = 'PENDING_OPERATOR'
    hostedMutation = $false
}
[IO.File]::WriteAllText($medvaultEvidence, (($medvaultRecord | ConvertTo-Json -Depth 4) + "`n"), (New-Object Text.UTF8Encoding($false)))
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
$medvaultRecord | ConvertTo-Json -Compress
