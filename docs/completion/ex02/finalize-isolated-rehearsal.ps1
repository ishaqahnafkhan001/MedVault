# Stops and verifies the exact local EX-02 cluster after the migration rehearsal.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$medvaultRun = 'C:\Users\user\MedVault-Recovery\ex02-20260911'
$medvaultData = Join-Path $medvaultRun 'pgdata'
$medvaultPgBin = 'C:\Users\user\MedVault-Recovery\tools\postgresql-17.11-3\pgsql\bin'
$medvaultFolder = Join-Path $medvaultRun 'snapshot-20260912T055058Z'
$medvaultMigrationEvidence = Join-Path $medvaultFolder 'migration-rehearsal-result.json'
$medvaultPrismaEvidence = Join-Path $medvaultFolder 'prisma-runtime-rehearsal-result.json'
$medvaultStopEvidence = Join-Path $medvaultFolder 'post-rehearsal-stop-result.json'
if (Test-Path -LiteralPath $medvaultStopEvidence) { throw 'Post-rehearsal stop evidence already exists; inspect instead of repeating.' }
$medvaultMigration = Get-Content -LiteralPath $medvaultMigrationEvidence -Raw | ConvertFrom-Json
$medvaultPrisma = Get-Content -LiteralPath $medvaultPrismaEvidence -Raw | ConvertFrom-Json
if ($medvaultMigration.result -ne 'PASS_LOCAL_MIGRATION_AND_SECURITY_REHEARSAL' -or
    $medvaultPrisma.result -ne 'PASS_LOCAL_PRISMA_RUNTIME_REHEARSAL' -or
    $medvaultMigration.hostedMutation -ne $false -or
    $medvaultPrisma.hostedMutation -ne $false -or
    $medvaultMigration.syntheticRowsRetained -ne $false -or
    $medvaultPrisma.syntheticRowsRetained -ne $false) {
    throw 'Successful local-only rehearsal evidence is required before finalization.'
}
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
& (Join-Path $medvaultPgBin 'pg_ctl.exe') -D $medvaultData status | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The exact rehearsal server is not running; inspect before finalization.' }
$medvaultListeners = @(Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction Stop)
if ($medvaultListeners.Count -ne 1 -or $medvaultListeners[0].LocalAddress -ne '127.0.0.1') { throw 'Unexpected rehearsal listener; stop.' }
& (Join-Path $medvaultPgBin 'pg_ctl.exe') -D $medvaultData -m fast -w -t 30 stop
if ($LASTEXITCODE -ne 0) { throw 'Exact isolated-server stop needs inspection.' }
if (Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction SilentlyContinue) { throw 'Restore port remains active after stop.' }
& (Join-Path $medvaultPgBin 'pg_checksums.exe') -D $medvaultData --check
if ($LASTEXITCODE -ne 0) { throw 'Offline page-checksum verification failed.' }
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
$medvaultEntries = @(Get-ChildItem -LiteralPath $medvaultRun -Recurse -Force)
foreach ($medvaultEntry in $medvaultEntries) { $medvaultEntry.Refresh() }
$medvaultFiles = @($medvaultEntries | Where-Object { -not $_.PSIsContainer })
$medvaultUnencrypted = @($medvaultEntries | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::Encrypted) })
$medvaultReparse = @($medvaultEntries | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint })
if ($medvaultUnencrypted.Count -ne 0 -or $medvaultReparse.Count -ne 0) { throw 'Post-rehearsal protection scan failed.' }
$medvaultRecord = [ordered]@{
    result = 'PASS_POST_REHEARSAL_OFFLINE_PROTECTION'
    completedAt = [DateTime]::UtcNow.ToString('o')
    database = 'medvault_ex02_restore_20260912'
    serverStopped = $true
    listenerCount = 0
    postgresMajor = 17
    pageChecksums = 'PASS'
    encryptedFiles = $medvaultFiles.Count
    unencryptedEntries = $medvaultUnencrypted.Count
    reparsePoints = $medvaultReparse.Count
    migrationRehearsal = $medvaultMigration.result
    prismaRuntimeRehearsal = $medvaultPrisma.result
    syntheticRowsRetained = $false
    runtimeRoleLoginEnabled = $false
    hostedMutation = $false
    durableKeyAndOffDeviceCustody = 'PENDING_OPERATOR'
}
[IO.File]::WriteAllText($medvaultStopEvidence, (($medvaultRecord | ConvertTo-Json -Depth 4) + "`n"), (New-Object Text.UTF8Encoding($false)))
& (Join-Path $PSScriptRoot 'assert-recovery-protection.ps1') -Quiet
$medvaultRecord | ConvertTo-Json -Compress
