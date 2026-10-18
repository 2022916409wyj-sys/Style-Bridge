# Round-trips data/brands.json <-> CSV so the library can be edited in Excel / Google Sheets.
#   Export: powershell -ExecutionPolicy Bypass -File tools/brands-csv.ps1 -Export [-CsvFile data/brands.csv]
#   Import: powershell -ExecutionPolicy Bypass -File tools/brands-csv.ps1 -Import [-CsvFile data/brands.csv]
# List fields use "|" between values (e.g. "minimal|classic"). similarTo is JSON text in one cell. Product listings live in data/products.json.
# Import writes brands.json and then runs validate-brands.ps1; fix any reported errors before committing.
param(
  [switch]$Export,
  [switch]$Import,
  [string]$CsvFile = (Join-Path $PSScriptRoot '..\data\brands.csv'),
  [string]$JsonFile = (Join-Path $PSScriptRoot '..\data\brands.json')
)

$utf8 = New-Object System.Text.UTF8Encoding($true)   # BOM so Excel opens Chinese text correctly
$listFields = 'aliases', 'departments', 'styles', 'categories', 'fits', 'colors', 'occasions', 'sizes'
$columns = 'id', 'name', 'nameZh', 'aliases', 'country', 'segment', 'knownInChina', 'usAvailability', 'departments', 'styles', 'categories', 'fits', 'colors', 'occasions', 'sizes',
  'priceTiers', 'priceNote', 'priceStatus', 'officialUrl', 'online', 'hasStores', 'storesStatus', 'storesSummary', 'intro', 'source', 'lastVerified', 'similarToJson'

function BoolText($v) { if ($null -eq $v) { '' } elseif ($v) { 'true' } else { 'false' } }
function TextBool($s) { if ($s -eq 'true') { $true } elseif ($s -eq 'false') { $false } else { $null } }
function Split-List($s) { if ([string]::IsNullOrWhiteSpace($s)) { ,@() } else { ,@($s.Split('|') | ForEach-Object { $_.Trim() } | Where-Object { $_ }) } }

if ($Export) {
  $data = [System.IO.File]::ReadAllText((Resolve-Path $JsonFile), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $rows = foreach ($b in $data.brands) {
    $row = [ordered]@{}
    foreach ($c in $columns) { $row[$c] = '' }
    $row.id = $b.id; $row.name = $b.name; $row.nameZh = $b.nameZh; $row.country = $b.country; $row.segment = $b.segment
    foreach ($f in $listFields) { $row[$f] = (@($b.$f) -join '|') }
    $row.knownInChina = BoolText $b.knownInChina; $row.usAvailability = $b.usAvailability
    $row.priceTiers = (@($b.price.tiers) -join '|'); $row.priceNote = $b.price.note; $row.priceStatus = $b.price.status
    $row.officialUrl = $b.officialUrl; $row.online = BoolText $b.online; $row.hasStores = BoolText $b.hasStores
    $row.storesStatus = $b.stores.status; $row.storesSummary = $b.stores.summary
    $row.intro = $b.intro; $row.source = $b.source; $row.lastVerified = $b.lastVerified
    $row.similarToJson = ConvertTo-Json -InputObject @($b.similarTo) -Compress -Depth 5
    [pscustomobject]$row
  }
  $csv = ($rows | ConvertTo-Csv -NoTypeInformation) -join "`r`n"
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($CsvFile), $csv, $utf8)
  Write-Host "Exported $(@($rows).Count) brands to $CsvFile"
}
elseif ($Import) {
  $text = [System.IO.File]::ReadAllText((Resolve-Path $CsvFile), [System.Text.Encoding]::UTF8)
  $rows = $text | ConvertFrom-Csv
  $old = [System.IO.File]::ReadAllText((Resolve-Path $JsonFile), [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  $brands = foreach ($r in $rows) {
    $b = [ordered]@{ id = $r.id; name = $r.name }
    if ($r.nameZh) { $b.nameZh = $r.nameZh }
    $b.aliases = Split-List $r.aliases
    $b.country = $r.country; $b.segment = $r.segment; $b.knownInChina = [bool](TextBool $r.knownInChina); $b.usAvailability = $r.usAvailability
    foreach ($f in 'departments', 'styles', 'categories', 'fits', 'colors', 'occasions', 'sizes') { $b[$f] = Split-List $r.$f }
    $b.price = [ordered]@{ tiers = @((Split-List $r.priceTiers) | ForEach-Object { [int]$_ }); note = [string]$r.priceNote; status = $r.priceStatus }
    $b.officialUrl = [string]$r.officialUrl; $b.online = TextBool $r.online; $b.hasStores = TextBool $r.hasStores
    $b.stores = [ordered]@{ status = $r.storesStatus; summary = [string]$r.storesSummary }
    $b.intro = $r.intro
    # ForEach-Object unrolls the parsed array; Where-Object drops the empty element "[]" produces in PS 5.1.
    $b.similarTo = @(if ($r.similarToJson) { $r.similarToJson | ConvertFrom-Json | ForEach-Object { $_ } | Where-Object { $_ -and $_.id } })
    $b.source = $r.source; $b.lastVerified = [string]$r.lastVerified
    [pscustomobject]$b
  }
  $out = [ordered]@{ schemaVersion = $old.schemaVersion; compiledAt = (Get-Date).ToString('yyyy-MM-dd'); notice = $old.notice; brands = @($brands) }
  $json = $out | ConvertTo-Json -Depth 8
  # Windows PowerShell escapes some characters (e.g. '); the result is still valid JSON.
  [System.IO.File]::WriteAllText([System.IO.Path]::GetFullPath($JsonFile), $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Imported $(@($brands).Count) brands into $JsonFile"
  & (Join-Path $PSScriptRoot 'validate-brands.ps1') -BrandsFile $JsonFile
  exit $LASTEXITCODE
}
else {
  Write-Host 'Specify -Export or -Import.'
  exit 1
}
