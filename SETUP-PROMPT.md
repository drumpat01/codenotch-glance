# Create the widget with your AI assistant

Connect the free **Glance MCP** to Claude (Settings → Connectors → add `https://glance-api.fly.dev/mcp`, or follow https://glance.cool/mcp), sign in to Glance, then start a new chat, attach `layouts/free.json` (and the two `pro-` files if you have Glance Pro), and paste:

---

Using the Glance tools, set up my Codenotch usage widget:

1. Call `get_plan`. If `family_charts` and `family_grid` are both true, I'm on Pro: set up all three attached layouts. Otherwise set up only `free.json`.
2. For each layout: `create_template` with the attached JSON as the tree exactly as given, `widget_size` "medium", names "Codenotch" (free), "Codenotch Rings" (pro-rings), "Codenotch Bars" (pro-bars). Then `create_dynamic_widget` with the same name and size "medium". If a widget with that name already exists, ask me first.
3. Give me, for each widget, a ready-to-paste JSON snippet for my `config.json` under `widgets`: `"free"`, `"rings"` or `"bars"` → `{ "feed_id": …, "template_id": …, "write_key": … }`. The write key is only shown once, so include it.

Don't push any content yet; my computer will do that.

---

Paste the snippet into `config.json`, then run `node push.mjs --force` once to fill the widget.
