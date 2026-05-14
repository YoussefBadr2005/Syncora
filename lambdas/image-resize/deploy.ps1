param(
  [string]$FunctionName = "ImageResizeLambda",
  [string]$Region = "us-east-1"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot

Write-Host "Building TypeScript..."
npm run build

Write-Host "Installing Linux x64 sharp binary..."
npm install --os=linux --cpu=x64 sharp

Write-Host "Creating deployment package..."
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Stage everything into a temp folder then zip it
$stage = Join-Path $env:TEMP "lambda-stage-$(Get-Random)"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item -Path (Join-Path $root "dist\*")         -Destination $stage              -Recurse
Copy-Item -Path (Join-Path $root "node_modules")   -Destination (Join-Path $stage "node_modules") -Recurse

$zip = Join-Path $root "function.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }

[System.IO.Compression.ZipFile]::CreateFromDirectory($stage, $zip)

Remove-Item $stage -Recurse -Force

$sizeMB = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "Package ready: function.zip ($sizeMB MB)"

Write-Host "Uploading to Lambda..."
$result = aws lambda update-function-code `
  --function-name $FunctionName `
  --zip-file "fileb://$zip" `
  --region $Region `
  --output json | ConvertFrom-Json

Write-Host "Done. Lambda updated: $($result.FunctionName) | Size: $($result.CodeSize) bytes | Modified: $($result.LastModified)"
