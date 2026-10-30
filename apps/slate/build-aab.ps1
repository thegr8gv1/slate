param (
    [int]$VersionCode,
    [string]$VersionName
)

$ErrorActionPreference = "Stop"
$appJsonPath = Join-Path $PSScriptRoot "app.json"
$appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json

if (-not $VersionCode) {
    $currentCode = [int]($appJson.expo.android.versionCode)
    if ($currentCode -lt 1) { $currentCode = 2 }
    $VersionCode = $currentCode
}

if (-not $VersionName) {
    $VersionName = $appJson.expo.version
    if (-not $VersionName) { $VersionName = "1.0.1" }
}

Write-Host "Building Release AAB: package=com.slate.myapp | versionCode=$VersionCode | versionName=$VersionName" -ForegroundColor Cyan

Push-Location (Join-Path $PSScriptRoot "android")
try {
    .\gradlew.bat bundleRelease "-Pandroid.versionCode=$VersionCode" "-Pandroid.versionName=$VersionName" --console=plain
    if ($LASTEXITCODE -ne 0) {
        throw "Gradle build failed with exit code $LASTEXITCODE"
    }
} finally {
    Pop-Location
}

$sourceAab = Join-Path $PSScriptRoot "android\app\build\outputs\bundle\release\app-release.aab"
$destAab = Join-Path $PSScriptRoot "app-release.aab"
if (Test-Path $sourceAab) {
    Copy-Item $sourceAab -Destination $destAab -Force
    Write-Host "Success! Release bundle copied to: $destAab" -ForegroundColor Green
}
