# Run interactively in your own PowerShell window, never paste the password into chat.
# Exports only the EFS key used by the approved MedVault recovery directory.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$medvaultExpectedThumbprint = 'FDD4B3F368BD41E4A2ADF9435762566705EF21E1'
$medvaultProbePath = 'C:\Users\user\MedVault-Recovery\ex02-20260911\encryption-probe.txt'
$medvaultKeyDirectory = 'C:\Users\user\MedVault-Key-Recovery'
$medvaultPfxPath = Join-Path $medvaultKeyDirectory 'medvault-ex02-efs-recovery.pfx'
$medvaultCertificate = Get-Item -LiteralPath "Cert:\CurrentUser\My\$medvaultExpectedThumbprint"
if (-not $medvaultCertificate.HasPrivateKey) { throw 'Expected EFS private key is unavailable.' }
if (-not ((Get-Item -LiteralPath $medvaultProbePath).Attributes -band [IO.FileAttributes]::Encrypted)) {
    throw 'The expected encrypted recovery probe is missing or unprotected.'
}
$medvaultCipherDetails = (& cipher.exe /c $medvaultProbePath 2>&1) -join "`n"
if ($LASTEXITCODE -ne 0 -or (($medvaultCipherDetails -replace '\s', '') -notmatch [regex]::Escape($medvaultExpectedThumbprint))) {
    throw 'The probe is not confirmed to use the expected EFS key; nothing was exported.'
}
if (Test-Path -LiteralPath $medvaultPfxPath) { throw 'Recovery export already exists; do not overwrite it.' }
if (Test-Path -LiteralPath $medvaultKeyDirectory) { throw 'Key directory exists; inspect its ACL and contents before reuse.' }

Write-Host 'Choose a NEW recovery password (at least 16 characters). Store it in your password manager.'
Write-Host 'Do not enter your Windows, Supabase, database, or other existing account password.'
$medvaultPassword = Read-Host 'Recovery password' -AsSecureString
$medvaultConfirmation = Read-Host 'Confirm recovery password' -AsSecureString
$medvaultFirstPointer = [IntPtr]::Zero
$medvaultSecondPointer = [IntPtr]::Zero
$medvaultImportedCertificate = $null
try {
    if ($medvaultPassword.Length -lt 16) { throw 'Recovery password must have at least 16 characters.' }
    $medvaultFirstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($medvaultPassword)
    $medvaultSecondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($medvaultConfirmation)
    $medvaultMismatch = $medvaultPassword.Length -bxor $medvaultConfirmation.Length
    for ($medvaultIndex = 0; $medvaultIndex -lt [Math]::Min($medvaultPassword.Length, $medvaultConfirmation.Length); $medvaultIndex++) {
        $medvaultMismatch = $medvaultMismatch -bor ([Runtime.InteropServices.Marshal]::ReadInt16($medvaultFirstPointer, 2 * $medvaultIndex) -bxor [Runtime.InteropServices.Marshal]::ReadInt16($medvaultSecondPointer, 2 * $medvaultIndex))
    }
    if ($medvaultMismatch -ne 0) {
        throw 'Passwords do not match; nothing was exported.'
    }
    $medvaultSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $medvaultAcl = New-Object Security.AccessControl.DirectorySecurity
    $medvaultAcl.SetOwner($medvaultSid)
    $medvaultAcl.SetAccessRuleProtection($true, $false)
    $medvaultAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($medvaultSid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    $medvaultAcl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier('S-1-5-18')), 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
    New-Item -ItemType Directory -Path $medvaultKeyDirectory | Out-Null
    Set-Acl -LiteralPath $medvaultKeyDirectory -AclObject $medvaultAcl
    if ((Get-Item -LiteralPath $medvaultKeyDirectory).Attributes -band [IO.FileAttributes]::Encrypted) {
        throw 'Recovery key must not depend on the same EFS key; choose a separately protected export destination.'
    }
    Export-PfxCertificate -Cert $medvaultCertificate -FilePath $medvaultPfxPath -Password $medvaultPassword -CryptoAlgorithmOption AES256_SHA256 -ChainOption EndEntityCertOnly -NoProperties -NoClobber | Out-Null
    $medvaultImportedCertificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2
    $medvaultImportedCertificate.Import($medvaultPfxPath, $medvaultPassword, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    if (-not $medvaultImportedCertificate.HasPrivateKey -or $medvaultImportedCertificate.Thumbprint -ne $medvaultExpectedThumbprint) {
        throw 'Exported key verification failed. Retain the file for investigation; backup gate remains open.'
    }
    Write-Host 'PASS: password-protected AES-256 PFX reloaded with the expected private key; no certificate-store change.'
    Write-Host "Recovery file: $medvaultPfxPath"
    Write-Host 'Copy the PFX to your approved offline recovery storage. Keep its password separately in your password manager.'
    Write-Host 'Do not delete your Windows profile, EFS certificate or this export. Never commit or upload it to this chat.'
} finally {
    if ($medvaultFirstPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($medvaultFirstPointer) }
    if ($medvaultSecondPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($medvaultSecondPointer) }
    if ($medvaultImportedCertificate) { $medvaultImportedCertificate.Dispose() }
    $medvaultPassword.Dispose()
    $medvaultConfirmation.Dispose()
}
