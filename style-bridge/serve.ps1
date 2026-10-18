# Local server for Style Bridge (Windows PowerShell 5.1+): static files + /api endpoints.
# Usage: powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
# Optional keys go in .env (see .env.example) or environment variables. They stay on the server.
param([int]$Port = 8080)

$root = $PSScriptRoot
. (Join-Path $root 'server\api.ps1')

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Style Bridge running at http://localhost:$Port/  (Ctrl+C to stop)"
$vision = [bool](Get-VisionProvider); $stores = [bool]$script:Cfg.PlacesKey; $web = [bool]$script:Cfg.OpenAIKey
$onOff = { param($b) if ($b) { 'on' } else { 'off' } }
if (-not $vision -and -not $stores -and -not $web) {
  Write-Host 'Mode: no API keys set - Your picks needs OPENAI_API_KEY (web search, AI photo analysis and store lookup are off).'
} else {
  # Only on/off flags are printed - never key values.
  Write-Host ("Connected services: web search={0}, AI photo analysis={1}, store lookup={2}" -f (& $onOff $web), (& $onOff $vision), (& $onOff $stores))
}

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'; '.webp' = 'image/webp'; '.gif' = 'image/gif'; '.ico' = 'image/x-icon'
}
# Never serve secrets, server code or tooling.
$blocked = '^(\.env|server/|tools/|.*\.ps1$|.*\.md$|data/brands\.csv$)'

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $res = $ctx.Response
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if ($path -like 'api/*') { Invoke-Api $ctx $path; continue }
      if ($path -eq '') { $path = 'index.html' }
      if ($path -match $blocked) { $res.StatusCode = 404; continue }
      $file = [System.IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $ext = [System.IO.Path]::GetExtension($file).ToLower()
        $res.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        $res.Headers.Add('Cache-Control', 'no-store')
        $res.ContentLength64 = $bytes.Length
        if ($ctx.Request.HttpMethod -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $res.StatusCode = 404
      }
    } catch {
      Write-SafeLog "Request error: $($_.Exception.Message)"
      try { $res.StatusCode = 500 } catch { }
    } finally {
      try { $res.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
