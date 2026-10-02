param(
  [Parameter(Mandatory = $true)]
  [string]$LockPath,
  [Parameter(Mandatory = $true)]
  [string]$MetadataBase64
)

$ErrorActionPreference = 'Stop'
$stream = $null
$exitCode = 0

try {
  $options = [System.IO.FileOptions]::DeleteOnClose -bor [System.IO.FileOptions]::WriteThrough
  try {
    $stream = [System.IO.FileStream]::new(
      $LockPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::Read,
      4096,
      $options
    )
  } catch [System.NotSupportedException] {
    $stream = [System.IO.FileStream]::new(
      $LockPath,
      [System.IO.FileMode]::CreateNew,
      [System.IO.FileAccess]::ReadWrite,
      [System.IO.FileShare]::Read,
      4096,
      [System.IO.FileOptions]::DeleteOnClose
    )
  }
} catch [System.IO.IOException] {
  $exitCode = 75
} catch [System.UnauthorizedAccessException] {
  # A directory collision cannot be opened as a FileStream. Treat it exactly
  # like an existing file and leave it untouched.
  $exitCode = 75
} catch {
  $exitCode = 1
}

try {
  if ($null -ne $stream) {
    $metadata = [System.Text.Encoding]::UTF8.GetString(
      [System.Convert]::FromBase64String($MetadataBase64)
    )
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($metadata)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
    [System.Console]::Out.WriteLine('LINE_OPERATION_LOCK_READY')
    $null = [System.Console]::In.ReadLine()
  }
} catch {
  $exitCode = 1
} finally {
  if ($null -ne $stream) {
    try {
      $stream.Dispose()
    } catch {
      $exitCode = 1
    }
  }
}

exit $exitCode
