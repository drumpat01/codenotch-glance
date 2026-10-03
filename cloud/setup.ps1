# One-time setup for the cloud sender: creates the Worker's OWN Claude and Codex logins (separate
# from this PC's, so neither ever signs the other out), then stores every credential in Cloudflare.
# Nothing here is printed or written to the repo. Re-run a single part with e.g. -Only cursor.
param([ValidateSet('all', 'claude', 'codex', 'cursor', 'expo', 'glance', 'muse')][string]$Only = 'all')
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$tmp = Join-Path $env:TEMP "cng-setup-$PID"
New-Item -ItemType Directory -Force $tmp | Out-Null

function Put-Secret($name, $value) {
    if (-not $value) { throw "$name is empty" }
    $value | npx.cmd --yes wrangler@latest secret put $name | Out-Null
    Write-Host "  stored secret $name"
}
function Put-Kv($key, $json) {
    $f = Join-Path $tmp "$key.json"
    [IO.File]::WriteAllText($f, $json)
    npx.cmd --yes wrangler@latest kv key put --binding STATE --remote $key --path $f | Out-Null
    Remove-Item $f
    Write-Host "  stored KV $key"
}
function Want($part) { $Only -eq 'all' -or $Only -eq $part }

try {
    if (Want 'claude') {
        Write-Host "`n== Claude: a separate login just for the Worker"
        Write-Host "   Claude Code opens in a fresh profile. Type /login, sign in with the same account, then /exit."
        $env:CLAUDE_CONFIG_DIR = Join-Path $tmp 'claude'
        claude
        $c = (Get-Content (Join-Path $env:CLAUDE_CONFIG_DIR '.credentials.json') -Raw | ConvertFrom-Json).claudeAiOauth
        Remove-Item Env:CLAUDE_CONFIG_DIR
        Put-Kv 'claude' (@{ accessToken = $c.accessToken; refreshToken = $c.refreshToken; expiresAt = $c.expiresAt } | ConvertTo-Json -Compress)
    }
    if (Want 'codex') {
        Write-Host "`n== Codex: a separate login just for the Worker (browser opens)"
        $env:CODEX_HOME = Join-Path $tmp 'codex'
        New-Item -ItemType Directory -Force $env:CODEX_HOME | Out-Null
        codex login
        $t = (Get-Content (Join-Path $env:CODEX_HOME 'auth.json') -Raw | ConvertFrom-Json).tokens
        Remove-Item Env:CODEX_HOME
        Put-Kv 'codex' (@{ accessToken = $t.access_token; refreshToken = $t.refresh_token; accountId = $t.account_id; expiresAt = 0 } | ConvertTo-Json -Compress)
    }
    if (Want 'cursor') {
        Write-Host "`n== Cursor (+ GrokBot): session from Cursor's local sign-in"
        $js = @'
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync(process.env.APPDATA + '/Cursor/User/globalStorage/state.vscdb', { readOnly: true });
const tok = db.prepare("select value from ItemTable where key='cursorAuth/accessToken'").get().value;
const p = JSON.parse(Buffer.from(tok.split('.')[1], 'base64url'));
process.stdout.write(p.sub.split('|').pop() + '::' + tok);
console.error('  session valid until ' + new Date(p.exp * 1000).toDateString() + ' - re-run: .\\setup.ps1 -Only cursor');
'@
        # Run from a file: PowerShell 5.1 strips the quotes inside `node -e` arguments.
        $jf = Join-Path $tmp 'cursor.cjs'
        [IO.File]::WriteAllText($jf, $js)
        Put-Secret 'CURSOR_SESSION' (node --no-warnings $jf)
    }
    if (Want 'expo') {
        Write-Host "`n== Expo: create a token at https://expo.dev/settings/access-tokens and paste it"
        $s = Read-Host '  Expo access token' -AsSecureString
        Put-Secret 'EXPO_TOKEN' ([Net.NetworkCredential]::new('', $s).Password)
    }
    if (Want 'glance') {
        Write-Host "`n== Glance write key (from glance-config.json)"
        Put-Secret 'GLANCE_WRITE_KEY' (Get-Content (Join-Path $here '..\glance-config.json') -Raw | ConvertFrom-Json).limits.write_key
        $run = -join ((48..57) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
        Put-Secret 'RUN_KEY' $run
        Set-Content (Join-Path $here '.run-key') $run   # local only (gitignored), for manual test runs
    }
    if (Want 'muse') {
        Write-Host "`n== Muse Code API key (leave blank to skip; the row shows a dash until set)"
        $s = Read-Host '  Muse API key' -AsSecureString
        $k = [Net.NetworkCredential]::new('', $s).Password
        if ($k) { Put-Secret 'MUSE_API_KEY' $k } else { Write-Host '  skipped' }
    }
    Write-Host "`nDone."
}
finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
