# bartender-render

Cloudflare Browser Rendering Worker — renders HTML card templates to JPEG via headless Chrome.

## Deploy

```bash
cd browser
npm install
npx wrangler deploy
```

You need:
- `CLOUDFLARE_API_TOKEN` in env (already set in Replit secrets)
- Your Cloudflare Account ID — add it to `wrangler.toml` under `account_id = "..."`, or set `CLOUDFLARE_ACCOUNT_ID` in env

After deploy, wrangler prints the Worker URL (e.g. `https://bartender-render.<account>.workers.dev`).

## Secrets

Set these via wrangler after the first deploy:

```bash
npx wrangler secret put RENDER_SECRET
# paste your chosen secret string when prompted
```

Then set the matching env vars on the bot host:
- `BT_RENDER_URL` = the workers.dev URL from deploy output (e.g. `https://bartender-render.foo.workers.dev/render`)
- `BT_RENDER_SECRET` = the same secret string

## API

```
POST /render
X-Render-Secret: <your secret>
Content-Type: application/json

{
  "html":     "<full self-contained HTML>",
  "selector": ".card",          // optional, default .card
  "waitFor":  "window.__chartDone === true",  // optional
  "quality":  92,               // optional JPEG quality
  "width":    2400,             // optional viewport px
  "height":   1600              // optional viewport px
}
```

Response: `image/jpeg` bytes on success, plain text + 4xx/5xx on error.

## Font injection

The bot sends HTML with `{{FONT_FACES}}` as a literal placeholder. The Worker replaces it with
bundled Inter woff2 font-face declarations (built into `src/fonts.ts` at compile time). This
keeps bot payloads small (~5–20 KB instead of ~400 KB with inlined fonts).

To regenerate fonts.ts after updating font files:

```bash
python3 -c "
import base64, pathlib
font_dir = pathlib.Path('../bot/bartender/assets/fonts')
weights = [400, 500, 600, 700, 800]
entries = []
for w in weights:
    data = (font_dir / f'inter-{w}.woff2').read_bytes()
    b64 = base64.b64encode(data).decode()
    entries.append(f'  [{w}, \"{b64}\"]')
rows = ',\n'.join(entries)
ts = f'''// Auto-generated — do not edit.
const FONT_DATA: [number, string][] = [
{rows},
];
export const fontFacesCSS: string = FONT_DATA.map(
  ([w, b64]) => \`@font-face{{font-family:'Inter';font-style:normal;font-weight:\${{w}};font-display:block;src:url(data:font/woff2;base64,\${{b64}}) format('woff2');}}\`
).join('\n');
'''
pathlib.Path('src/fonts.ts').write_text(ts)
print('done')
"
```
