<#
  Conflict Globe - local server for Windows (PowerShell 5.1+, no install needed).

  * Serves the app at http://localhost:<Port>/
  * /proxy?url=...  forwards requests to the allow-listed live data feeds,
    which do not send CORS headers and so cannot be called from a browser.
  * -Open launches the app in a chromeless Microsoft Edge window.
#>
param(
  [int]$Port = 8787,
  [switch]$Open
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AllowedHosts = @('data.gdeltproject.org', 'api.gdeltproject.org', 'api.adsb.lol', 'api.airplanes.live', 'retrieve.pskreporter.info')
$Mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.svg' = 'image/svg+xml'
  '.png' = 'image/png'; '.ico' = 'image/x-icon'; '.txt' = 'text/plain'
}
$Cache = @{}  # url -> @{ At; Type; Bytes }

function Send($ctx, [int]$status, [string]$type, [byte[]]$bytes) {
  $res = $ctx.Response
  $res.StatusCode = $status
  $res.ContentType = $type
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.Headers.Add('Cache-Control', 'no-cache')
  $res.ContentLength64 = $bytes.Length
  try { $res.OutputStream.Write($bytes, 0, $bytes.Length) } catch {}
  $res.OutputStream.Close()
}
function SendText($ctx, [int]$status, [string]$text) {
  Send $ctx $status 'text/plain; charset=utf-8' ([Text.Encoding]::UTF8.GetBytes($text))
}

function Proxy($ctx, [string]$target) {
  try { $uri = [Uri]$target } catch { return SendText $ctx 400 'bad url' }
  if ($AllowedHosts -notcontains $uri.Host) { return SendText $ctx 403 "host not allowed: $($uri.Host)" }
  # GDELT archives never change; aircraft snapshots are cached for 2 s to respect rate limits.
  $ttl = if ($target -match '\.zip$') { 3600 } elseif ($target -match 'lastupdate') { 60 } elseif ($target -match 'pskreporter') { 300 } else { 2 }
  $hit = $Cache[$target]
  if ($hit -and ((Get-Date) - $hit.At).TotalSeconds -lt $ttl) { return Send $ctx 200 $hit.Type $hit.Bytes }
  try {
    $req = [Net.HttpWebRequest]::Create($uri)
    $req.UserAgent = 'ConflictGlobe/1.0 (+local)'
    $req.Timeout = 30000
    $req.AutomaticDecompression = [Net.DecompressionMethods]::GZip -bor [Net.DecompressionMethods]::Deflate
    $resp = $req.GetResponse()
    $ms = New-Object IO.MemoryStream
    $resp.GetResponseStream().CopyTo($ms)
    $type = if ($resp.ContentType) { $resp.ContentType } else { 'application/octet-stream' }
    $resp.Close()
    $bytes = $ms.ToArray()
    if ($Cache.Count -gt 200) { $Cache.Clear() }
    $Cache[$target] = @{ At = Get-Date; Type = $type; Bytes = $bytes }
    Send $ctx 200 $type $bytes
  } catch {
    $code = 502
    if ($_.Exception.InnerException -and $_.Exception.InnerException.Response) { $code = [int]$_.Exception.InnerException.Response.StatusCode }
    SendText $ctx $code "upstream error: $($_.Exception.Message)"
  }
}

$listener = New-Object Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)
try { $listener.Start() } catch {
  Write-Host "Could not listen on $prefix - is another copy already running?" -ForegroundColor Red
  if ($Open) { Start-Process $prefix }
  exit 1
}
Write-Host ""
Write-Host "  Conflict Globe is running at $prefix" -ForegroundColor Green
Write-Host "  Close this window to stop the server." -ForegroundColor DarkGray
Write-Host ""

if ($Open) {
  try { Start-Process 'msedge.exe' -ArgumentList "--app=$prefix", '--start-maximized' }
  catch { Start-Process $prefix }
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = $ctx.Request.Url.AbsolutePath
    if ($path -eq '/api/health') {
      Send $ctx 200 'application/json' ([Text.Encoding]::UTF8.GetBytes('{"ok":true,"proxy":true}'))
      continue
    }
    if ($path -eq '/proxy') {
      Proxy $ctx $ctx.Request.QueryString['url']
      continue
    }
    $rel = [Uri]::UnescapeDataString($path.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $file = [IO.Path]::GetFullPath((Join-Path $Root $rel))
    if (-not $file.StartsWith($Root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path $file -PathType Leaf)) {
      SendText $ctx 404 'not found'
      continue
    }
    $ext = [IO.Path]::GetExtension($file).ToLower()
    $type = if ($Mime.ContainsKey($ext)) { $Mime[$ext] } else { 'application/octet-stream' }
    Send $ctx 200 $type ([IO.File]::ReadAllBytes($file))
  } catch {
    try { SendText $ctx 500 $_.Exception.Message } catch {}
  }
}
