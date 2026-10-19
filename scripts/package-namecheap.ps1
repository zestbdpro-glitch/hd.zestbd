$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$workspace = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dist = [System.IO.Path]::GetFullPath((Join-Path $workspace 'dist'))
$destination = Join-Path $workspace 'zestbd-website-update.zip'
if (-not (Test-Path -LiteralPath (Join-Path $dist 'index.php'))) { throw 'Run npm run build first.' }
$stream = [System.IO.File]::Open($destination, [System.IO.FileMode]::Create)
$archive = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($file in Get-ChildItem -LiteralPath $dist -Recurse -File -Force) {
        $entry = $file.FullName.Substring($dist.Length + 1).Replace('\', '/')
        if ($entry -eq 'private/config.local.php' -or $entry -match '\.(sql|log|bak|env)$') { continue }
        if ($entry.StartsWith('uploads/') -and $entry -ne 'uploads/.htaccess') { continue }
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
} finally {
    $archive.Dispose()
    $stream.Dispose()
}
Write-Output ('Ready: zestbd-website-update.zip ({0:N0} KB). Existing config and uploaded files are excluded.' -f ((Get-Item -LiteralPath $destination).Length / 1KB))
