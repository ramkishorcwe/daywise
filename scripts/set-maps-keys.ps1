$ErrorActionPreference = 'Stop'

function Read-MapsKey([string] $Prompt) {
    while ($true) {
        $mapsSecureValue = Read-Host -Prompt $Prompt -AsSecureString
        $mapsKeyPointer = [IntPtr]::Zero
        try {
            $mapsKeyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($mapsSecureValue)
            $mapsPlainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($mapsKeyPointer).Trim()
            if ($mapsPlainValue -cmatch '^AIza[A-Za-z0-9_-]{35}$') {
                return $mapsPlainValue
            }
            Write-Host ('Invalid format: expected 39 characters beginning with AIza; received {0} characters. Copy only the API key value from Show key or get-key-string, without quotes. No settings were changed. Retry, or press Ctrl+C to cancel.' -f $mapsPlainValue.Length)
            $mapsPlainValue = $null
        } finally {
            if ($mapsKeyPointer -ne [IntPtr]::Zero) {
                [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($mapsKeyPointer)
            }
            $mapsSecureValue.Dispose()
        }
    }
}

$mapsServerKey = Read-MapsKey 'Paste Daywise Server API key (hidden)'
do {
    $mapsBrowserKey = Read-MapsKey 'Paste Daywise Browser Map API key (hidden)'
    if ($mapsServerKey -ceq $mapsBrowserKey) {
        Write-Host 'The server and browser keys must be different. No settings were changed. Paste the separate browser key, or press Ctrl+C to cancel.'
    }
} while ($mapsServerKey -ceq $mapsBrowserKey)

$mapsEnvPath = Join-Path (Split-Path -Parent $PSScriptRoot) '.env'
$mapsEnvText = if (Test-Path -LiteralPath $mapsEnvPath) { [IO.File]::ReadAllText($mapsEnvPath) } else { '' }
$mapsNewline = if ($mapsEnvText.Contains("`r`n")) { "`r`n" } else { "`n" }
$mapsValues = [ordered]@{
    GOOGLE_PLACES_API_KEY = $mapsServerKey
    GOOGLE_GEOCODING_API_KEY = $mapsServerKey
    GOOGLE_TIME_ZONE_API_KEY = $mapsServerKey
    GOOGLE_ROUTES_API_KEY = $mapsServerKey
    VITE_GOOGLE_MAPS_BROWSER_KEY = $mapsBrowserKey
}
foreach ($mapsField in $mapsValues.Keys) {
    $mapsPattern = '(?m)^[ \t]*(?:export[ \t]+)?' + [regex]::Escape($mapsField) + '[ \t]*=[^\r\n]*'
    $mapsAssignment = $mapsField + '=' + $mapsValues[$mapsField]
    if ([regex]::IsMatch($mapsEnvText, $mapsPattern)) {
        $mapsEnvText = [regex]::Replace($mapsEnvText, $mapsPattern, $mapsAssignment)
    } else {
        if ($mapsEnvText.Length -gt 0 -and -not $mapsEnvText.EndsWith("`n")) { $mapsEnvText += $mapsNewline }
        $mapsEnvText += $mapsAssignment + $mapsNewline
    }
}
[IO.File]::WriteAllText($mapsEnvPath, $mapsEnvText, (New-Object System.Text.UTF8Encoding($false)))
Write-Host 'Saved the two Maps keys in .env. Existing Firebase and other settings were preserved. Restart the API and Vite to load them.'
