# One-time setup of the user-approved, new EFS-protected EX-02 instance.
# No connection to hosted PostgreSQL, Redis, Auth, Storage or Gemini.
$ErrorActionPreference = 'Stop'
$medvaultPgBin = 'C:\Users\user\MedVault-Recovery\tools\postgresql-17.11-3\pgsql\bin'
$medvaultRunRoot = 'C:\Users\user\MedVault-Recovery\ex02-20260911'
$medvaultData = Join-Path $medvaultRunRoot 'pgdata'
$medvaultPasswordFile = Join-Path $medvaultRunRoot 'restore-admin.password'
$medvaultLog = Join-Path $medvaultRunRoot 'postgres.log'
foreach ($medvaultPath in @($medvaultData, $medvaultPasswordFile, $medvaultLog)) {
    if (Test-Path -LiteralPath $medvaultPath) { throw 'Instance artifacts already exist; inspect the checkpoint before reinitializing.' }
}
if (-not ((Get-Item -LiteralPath $medvaultRunRoot).Attributes -band [IO.FileAttributes]::Encrypted)) { throw 'Recovery directory is not encrypted.' }
if (Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction SilentlyContinue) { throw 'Port 55441 is already in use.' }
$medvaultRandom = New-Object byte[] 32
$medvaultRng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $medvaultRng.GetBytes($medvaultRandom)
    # Generated credential output is created only inside the verified encrypted directory.
    [IO.File]::WriteAllText($medvaultPasswordFile, [Convert]::ToBase64String($medvaultRandom), (New-Object Text.UTF8Encoding($false)))
} finally { $medvaultRng.Dispose(); [Array]::Clear($medvaultRandom, 0, $medvaultRandom.Length) }
if (-not ((Get-Item -LiteralPath $medvaultPasswordFile).Attributes -band [IO.FileAttributes]::Encrypted)) { throw 'Generated credential is not encrypted; stop.' }
& ($medvaultPgBin + '\initdb.exe') -D $medvaultData --username=medvault_restore_admin --auth-host=scram-sha-256 --auth-local=scram-sha-256 --pwfile=$medvaultPasswordFile --encoding=UTF8 --locale-provider=libc --locale=en_US.UTF-8 --data-checksums --set=listen_addresses=127.0.0.1 --set=port=55441 --set=log_statement=none --set=log_min_error_statement=panic --set=log_error_verbosity=terse --set=log_parameter_max_length_on_error=0 --set=log_connections=off --set=log_disconnections=off --set=statement_timeout=30000 --no-clean
if ($LASTEXITCODE -ne 0) { throw 'Isolated initialization failed. Retain artifacts; do not silently substitute locale or overwrite.' }
$medvaultUnencrypted = @(Get-ChildItem -LiteralPath $medvaultData -Recurse -File | Where-Object { -not ($_.Attributes -band [IO.FileAttributes]::Encrypted) })
if ($medvaultUnencrypted.Count -gt 0) { throw 'PostgreSQL generated unencrypted files; no hosted data may be restored.' }
# pg_ctl launches its server without a service registration or visible helper window.
& ($medvaultPgBin + '\pg_ctl.exe') -D $medvaultData -l $medvaultLog -w -t 30 start
if ($LASTEXITCODE -ne 0) { throw 'Server startup outcome needs inspection; do not reinitialize.' }
$medvaultListeners = @(Get-NetTCPConnection -State Listen -LocalPort 55441 -ErrorAction Stop)
if ($medvaultListeners.Count -ne 1 -or $medvaultListeners[0].LocalAddress -ne '127.0.0.1') {
    & ($medvaultPgBin + '\pg_ctl.exe') -D $medvaultData -w -t 30 -m fast stop
    throw 'Unexpected listener; stopped isolated instance.'
}
Write-Output 'PASS: new encrypted PostgreSQL17 instance listens only on 127.0.0.1:55441 with SCRAM authentication.'
