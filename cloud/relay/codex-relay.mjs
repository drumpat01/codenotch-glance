// Codex relay, run hourly by GitHub Actions: chatgpt.com blocks Cloudflare Workers, so this job
// borrows the Worker's Codex access token, reads usage from GitHub's network and posts it back.
// Needs WORKER_URL and RELAY_KEY. Never prints the token (the repo's Action logs are public).
const { WORKER_URL, RELAY_KEY } = process.env;
const auth = { Authorization: `Bearer ${RELAY_KEY}` };

const t = await fetch(`${WORKER_URL}/codex/token`, { headers: auth });
if (!t.ok) throw new Error(`worker token ${t.status}`);
const { accessToken, accountId } = await t.json();
console.log(`::add-mask::${accessToken}`);

const u = await fetch('https://chatgpt.com/backend-api/wham/usage', {
  headers: { Authorization: `Bearer ${accessToken}`, 'ChatGPT-Account-Id': accountId, originator: 'codex_cli_rs', 'User-Agent': 'codex_cli_rs/0.50.0', Accept: 'application/json' },
});
if (!u.ok) throw new Error(`codex usage ${u.status}`);
const { rate_limit } = await u.json();

const p = await fetch(`${WORKER_URL}/codex/usage`, {
  method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ rate_limit }),
});
if (!p.ok) throw new Error(`worker report ${p.status}`);
console.log('codex used %', (await p.json()).used);
