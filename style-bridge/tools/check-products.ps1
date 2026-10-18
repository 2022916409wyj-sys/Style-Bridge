# Re-checks every listing in data/products.json against its own product page and writes
# data/product-checks.json. The app uses a check only when it is newer than the record's checks.checkedAt.
#
# What is read: the page's schema.org Product JSON-LD (name, price, currency, per-size availability).
# robots.txt is respected; pages that disallow automated access are skipped and stay "not verified".
# Nothing is downloaded except the product page itself; images are not copied.
#
# Usage: powershell -ExecutionPolicy Bypass -File tools/check-products.ps1
param(
  [string]$ProductsFile = (Join-Path $PSScriptRoot '..\data\products.json'),
  [string]$OutFile = (Join-Path $PSScriptRoot '..\data\product-checks.json'),
  [int]$TimeoutSec = 25
)

Add-Type -AssemblyName System.Net.Http
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AutomaticDecompression = [System.Net.DecompressionMethods]::GZip -bor [System.Net.DecompressionMethods]::Deflate
$client = New-Object System.Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds($TimeoutSec)
$client.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 StyleBridgeProductCheck/1.0')
$client.DefaultRequestHeaders.Accept.ParseAdd('text/html,application/xhtml+xml')

$data = [IO.File]::ReadAllText((Resolve-Path $ProductsFile), [Text.Encoding]::UTF8) | ConvertFrom-Json
$today = (Get-Date).ToString('yyyy-MM-dd')

$robots = @{}
function Test-Allowed([Uri]$u) {
  if (-not $robots.ContainsKey($u.Host)) {
    $txt = ''; try { $txt = $client.GetStringAsync("$($u.Scheme)://$($u.Host)/robots.txt").Result } catch { }
    $star = ''; if ($txt -match '(?is)User-agent:\s*\*\s*(.*?)(?=User-agent:|$)') { $star = $Matches[1] }
    $robots[$u.Host] = @([regex]::Matches($star, '(?im)^Disallow:\s*(\S+)') | ForEach-Object { $_.Groups[1].Value })
  }
  foreach ($d in $robots[$u.Host]) { if ($d -notmatch '[\*\$\?]' -and $u.AbsolutePath.StartsWith($d)) { return $false } }
  return $true
}
function Find-Product($node) {
  if ($null -eq $node) { return $null }
  if ($node -is [array]) { foreach ($n in $node) { $p = Find-Product $n; if ($p) { return $p } }; return $null }
  if ($node.PSObject.Properties.Name -contains '@graph') { return Find-Product $node.'@graph' }
  $t = $node.'@type'
  if ($t -eq 'Product' -or $t -eq 'ProductGroup' -or ($t -is [array] -and $t -contains 'Product')) { return $node }
  return $null
}

$results = [ordered]@{}
foreach ($p in $data.products) {
  $r = [ordered]@{ checkedAt = $today; pageVerified = $false; priceVerified = $false; price = $null; availability = 'unverified'; availabilityDetail = ''; note = '' }
  try {
    $u = [Uri]$p.url
    if (-not (Test-Allowed $u)) { $r.note = 'robots.txt disallows automated checks'; $results[$p.id] = $r; continue }
    $res = $client.GetAsync($u).Result
    if (-not $res.IsSuccessStatusCode) { $r.note = "HTTP $([int]$res.StatusCode)"; $results[$p.id] = $r; continue }
    $html = [Text.Encoding]::UTF8.GetString($res.Content.ReadAsByteArrayAsync().Result)
    $prod = $null
    foreach ($m in [regex]::Matches($html, '(?is)<script[^>]+application/ld\+json[^>]*>(.*?)</script>')) {
      try { $prod = Find-Product ($m.Groups[1].Value | ConvertFrom-Json) } catch { }
      if ($prod) { break }
    }
    if (-not $prod) { $r.note = 'No product data found on the page'; $results[$p.id] = $r; continue }
    $r.pageVerified = $true
    $offers = if ($prod.hasVariant) { @($prod.hasVariant | ForEach-Object { $_.offers }) } else { @($prod.offers) }
    $offers = @($offers | ForEach-Object { if ($_.offers) { $_.offers } else { $_ } } | Where-Object { $_ })
    if ($offers.Count) {
      $first = $offers[0]
      $amount = if ($first.price) { $first.price } else { $first.lowPrice }
      if ($amount) { $r.price = [ordered]@{ amount = [double]$amount; currency = [string]$first.priceCurrency }; $r.priceVerified = $true }
      $inStock = @($offers | Where-Object { "$($_.availability)" -match 'InStock' }).Count
      $r.availability = if ($inStock -gt 0) { 'in-stock' } else { 'out-of-stock' }
      $r.availabilityDetail = "$inStock of $($offers.Count) sizes listed in stock"
    }
  } catch {
    $r.note = "Request failed: $($_.Exception.GetBaseException().Message)"
  }
  $results[$p.id] = $r
}

$out = [ordered]@{ generatedAt = $today; method = 'Automated read of each product page''s schema.org Product data (robots.txt respected).'; results = $results }
[IO.File]::WriteAllText([IO.Path]::GetFullPath($OutFile), ($out | ConvertTo-Json -Depth 6), (New-Object Text.UTF8Encoding($false)))
$ok = @($results.Values | Where-Object { $_.pageVerified }).Count
Write-Host "Checked $($results.Count) products: $ok product pages verified. Wrote $OutFile"
