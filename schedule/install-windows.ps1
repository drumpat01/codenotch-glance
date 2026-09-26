# Runs push.mjs every hour (Windows Task Scheduler, your user only, no admin). Re-run to update; see README to remove.
$dir = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'Node.js not found. Install it from https://nodejs.org (LTS) and run this again.'; exit 1 }
$action = New-ScheduledTaskAction -Execute $node -Argument "`"$dir\push.mjs`"" -WorkingDirectory $dir
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).Date.AddHours((Get-Date).Hour + 1)) -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'Codenotch to Glance' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host "Scheduled: pushes every hour (quiet hours in config.json). Log: $dir\push.log"
