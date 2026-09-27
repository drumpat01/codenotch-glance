# Create the widgets with your AI assistant

Connect the free **Glance MCP** to Claude (Settings → Connectors → add `https://glance-api.fly.dev/mcp`, or follow https://glance.cool/mcp) and sign in to Glance. Start a new chat, attach the layout files you want from `layouts/`, and paste the prompt below.

- Free Glance plan: `free-rings.json` and/or `free-bars.json`
- Glance Pro: any of the four, including `pro-rings.json` and `pro-bars.json`

---

Using the Glance tools, set up my Codenotch usage widgets from the attached layout files:

1. Call `get_plan`. Set up every attached `free-` layout. Set up attached `pro-` layouts only if `family_charts` and `family_grid` are both true (Glance Pro); otherwise skip them and tell me they need Pro.
2. For each layout: `create_template` with the attached JSON as the tree exactly as given and `widget_size` "medium", then `create_dynamic_widget` with the same name and size "medium". Names by file:
   - `free-rings.json` → "Codenotch Rings (Free)"
   - `pro-rings.json` → "Codenotch Rings (Pro)"
   - `free-bars.json` → "Codenotch Bars (Free)"
   - `pro-bars.json` → "Codenotch Bars (Pro)"
   - `pro-combo.json` → "Codenotch Combo (Pro)". This file holds `tree` and `views`: pass both to `create_template` (it also needs `family_views`).

   If a widget with that name already exists, ask me first.
3. Give me one ready-to-paste JSON block for the `widgets` section of my `config.json`, keyed by file name without `.json` (`"free-rings"`, `"pro-rings"`, `"free-bars"`, `"pro-bars"`, `"pro-combo"`), each `{ "feed_id": …, "template_id": …, "write_key": … }`. Write keys are only shown once, so include them.

Don't push any content yet; my computer will do that.

---

Paste the block into `config.json` (replacing the empty entries), then run `node push.mjs --force` once to fill the widgets.
