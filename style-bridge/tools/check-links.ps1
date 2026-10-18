# Checks each brand's official link and writes data/link-checks.json.
# A link counts as "verified" only when it answers with HTTP 2xx (after redirects)
# AND the page title or body mentions the brand name. Anything else stays unverified.
#
# Usage: powershell -ExecutionPolicy Bypass -File tools/check-links.ps1
param(
  [string]$BrandsFile = (Join-Path $PSScriptRoot '..\data\brands.json'),
  [string]$OutFile = (Join-Path $PSScriptRoot '..\data\link-checks.json'),
  [int]$TimeoutSec = 20
)

Add-Type -AssemblyName System.Net.Http
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13 }
catch { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 }

$raw = [System.IO.File]::ReadAllText((Resolve-Path $BrandsFile), [System.Text.Encoding]::UTF8)
$data = $raw | ConvertFrom-Json
$targets = @($data.brands | Where-Object { $_.officialUrl })

$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $true
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 StyleBridgeLinkCheck/1.0')
$client.DefaultRequestHeaders.Accept.ParseAdd('text/html,application/xhtml+xml')
$client.DefaultRequestHeaders.AcceptLanguage.ParseAdd('en-US,en;q=0.9')

$tasks = @{}
foreach ($b in $targets) { $tasks[$b.id] = $client.GetAsync($b.officialUrl) }

$today = (Get-Date).ToString('yyyy-MM-dd')
$results = [ordered]@{}
foreach ($b in $targets) {
  $t = $tasks[$b.id]
  $entry = [ordered]@{ url = $b.officialUrl; checkedAt = $today; status = 'unverified'; http = $null; finalUrl = $null; note = '' }
  try {
    try { [void]$t.Wait(($TimeoutSec + 5) * 1000) } catch { }
    if ($t.IsFaulted -or -not $t.IsCompleted) { throw ($(if ($t.Exception) { $t.Exception.GetBaseException().Message } else { 'timeout' })) }
    $res = $t.Result
    $entry.http = [int]$res.StatusCode
    $entry.finalUrl = $res.RequestMessage.RequestUri.AbsoluteUri
    if ($res.IsSuccessStatusCode) {
      $bytes = $res.Content.ReadAsByteArrayAsync().Result
      $body = if ($bytes) { [System.Text.Encoding]::UTF8.GetString($bytes) } else { '' }
      $title = ''
      if ($body -match '(?is)<title[^>]*>(.*?)</title>') { $title = ($Matches[1] -replace '\s+', ' ').Trim() }
      $norm = { param($s) ($s -replace '[^\p{L}\p{N}]', '').ToLower() }
      $all = @($b.name) + @($b.aliases) + @($b.nameZh) | Where-Object { $_ }
      # Long names: substring match on letters/digits only. Short names (< 4 chars, e.g. "UR", "COS"):
      # whole-word match only, so "ur" does not match "Runway".
      $long = @($all | ForEach-Object { & $norm $_ } | Where-Object { $_.Length -ge 4 -or $_ -match '[^\x00-\x7F]' })
      $short = @($all | ForEach-Object { & $norm $_ } | Where-Object { $_.Length -ge 2 -and $_.Length -lt 4 -and $_ -notmatch '[^\x00-\x7F]' })
      $match = {
        param($text)
        $n = & $norm $text
        if ($long | Where-Object { $n.Contains($_) }) { return $true }
        foreach ($s in $short) { if ($text -match "(?i)(?<![a-z0-9])$([regex]::Escape($s))(?![a-z0-9])") { return $true } }
        return $false
      }
      $blocked = $title -match '(?i)access denied|has been denied|just a moment|attention required|captcha|robot|client challenge|hang tight|verify you are human'
      $inTitle = & $match $title
      $inBody = & $match ($body.Substring(0, [Math]::Min(200000, $body.Length)))
      if ($blocked) { $entry.note = "Bot-protection page, not the real site. Title: $title" }
      elseif ($inTitle) { $entry.status = 'verified'; $entry.note = "Page title names the brand. Title: $title" }
      elseif ($inBody) { $entry.status = 'needs-review'; $entry.note = "Brand appears in page text but not the title - review by hand. Title: $title" }
      else { $entry.note = "Page responded but brand name not found. Title: $title" }
    } else {
      $entry.note = "HTTP $($entry.http) (site may block automated checks)"
    }
  } catch {
    $entry.note = "Request failed: $_"
  }
  $results[$b.id] = $entry
}

$out = [ordered]@{
  generatedAt = $today
  method = 'Automated HTTP GET of the official homepage; verified = 2xx response whose page mentions the brand name.'
  results = $results
}
$json = $out | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path (Resolve-Path (Split-Path $OutFile)) (Split-Path $OutFile -Leaf)), $json, (New-Object System.Text.UTF8Encoding($false)))

$v = @($results.Values | Where-Object { $_.status -eq 'verified' }).Count
Write-Host "Checked $($targets.Count) links: $v verified, $($targets.Count - $v) unverified. Wrote $OutFile"
