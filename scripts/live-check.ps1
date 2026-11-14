# scripts/live-check.ps1
# RouterMod liveness checker — probes http://localhost:1337/ every 3 minutes.
# Logs UP/DOWN with a timestamp to logs/live-check.log.
# Run detached:  Start-Process powershell -File scripts\live-check.ps1

$ErrorActionPreference = "Continue"
$url   = "http://localhost:1337/"
$log   = "$PSScriptRoot\..\logs\live-check.log"
$intervalSec = 180  # 3 minutes

while ($true) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        "$ts | UP   | HTTP $($r.StatusCode) $($r.StatusDescription)" | Out-File -FilePath $log -Append -Encoding utf8
    } catch {
        "$ts | DOWN | $($_.Exception.Message)" | Out-File -FilePath $log -Append -Encoding utf8
    }
    Start-Sleep -Seconds $intervalSec
}
