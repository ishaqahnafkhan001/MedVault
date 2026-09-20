# Read-only, fail-closed protection check for this approved recovery tree.
[CmdletBinding()]
param([switch]$Quiet)
$ErrorActionPreference = 'Stop'
$medvaultRoot = 'C:\Users\user\MedVault-Recovery'
$medvaultRun = Join-Path $medvaultRoot 'ex02-20260911'
$medvaultSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$medvaultSystemSid = 'S-1-5-18'
$medvaultSandboxGroupSid = 'S-1-5-21-180924767-618319654-4275595864-1003'
$medvaultExpectedSandboxMembers = @(
    'S-1-5-21-180924767-618319654-4275595864-1004',
    'S-1-5-21-180924767-618319654-4275595864-1005'
)
$medvaultSandboxMembers = @(Get-LocalGroupMember -SID $medvaultSandboxGroupSid | ForEach-Object { $_.SID.Value } | Sort-Object)
if (Compare-Object -ReferenceObject $medvaultExpectedSandboxMembers -DifferenceObject $medvaultSandboxMembers) {
    throw 'Codex sandbox group membership changed; stop.'
}
$medvaultFullControl = [int][Security.AccessControl.FileSystemRights]::FullControl
$medvaultReadOnly = [int][Security.AccessControl.FileSystemRights]'ReadAndExecute, Synchronize'
$medvaultItems = @((Get-Item -LiteralPath $medvaultRoot -Force)) + @((Get-Item -LiteralPath $medvaultRun -Force)) + @(Get-ChildItem -LiteralPath $medvaultRun -Recurse -Force)
$medvaultFiles = 0
foreach ($medvaultItem in $medvaultItems) {
    $medvaultItem.Refresh()
    if ($medvaultItem.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Recovery tree contains a reparse point; stop.' }
    if (-not ($medvaultItem.Attributes -band [IO.FileAttributes]::Encrypted)) { throw 'Recovery tree contains an unencrypted entry; stop.' }
    $medvaultAcl = Get-Acl -LiteralPath $medvaultItem.FullName
    $medvaultFullControlSids = @()
    foreach ($medvaultRule in $medvaultAcl.Access) {
        $medvaultRuleSid = $medvaultRule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($medvaultRule.AccessControlType -ne 'Allow') { throw 'Recovery tree contains a deny ACL; stop.' }
        if ($medvaultRuleSid -in @($medvaultSid, $medvaultSystemSid)) {
            if ([int]$medvaultRule.FileSystemRights -eq $medvaultFullControl) { $medvaultFullControlSids += $medvaultRuleSid }
            continue
        }
        if ($medvaultRuleSid -eq $medvaultSandboxGroupSid -and [int]$medvaultRule.FileSystemRights -eq $medvaultReadOnly) { continue }
        throw 'Recovery tree allows an unexpected principal or permission; stop.'
    }
    if ($medvaultSid -notin $medvaultFullControlSids -or $medvaultSystemSid -notin $medvaultFullControlSids) { throw 'Recovery tree is missing expected full-control ACLs; stop.' }
    if (-not $medvaultItem.PSIsContainer) { $medvaultFiles++ }
}
$medvaultExpectedThumbprint = 'FDD4B3F368BD41E4A2ADF9435762566705EF21E1'
$medvaultCriticalFiles = @(
    (Join-Path $medvaultRun 'encryption-probe.txt'),
    (Join-Path $medvaultRun 'restore-admin.password'),
    (Join-Path $medvaultRun 'snapshot-20260912T055058Z\public-data.dump')
)
$medvaultDecryptorChecks = 0
foreach ($medvaultCriticalFile in $medvaultCriticalFiles) {
    if (-not (Test-Path -LiteralPath $medvaultCriticalFile -PathType Leaf)) { continue }
    $medvaultCipherDetails = (& cipher.exe /c $medvaultCriticalFile 2>&1) -join "`n"
    if ($LASTEXITCODE -ne 0 -or (($medvaultCipherDetails -replace '\s', '') -notmatch [regex]::Escape($medvaultExpectedThumbprint))) {
        throw 'A critical recovery file is not confirmed to use the expected EFS key; stop.'
    }
    $medvaultDecryptorChecks++
}
if (-not $Quiet) { [pscustomobject]@{ result='PASS'; encryptedFiles=$medvaultFiles; aclPrincipals=3; sandboxGrant='ReadAndExecute'; efsDecryptorChecks=$medvaultDecryptorChecks; reparsePoints=0 } | ConvertTo-Json -Compress }
