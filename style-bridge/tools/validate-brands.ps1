# Validates data/brands.json against data/vocab.json and the rules in data/SCHEMA.md.
# Exit code 1 if any error is found. Warnings do not fail the run.
# Usage: powershell -ExecutionPolicy Bypass -File tools/validate-brands.ps1 [-BrandsFile path]
param(
  [string]$BrandsFile = (Join-Path $PSScriptRoot '..\data\brands.json'),
  [string]$VocabFile = (Join-Path $PSScriptRoot '..\data\vocab.json')
)

$utf8 = [System.Text.Encoding]::UTF8
$data = [System.IO.File]::ReadAllText((Resolve-Path $BrandsFile), $utf8) | ConvertFrom-Json
$vocab = [System.IO.File]::ReadAllText((Resolve-Path $VocabFile), $utf8) | ConvertFrom-Json

$errors = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]
function Ids($group) { @($vocab.$group | ForEach-Object { [string]$_.id }) }

$allowed = @{
  departments = Ids 'departments'; styles = Ids 'styles'; categories = Ids 'categories'; fits = Ids 'fits'
  colors = Ids 'colors'; occasions = Ids 'occasions'; sizes = Ids 'sizes'
}
$countries = Ids 'countries'; $avail = Ids 'usAvailability'; $storeStatus = Ids 'storeStatus'; $segments = Ids 'segments'
$required = 'id', 'name', 'aliases', 'country', 'segment', 'knownInChina', 'usAvailability', 'departments', 'styles', 'categories', 'price', 'officialUrl', 'online', 'hasStores', 'stores', 'intro', 'similarTo', 'source', 'lastVerified'

$ids = @{}; $aliasOwner = @{}
foreach ($b in $data.brands) {
  $id = $b.id
  foreach ($f in $required) { if (-not ($b.PSObject.Properties.Name -contains $f)) { $errors.Add("[$id] missing field '$f'") } }
  if ($id -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { $errors.Add("[$id] id must be lowercase-kebab-case") }
  if ($ids.ContainsKey($id)) { $errors.Add("[$id] duplicate id") } else { $ids[$id] = $b }

  # Duplicate brands usually show up as the same alias on two records.
  foreach ($a in @($b.aliases) + @($b.name.ToLower())) {
    $k = ([string]$a).ToLower().Trim()
    if (-not $k) { continue }
    if ($aliasOwner.ContainsKey($k) -and $aliasOwner[$k] -ne $id) { $errors.Add("[$id] alias '$k' also used by [$($aliasOwner[$k])] - possible duplicate brand") }
    else { $aliasOwner[$k] = $id }
  }

  if ($countries -notcontains $b.country) { $errors.Add("[$id] unknown country '$($b.country)' (add it to vocab.json countries)") }
  if ($segments -notcontains $b.segment) { $errors.Add("[$id] unknown segment '$($b.segment)'") }
  if ($avail -notcontains $b.usAvailability) { $errors.Add("[$id] bad usAvailability '$($b.usAvailability)'") }
  foreach ($g in $allowed.Keys) {
    foreach ($v in @($b.$g)) { if ($v -and $allowed[$g] -notcontains $v) { $errors.Add("[$id] unknown $g value '$v'") } }
  }
  if (@($b.styles).Count -eq 0) { $errors.Add("[$id] needs at least one style") }
  if (@($b.categories).Count -eq 0) { $errors.Add("[$id] needs at least one category") }

  $tiers = @($b.price.tiers)
  if ($tiers.Count -eq 0 -or ($tiers | Where-Object { $_ -lt 1 -or $_ -gt 4 })) { $errors.Add("[$id] price.tiers must be 1-4") }
  if ($b.price.status -notin 'estimate', 'verified') { $errors.Add("[$id] price.status must be 'estimate' or 'verified'") }
  if ($b.price.status -eq 'verified' -and -not $b.lastVerified) { $errors.Add("[$id] price marked verified but lastVerified is empty") }

  if ($b.officialUrl -and $b.officialUrl -notmatch '^https://[^\s]+$') { $errors.Add("[$id] officialUrl must be an https URL") }
  if (-not $b.officialUrl) { $warnings.Add("[$id] no official link on file") }
  if ($b.usAvailability -eq 'yes' -and -not $b.officialUrl) { $errors.Add("[$id] sold in US but has no official link") }
  if ($b.usAvailability -eq 'yes' -and $null -eq $b.online -and -not $b.hasStores) { $warnings.Add("[$id] sold in US but neither online nor stores is confirmed") }

  if ($storeStatus -notcontains $b.stores.status) { $errors.Add("[$id] bad stores.status '$($b.stores.status)'") }
  if ($b.stores.status -eq 'verified' -and -not $b.lastVerified) { $errors.Add("[$id] stores marked verified but lastVerified is empty") }
  if ($b.stores.status -eq 'none' -and $b.stores.summary) { $warnings.Add("[$id] stores.status is 'none' but a summary is set") }
  if ($b.lastVerified -and $b.lastVerified -notmatch '^\d{4}-\d{2}-\d{2}$') { $errors.Add("[$id] lastVerified must be YYYY-MM-DD or empty") }
  if ($b.source -notin 'editorial', 'official', 'partner-feed') { $errors.Add("[$id] source must be editorial, official or partner-feed") }

  if ($b.PSObject.Properties.Name -contains 'items') { $errors.Add("[$id] legacy 'items' field found - product listings belong in data/products.json") }
}

# Product listings (data/products.json): every record must point at a real brand page we checked.
$productsFile = Join-Path (Split-Path $BrandsFile) 'products.json'
$productCount = 0
if (Test-Path $productsFile) {
  $pdata = [System.IO.File]::ReadAllText((Resolve-Path $productsFile), $utf8) | ConvertFrom-Json
  $seenProducts = @{}
  foreach ($p in $pdata.products) {
    $productCount++
    $prodId = $p.id
    if ($seenProducts.ContainsKey($prodId)) { $errors.Add("[product $prodId] duplicate id") } else { $seenProducts[$prodId] = 1 }
    if (-not $ids.ContainsKey($p.brandId)) { $errors.Add("[product $prodId] unknown brandId '$($p.brandId)'"); continue }
    if (-not $p.name) { $errors.Add("[product $prodId] missing name") }
    if ($allowed.categories -notcontains $p.category) { $errors.Add("[product $prodId] unknown category '$($p.category)'") }
    if ($p.url -notmatch '^https://[^\s]+$') { $errors.Add("[product $prodId] url must be an exact https product-page URL") }
    $brandHost = ([Uri]$ids[$p.brandId].officialUrl).Host -replace '^(www|us)\.', ''
    if ($p.url -and ([Uri]$p.url).Host -notlike "*$brandHost") { $warnings.Add("[product $prodId] url host differs from the brand's official site ($brandHost) - make sure it is an authorized retailer") }
    if ($p.image -and $p.image.url -and $p.image.url -notmatch '^https://') { $errors.Add("[product $prodId] image.url must be https") }
    if ($p.image -and -not $p.image.alt) { $errors.Add("[product $prodId] image needs alt text") }
    if (-not ($p.price.amount -is [double] -or $p.price.amount -is [int] -or $p.price.amount -is [decimal])) { $errors.Add("[product $prodId] price.amount must be a number") }
    if ($p.price.currency -notmatch '^[A-Z]{3}$') { $errors.Add("[product $prodId] price.currency must be an ISO code like USD") }
    if ($p.checks.checkedAt -notmatch '^\d{4}-\d{2}-\d{2}$') { $errors.Add("[product $prodId] checks.checkedAt must be YYYY-MM-DD") }
    if ($p.checks.availability -notin 'in-stock', 'out-of-stock', 'unverified') { $errors.Add("[product $prodId] checks.availability must be in-stock, out-of-stock or unverified") }
  }
}

# Cross-references
foreach ($b in $data.brands) {
  foreach ($s in @($b.similarTo)) {
    if (-not $s -or -not $s.id) { $errors.Add("[$($b.id)] similarTo entry without an id"); continue }
    if (-not $ids.ContainsKey($s.id)) { $errors.Add("[$($b.id)] similarTo references unknown id '$($s.id)'") }
    if ($s.id -eq $b.id) { $errors.Add("[$($b.id)] similarTo references itself") }
  }
}

$us = @($data.brands | Where-Object { $_.usAvailability -eq 'yes' }).Count
$cn = @($data.brands | Where-Object { $_.country -eq 'CN' }).Count
$segs = ($data.brands | Group-Object segment | ForEach-Object { "$($_.Name) $($_.Count)" }) -join ', '
Write-Host "Brands: $(@($data.brands).Count) total | $us listed as sold in the US | $cn from China | segments: $segs"
Write-Host "Products: $productCount verified demo listings"
$warnings | ForEach-Object { Write-Host "WARN  $_" -ForegroundColor Yellow }
$errors | ForEach-Object { Write-Host "ERROR $_" -ForegroundColor Red }
if ($errors.Count) { Write-Host "$($errors.Count) error(s)." -ForegroundColor Red; exit 1 }
Write-Host "OK - no errors ($($warnings.Count) warning(s))." -ForegroundColor Green
