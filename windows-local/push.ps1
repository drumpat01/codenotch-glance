# Reads Codenotch's cached usage files and pushes them to the Glance widget feeds:
#   limits - Codenotch Limits (bars, tap for rings) -> limits.feed_id / .template_id / .write_key
param([switch]$Force, [switch]$Print)  # -Force: ignore quiet hours; -Print: show payloads, don't send
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$src  = Join-Path $env:APPDATA 'codenotch'
$cfg  = Get-Content (Join-Path $here 'glance-config.json') -Raw | ConvertFrom-Json
$log  = Join-Path $here 'push.log'

# Quiet hours: no pushes from midnight to 6 AM local time.
if (-not $Force -and (Get-Date).Hour -lt 6) { exit 0 }

# Returns @{ used = 0-100; at = reset time (UTC ISO string) } for the first matching window.
function Get-Window($file, [string[]]$ids) {
    $none = @{ used = 0; at = $null }
    $p = Join-Path $src $file
    if (-not (Test-Path $p)) { return $none }
    $j = Get-Content $p -Raw | ConvertFrom-Json
    $w = $null
    # $ids entries match a window id, or a label prefix when written 'label:Weekly'.
    foreach ($id in $ids) {
        if ($id -like 'label:*') { $lb = $id.Substring(6); $w = $j.windows | Where-Object { $_.label -like "$lb*" } | Select-Object -First 1 }
        else { $w = $j.windows | Where-Object { $_.id -eq $id } | Select-Object -First 1 }
        if ($w) { break }
    }
    if (-not $w -and $j.windows) { $w = $j.windows[0] }
    if (-not $w) { return $none }
    $at = $null
    if ($w.resets_at) {
        $reset = [DateTimeOffset]::FromUnixTimeMilliseconds([int64]$w.resets_at)
        # A window whose reset already passed is stale (Codenotch hasn't refreshed it yet): show it empty.
        if ($reset -le [DateTimeOffset]::UtcNow) { return $none }
        $at = $reset.UtcDateTime.ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    return @{ used = [math]::Min(100, [math]::Max(0, [math]::Round([double]$w.used * 100))); at = $at }
}

function Send-Feed($feedId, $templateId, $key, $content) {
    if ($Print) { $content | ConvertTo-Json -Depth 5 -Compress | Write-Output; return }
    $body = [ordered]@{
        schema_type = 'dynamic'
        template_id = $templateId
        content     = $content
        metadata    = @{ source = 'codenotch-glance' }
        intent      = @{ update_widget = $true; send_push = $false }
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Method Post -Uri "https://glance-api.fly.dev/ingest/$feedId" `
        -Headers @{ Authorization = "Bearer $key" } `
        -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | Out-Null  # bytes: PowerShell 5.1 would mangle non-ASCII like "·"
}

$now = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$win = [ordered]@{
    cs     = Get-Window 'usage.json'       @('session')
    cw     = Get-Window 'usage.json'       @('weekly_all')
    codex  = Get-Window 'codex.json'       @('label:Weekly', 'weekly', 'secondary')  # the weekly window Codenotch shows, not the 5-hour one
    cursor = Get-Window 'cursor.json'      @('included')
    grok   = Get-Window 'grok-bot.json'    @('label:Weekly', 'weekly')   # GrokBot (via Cursor), not the standard Grok CLI
    ex     = Get-Window 'expo.json'        @('credit')   # Expo build credit, written by the Codenotch app (replaces Antigravity)
}
$errors = @()

# Limits widget: thin 50-cell bar + used % + reset time per limit; tap swaps to a rings view.
if ($cfg.limits -and $cfg.limits.write_key -and $cfg.limits.write_key -ne 'PASTE_WRITE_KEY') {
    $content = [ordered]@{}
    foreach ($k in $win.Keys) {
        # 50-cell bar: each cell is 2%; 0 = track. Filled cells carry the used % (min 1) so the
        # layout colors the bar: brand color, amber at 70%+, red at 90%+.
        $filled = [math]::Round($win[$k].used / 2)
        $level = [math]::Max(1, $win[$k].used)
        $content["${k}_cells"] = @(1..50 | ForEach-Object { if ($_ -le $filled) { $level } else { 0 } })
        $content["${k}_pct"] = "$($win[$k].used)%"
        # Tap-to-swap rings view: [used, left] donut, and the numeric % for the warning color.
        $content["${k}_ring"]  = @($win[$k].used, (100 - $win[$k].used))
        $content["${k}_level"] = $win[$k].used
        $content["${k}_at"]  = $(if ($win[$k].at) { $win[$k].at } else { $now })
        # Reset date next to the countdown, local time: "· 1:00 PM" within a day, else "· Mon, Sep 28".
        $content["${k}_date"] = ' '
        if ($win[$k].at) {
            $local = [DateTime]::Parse($win[$k].at, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AdjustToUniversal).ToLocalTime()
            $fmt = $(if (($local - (Get-Date)).TotalHours -lt 24) { 'h:mm tt' } else { 'ddd, MMM d' })
            $content["${k}_date"] = [char]0x00B7 + ' ' + $local.ToString($fmt, [Globalization.CultureInfo]::GetCultureInfo('en-US'))
        }
    }
    # "$10 of $45" from the app's own label ("Build credit · $10 of $45"); the file is UTF-8, PowerShell 5.1 reads ANSI by default.
    $content['ex_money'] = '-'
    $ef = Join-Path $src 'expo.json'
    if (Test-Path $ef) { $lab = ([IO.File]::ReadAllText($ef) | ConvertFrom-Json).windows[0].label; if ($lab -match '\$[\d.,]+ of \$[\d.,]+') { $content['ex_money'] = $Matches[0] } }
    $content['ring_labels'] = @('Used', 'Left')
    $content['updated'] = $now
    try { Send-Feed $cfg.limits.feed_id $cfg.limits.template_id $cfg.limits.write_key $content }
    catch { $errors += "limits: $($_.Exception.Message)" }
}

$summary = ($win.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value.used)" }) -join ' '
if ($errors) {
    "$(Get-Date -f s) ERR $($errors -join ' | ')" | Add-Content $log
    throw ($errors -join ' | ')
}
"$(Get-Date -f s) ok  $summary" | Add-Content $log
