# Style Bridge (demo MVP)

**Style Bridge helps people discover brands and products that fit their style, budget, and life — not just
the brands they already know.**

## For judges: the OpenAI API key is not included

This repository intentionally contains **no API key**. Keys must never be committed to a public repo:
bots scrape GitHub for them within minutes, and leaked OpenAI keys are automatically revoked. Our demo
video shows the live version with a key.

**Works without a key:** the home page, onboarding (brands, outfit photos with on-device color reading),
the style profile (tags, size and location), the brand guide, Saved, and the privacy controls. On
**Your picks** you'll see "Personalized search isn't turned on" with **Try again** and a **Show demo
examples** button; the demo examples (clearly labeled, not personalized) can be added to the cart to try
the cart and checkout pages.

**Needs a key:** live personalized product search (Your picks), the where-to-buy price comparison, and AI
clothing analysis of photos.

**To run the live version with your own OpenAI key** (Windows, PowerShell 5.1+):

1. Copy `.env.example` to `.env` in this folder (`.env` is git-ignored).
2. Set `OPENAI_API_KEY=your-key` in `.env`. Optional: `OPENAI_MODEL` (default `gpt-5.4-mini`).
3. Run `powershell -ExecutionPolicy Bypass -File serve.ps1` and open http://localhost:8080/.
   The console shows `web search=on` when the key is loaded (the key itself is never printed).

Cost note: each search on Your picks makes two OpenAI calls (the product search and the where-to-buy
comparison). Results are cached in the browser for 24 hours per profile. Consider setting a spending limit
on the key.

Flow (3 steps): **1 Brands** you like (any country) → **2 Photos** (optional; colors read on-device,
optional AI analysis suggests style, category, fit, colors, patterns and details) → **3 Your style profile**:
one screen with the questions (as tags), brands, photo/brand suggestions, budget, optional size & fit and
optional shopping location → **Your picks**: a live, personalized web search for exact products and
brands, with a reason, "Matches your …" evidence, product details, citations, verification labels, a
"where to buy" comparison and brand product photos → open the product page, save, or say "More like
this" / "Not for me" for the next search.

**Tags are on by default.** Suggestions from photos ("AI · photo") and brands ("From brands") start
selected and are marked by source; the user removes what doesn't fit and adds their own. The profile is
always rebuilt from saved inputs (`brands`, `quiz`, `photoTags`, `details`, `removed`, `personal`), so a
removed tag never comes back on a rebuild, and the same profile is what the next search sends.

**Optional location & sizing.** ZIP code or city + state (never a street address); tops / bottoms / dress
size, shoe size + system, height (ft/in or cm), weight (lb/kg). Nothing is inferred from photos or from
height/weight. Weight stays on the device and is never sent. Sizes are used to prefer pages that offer
them and to read the store's own per-size stock (schema.org variants): "Your tops size M: in stock when
checked", "not listed", or "availability not verified" — never "will fit". Items whose page lists your
size as out of stock are hidden behind a toggle. "Remove my location" / "Remove my size info" clear them.

Newcomers to the US (e.g. from China) are the first audience and the demo persona, but the flow works
for anyone exploring new brands.

**Your picks only ever shows results from a successful personalized search.** There are no hard-coded
recommendations: while searching you see a loading state, an empty search shows "Search again" / "Edit
preferences", and a failure (including a missing API key) shows the error with **Try again**. Old results
are cleared when a new search starts and never come back after an error. For the hackathon demo, the
error state offers a separate **Show demo examples** button; that section is labeled "Demo examples — not
personalized, not live" and uses the hand-checked fixtures in `data/products.json`.

## Cart & checkout

"Add to cart" on any product card puts it in Style Bridge's own cart (`#/cart`, saved in this browser
only, with a snapshot of the product as found, including other stores). The cart groups items by store,
lets you set size (pre-filled from your size info) and quantity, move items to Saved, and shows an
**estimated** subtotal from USD prices only — unverified prices, missing prices and other currencies are
counted and named, never guessed. Taxes and shipping are left to each store.

Checkout (`#/checkout`) is a hand-off: for each store, every item has a "Buy at <store>" link to its exact
product page, plus an "I bought this" checkbox and a progress bar. Below it, a **"Pay for everything here"**
panel shows the planned one-step checkout as if it were live (ship-to row, payment options, per-store
subtotals, total), but it is a **non-functional preview**: there are no address or card fields, and
"Place order" is disabled (screen readers hear "not available in this preview"). Making it real would need
agreements with each store (or a checkout partner connected to them) to place orders, pass sizes and
shipping details and handle returns, plus a proper payment processor. Style Bridge never asks for card
details or an address, never adds anything to a store's cart, and never takes payment.

## Look and motion

Editorial layout: a white home hero with a centered image card and a full-width **STYLE BRIDGE** wordmark
(Inter Tight 600, tight tracking, sized by JS to fill the width; two lines on phones). Scrolling, a black
panel slides up over the sticky hero; content sits in label-left / content-right rows with thin rules; the
small 4-column header turns into a floating white pill nav; a wordmark footer closes every page. Motion:
wordmark letters rise in, blocks fade up as they enter the viewport, the hero image grows slightly on
scroll, cards zoom on hover. All of it is off with "reduce motion". App pages use the same black theme.

On the home page the main nav sits large on the left of the hero; past the hero it becomes the pill.

**Home image stage:** the hero shows one image at a time from `assets/hero-1`, `hero-2`, … (or a single
`hero`). Images change every 2.6 s, drift toward the mouse, switch on click, and — while you press and drag —
follow the cursor and leave a stepped trail of copies that fades out. A small "Press & drag" label follows the
cursor. The wordmark sits on top in `mix-blend-mode: difference`, so letters invert over the images. On touch
screens a tap shows the next image (no trail, so scrolling isn't blocked); with "reduce motion" there's no
auto-rotation, drift or trail.

**Your images:** `.jpg`, `.jpeg`, `.png` or `.webp` in `assets/`: `hero-1` … `hero-N` (any shape; shown up to
about 56% of the screen height) and `footer` (card above the footer wordmark, 3:4). The server lists what's
there (`GET /api/assets`); missing files fall back to a color field. No code changes needed. The current four
hero images and the footer image were supplied by the site owner — make sure you have the rights to use them
before publishing.

## Run it

```
powershell -ExecutionPolicy Bypass -File serve.ps1
```

Open http://localhost:8080/. No build step and no dependencies (Windows PowerShell 5.1+).

### Keys

`OPENAI_API_KEY` is what makes **Your picks** work (personalized web search; it also powers AI photo
analysis when no Anthropic key is set). Copy `.env.example` to `.env` (Git ignores it), set the key and
restart. The console prints `web search=on` — never the key.

Without it, the site still runs: onboarding, profile, brand guide, saved items and privacy controls all
work, and Your picks shows "Personalized search isn't turned on" with Try again and the labeled demo
examples. Optional: `ANTHROPIC_API_KEY` (AI clothing analysis), `PLACES_API_KEY` (store lookup).
Key values are never sent to the browser or printed in logs.

For a quick review, click **Try a sample profile** on the home page — it loads a labeled sample profile.
Any static server also works (e.g. `npx serve .`) — the app then runs in static demo mode without `/api`.
Opening `index.html` straight from disk is **not** supported (browsers block loading `data/*.json` from `file://`).

### Personalized web search

Opening **Your picks** ("Show my picks") calls `POST /api/discover` with the current profile; the profile
page and the picks page both list exactly which fields are sent. The **server** calls the
OpenAI Responses API (`POST https://api.openai.com/v1/responses`) with the `web_search` tool,
`user_location` set to the chosen shopping region, and `include: ["web_search_call.action.sources"]`.
No SDK is needed: the PowerShell server calls the REST API directly, like its other integrations.

Settings (`.env`): `OPENAI_MODEL` (default `gpt-5.4-mini`, which fits new accounts' per-minute token
limits), `WEB_SEARCH_DAILY_LIMIT`, `WEB_SEARCH_CONTEXT`, `WEB_SEARCH_MAX_OUTPUT_TOKENS`, `WEB_SEARCH_MAX_CALLS`.

How it behaves:
- **Sent:** every active profile tag (brands, styles, categories, fit, colors, occasions, size ranges, style
  details, patterns — suggestions included unless removed), budget, region, "More like this" / "Not for
  me" brands, the photo-derived subset as `photoLook`, and — only if entered and valid — `location`
  (`zip` and/or `city` + `state`, US region only; city/state also go into the search tool's approximate
  `user_location`) and `sizing` (`tops`, `bottoms`, `dresses`, `shoe {size, system}`, `heightCm`).
  **Never sent:** photos, street addresses (none are collected), weight. The server validates every field
  (vocab ids, ZIP pattern, US state codes, short size labels, numeric ranges), builds the prompt itself
  (free text quoted as data) and never logs location or sizing.
- The prompt asks for search queries built from the most distinctive attributes (e.g. a detail + color +
  fit + category), specific product pages from official sites or reputable retailers, brands new to the
  user (the user's own brands only with a reason), nothing from the avoid list, and "Not confirmed" for any
  price / availability / shipping a cited source doesn't state.
- The model returns **structured JSON** (`text.format` json_schema, strict): per product brand, name, exact
  URL, category, color, price only if cited, `product_details`, `why_fits` and `matched_attributes` copied
  from the profile; per brand the same plus notes. The server keeps only URLs that came back from the
  search (citations / consulted sources) or that it confirms by fetching the product page, then reads each
  product page (robots.txt respected) for the official image, price and per-size stock (schema.org data).
  Images come only from that page check — never from the model.
- **Outfit photos come first.** Photo attributes still in the profile are also sent as a separate
  `photoLook` (garment types, colors, fit, patterns, details), which the prompt marks as the highest priority.
- **Search quality rules (prompt):** established brands' official sites and reputable retailers first;
  exact product pages / color variants only (no category or search pages); prefer pages with current
  availability and real photos; no "bestseller"/"popular" claims unless a cited source says so; at least
  5 brands, at most 2 per brand and 1 from brands the user already likes; no `site:` filters for known brands.
- **Where to buy (`POST /api/compare`, a second, focused search).** Right after the picks load, the browser
  sends the top 6 products (id, brand, name, color, category, URL — no profile data except the optional
  ZIP/city for store listings) and the server runs one more `web_search` asking for the same item across
  channels: official site, reputable retailers / department stores, marketplaces such as Amazon, physical-
  store listings, and resale (The RealReal, Poshmark, ThredUp, Vestiaire, eBay) — up to 5 offers per item,
  1 per seller, with `match` = same | alternative. The server keeps only URLs returned by the search or
  confirmed by fetching, reads price / stock / condition / photo from each page where allowed, and
  downgrades "same" to "alternative" unless the listing carries the product's name. Amazon pages are
  linked but never read (its Conditions of Use don't allow automated extraction). Each offer says whether
  its page was checked, blocked, or not allowed. The comparison is saved with the cached results.
- **Photos from any channel.** If the product's own page gives no photo (many official sites block server
  requests — e.g. COS, ARKET, Uniqlo, Madewell and Macy's returned 403 in testing; Nordstrom serves a bot
  challenge; DSW renders in the browser only), the card uses the photo from another store's page for the
  *same* item, labeled "Photo from <store>'s product page". Photos of similar items are never used. Cards show each place with seller, channel, product + variant, price (and whether it came
  from the page or from search), condition for resale, stock only when page-checked, shipping only as
  "from search, not verified", and the check date. Alternatives are listed separately as "not a direct price
  comparison". If nothing else was verified, the card says a full comparison wasn't available.
- **Brand photos.** "Brands to explore" cards show up to 3 product photos, each linking to its exact page,
  only from pages the server read (schema.org Product with a name and image); prices only when read from the
  page, with the check date. Otherwise the card stays text-only with the official-site link. The brand guide
  shows photos only from the hand-checked listings in `data/products.json`, labeled with the check date.
- **Images.** Only the store's own product image (JSON-LD or og:image on a page whose robots.txt allows us)
  is displayed, by link with `referrerpolicy="no-referrer"`. If there's none or the store blocks it, a compact
  "No photo available here" strip replaces it — no broken icon or empty box.
- **Planned searches.** The server builds up to 6 queries itself (`New-SearchQueries`): one per garment
  detail ("women's earth tone cropped boxy jacket under $250"), then one per garment type not yet covered
  (style + fit + color + pattern + garment + budget). The model runs these first and may add its own.
- **Ranking (`Get-MatchScore`, "attribute-match-v1").** Up to 8 candidates are scored against the confirmed
  attributes using the product page's own text (JSON-LD name/color/description, og/meta description) where
  the store allows it, otherwise the search summary at 0.75×. Weights: photo garment type +3 (other wanted
  type +1.5, wrong type −2), photo color +2 (other +1), photo fit +2 (other +1), each photo detail +2
  (typed detail +1.5, partial +0.5), photo pattern +1.5 (other +0.75), within budget +0.5 / over −1,
  "More like this" brand +0.5, brand you already like −0.5, product photo +0.5, in stock (page) +0.5, your
  size in stock +1 / out of stock −1.5 / not listed −0.5. The garment type in the product name overrides the
  model's category when they disagree. Then at most 2 products per brand (1 for brands you already like)
  come before any extras. These weights are editorial starting points, not tuned on data.
- Cards show the reason, a "Matches your …" row from our own check (photo matches first; dashed = found only
  in the search summary, not on the product page), a "Close to your outfit photo" badge for 2+ photo
  matches, product details, sources and what was confirmed
  ("Product page checked", "Price from product page" or "Price from search — unverified", stock when
  checked). Out-of-stock items are hidden; budget rules and a category filter apply.
- Results are cached on the device for 24 h per profile. Any profile or region change starts a new search
  and clears the old results first. Rate limits: 3 searches/min per IP plus a daily cap. Nothing is bought
  or added to a cart.
- Note: the PowerShell demo server handles one request at a time, so other requests wait while a search
  runs (up to ~1 minute). A production server should run searches asynchronously.

## What's inside

```
index.html, css/styles.css   App shell and styles
js/services.js               Talks only to our own /api (falls back to data/*.json); on-device color reading
js/engine.js                 Catalog normalization, profile building, scoring, reasons, feedback, filters
js/store.js                  localStorage (profile, answers, feedback, favorites) + in-memory session (photos)
js/app.js                    Router and views: home, onboarding, profile, matches, brand guide, saved, privacy
data/brands.json             Sample brand catalog: 141 brands from 12 countries — 62 mainstream, 56 contemporary &
                             premium, 9 luxury (e.g. Chanel, Max Mara, The Row), 14 independent/designer-led
                             (e.g. Rachel Comey, Batsheva, Studio Nicholson) — see data/SCHEMA.md
data/products.json           33 hand-checked product fixtures from 11 brands (checked 2026-10-17) — dev/demo only:
                             the labeled "Demo examples" section and the brand guide, never Your picks
data/product-checks.json     Output of tools/check-products.ps1 (latest page / price / stock check)
data/vocab.json              Allowed tag values (styles, categories, countries, segments, statuses …)
data/link-checks.json        Output of tools/check-links.ps1
serve.ps1 + server/api.ps1   Static server + /api endpoints (keys stay here)
tools/                       validate-brands.ps1 (brands + products), check-links.ps1, check-products.ps1,
                             brands-csv.ps1 (Excel/Sheets round trip)
```

## Data honesty — what is verified

| Data | Status |
| --- | --- |
| Official links | Automated check on 2026-10-17: **71 of 125 verified** (HTTP 2xx + title names the brand); the rest are mostly big retailers / luxury houses that block bots (403). 16 brands have no link on file. Wrong domains found during checks (e.g. a holiday-rental site for "goelia.com") were removed. |
| Brand style tags, price tiers, segments, sizes, origin, store notes, US availability | Editorial estimates, labeled "estimate", "editorial" or "not verified". `lastVerified` is empty — no person has verified a brand record yet. |
| **Your picks** | Live web search results only (see above). Unverified unless a card says our page check confirmed it. |
| **Demo examples / fixtures** | Used only in the labeled "Demo examples — not personalized, not live" section and the brand guide — never as recommendations. **33 hand-checked listings** (SKIMS, Universal Standard, Dickies, Champion, MUJI, Gymshark, Rachel Comey, Batsheva, A.P.C., Studio Nicholson, Khaite). Each was read from the brand's own product page (schema.org data) on 2026-10-17 and re-checked with `tools/check-products.ps1`: product page, price and per-size stock verified *as of that date*. **Not live inventory.** Non-USD prices (EUR, GBP) are shown as listed and never converted. Most brands have no listings; the UI says so and links to the official site instead. |
| Product images | The brand's own image URLs from the product page, displayed by link (not copied), with alt text and a fallback tile. Fine for a demo; **production needs image permission**, ideally via a licensed retailer/affiliate feed. |
| Store addresses | None stored. Shown only when Google Places is connected, with source and retrieval time. |

Budget: with a budget set, picks over it — or priced in another currency we can't compare — are hidden
by default and can be shown on request, marked "Over your budget". Without a budget we make no
affordability claims.

## API (`server/api.ps1`)

| Endpoint | Without keys | With keys |
| --- | --- | --- |
| `GET /api/status` | Reports which features are connected | — |
| `GET /api/catalog` | Serves brands, vocab, link checks, products and product checks (local-json adapter) | Swap in an authorized brand/retailer feed with the same shape |
| `POST /api/discover` | `503 not_configured` | OpenAI Responses API + `web_search`; returns `{ intro, goodToKnow, products[{brandName, name, url, category, color, image, price, priceFrom, productDetails, whyFits, matchedAttributes[], sources[], status}], brands[{name, url, whyFits, matchedAttributes[], categories[], priceNote, availabilityNote, sources[]}], citations[], sources[], queries[], retrievedAt, region }`; input validated, 3/min per IP, daily cap |
| `GET /api/stores?brand=&zip=` | `503 not_configured` | Google Places Text Search; ZIP validation, 24 h cache, 10/min per IP, daily cap |
| `POST /api/analyze-outfit` | `503 not_configured` | Claude vision (`claude-opus-5-5`, `fallbacks: "default"` refusal fallback enabled), clothing-only prompt, enum-restricted JSON output, 5 MB limit, 4/min per IP, daily cap; image is held in memory only and never written to disk |
| `GET /api/products?brand=` | `manual-verified` adapter: verified demo listings + latest check (`live: false`) | Set `PRODUCT_FEED_PROVIDER` and implement an authorized feed in `Invoke-Products` (same response shape) |

The static server refuses to serve `.env`, `server/`, `tools/`, `*.ps1`, `*.md` and the CSV export.
Keys are read from environment variables or `.env` (copy `.env.example`); nothing reaches the browser.

## Connecting real services

1. **AI photo analysis** — set `ANTHROPIC_API_KEY`, or just `OPENAI_API_KEY` (used automatically when no
   Anthropic key is set; sends the photo as a low-detail image to the Responses API with the same
   clothing-only instructions and JSON schema). Users still have to tick a separate consent box and
   choose "Analyze clothing with AI" per photo. Before production: a retention/processing notice with the
   provider's terms, logging that never records images, and an evaluation of tag accuracy.
2. **Store lookup** — set `PLACES_API_KEY` (Google Places API (New), billed per request; restrict the key).
   Show Google attribution as their terms require. For distance sorting, add a geocoding call for the ZIP.
3. **Products & prices** — needs an *authorized* source: a brand's official catalog/API, a retailer
   product feed, or an affiliate network (e.g. Rakuten Advertising, CJ, Impact) after approval as a
   publisher. Implement it in `Invoke-Products` and keep the response shape documented in SCHEMA.md.
4. **Production hosting** — PowerShell's HttpListener is fine for a demo, not for production. Port the
   ~250 lines of `server/api.ps1` to a small Node/Python service (same endpoints), add HTTPS, a shared
   cache (e.g. Redis) and proper per-user rate limiting.

### About Taobao / Tmall data

Not connected, on purpose. As far as we know (please confirm against the current official docs before
planning around it):

- The Taobao Open Platform does **not** offer a general, consumer-style "search all Taobao products" API
  to arbitrary apps. Item APIs are mostly for sellers/ISVs managing their own stores.
- Product search for third parties goes through **Taobao Affiliate (淘宝联盟 / 淘宝客, Alimama)**: it needs a
  real-name Alimama account, an approved app (AppKey/AppSecret), a promotion slot (PID) and acceptance of
  the affiliate terms. Results are limited to items enrolled in the affiliate program, are oriented to
  mainland-China promotion (CNY prices, links carry commission tracking), and calls are rate-limited.
- That data would not tell a US user where to buy locally, and cross-border shipping/returns would need
  separate handling. We do not scrape Taobao or any other site to get around APIs or terms.

## Privacy rules the code follows

- Color reading happens in the browser; photos are kept only in memory and never in localStorage.
- AI analysis is opt-in per photo, behind a separate consent; only clothing tags come back (style, category,
  fit, colors, patterns, garment details — never identity, age, body, ethnicity, health or income). They are
  labeled "Suggested" and used in a search only after the user keeps them. The raw photo never goes to
  the search endpoint.
- Budget comes only from what the user picks. Nothing infers income from photos, looks, ethnicity, body or location.
- Every profile value and every recommendation reason is labeled "You said", "Our guess" or "Your feedback".
- The Privacy page deletes photos, profile (incl. feedback), saved items, or everything.

Style Bridge is not affiliated with any brand listed.
