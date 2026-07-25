# ListingKit

Turn one real estate listing into a complete, designed marketing kit in ~30 seconds:
listing descriptions (3 lengths, fair-housing screened), captions for 4 platforms, a
designed 6-slide Instagram carousel, a reel script, an email, and status graphics —
all in the agent's brand color.

Static site + **one** zero-dependency serverless function. Deploys to Vercel's free tier.

---

## What's here

```
listingkit/
├─ index.html          Marketing homepage → funnels into the tool
├─ app.html            The generator (the product)
├─ api/generate.js     Serverless function → Gemini REST API (+ templated fallback)
├─ assets/
│  ├─ styles.css       Shared design system
│  └─ app.js           Front-end: form, rendering, PNG export of graphics
├─ vercel.json         Config (clean URLs, function settings)
└─ package.json
```

**It works with no API key at all** — the function returns a high-quality *templated*
kit ("Preview mode"). Add a Gemini key to switch on live AI generation.

---

## Deploy in ~5 minutes (fastest path — Vercel CLI, no GitHub needed)

1. Install the CLI once:
   ```bash
   npm i -g vercel
   ```
2. From inside this `listingkit/` folder, run:
   ```bash
   vercel
   ```
   It opens your browser to sign in (create a free Vercel account if you don't have one),
   then asks a few questions — accept the defaults. It deploys to a preview URL.
3. Ship the production URL (this is the one to share):
   ```bash
   vercel --prod
   ```
   You'll get a URL like `https://listingkit.vercel.app`. Homepage is `/`, the tool is `/app`.

### Alternative: GitHub + Vercel dashboard
Push this folder to a new GitHub repo → on [vercel.com](https://vercel.com) click **Add New → Project**
→ import the repo → **Deploy**. No build settings needed (it's static + a function).

---

## Turn on live AI generation (Gemini)

The tool runs in **Preview mode** until you add a key.

1. Get a **free** key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. In Vercel → your project → **Settings → Environment Variables**, add:

   | Name | Value |
   |------|-------|
   | `GEMINI_API_KEY` | *(paste your key)* |
   | `GEMINI_MODEL` *(optional)* | `gemini-flash-latest` (the default) |

3. **Redeploy** (`vercel --prod`, or Vercel → Deployments → Redeploy) so the key takes effect.

The tool auto-detects the key: with it, output is `mode: "live"` (AI-written); without it,
`mode: "demo"` (templated). If a live call ever fails, it degrades to a templated kit with a
visible notice instead of erroring.

---

## Test locally (optional)

```bash
npm i -g vercel
vercel dev
```
Opens `http://localhost:3000` with the serverless function running. Set the key locally
with `vercel env pull` or a `.env` file (`GEMINI_API_KEY=...`).

---

## Cost

- Hosting: **free** (Vercel Hobby tier).
- Gemini: **free tier** covers early volume; a paid key is cheap per generation later.
- No other dependencies.
