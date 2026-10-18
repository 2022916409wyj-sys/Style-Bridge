# Catalog data

| File | What it holds | Edited by |
| --- | --- | --- |
| `brands.json` | Brand catalog (schemaVersion 3), one brand per line | people (or CSV import) |
| `vocab.json` | Allowed values for every tag field | people |
| `link-checks.json` | Automated official-link checks | `tools/check-links.ps1` |
| `products.json` | Verified demo product listings | people, after checking each page |
| `product-checks.json` | Latest automated re-check of each product page | `tools/check-products.ps1` |

`tools/validate-brands.ps1` validates brands **and** products; run it before every commit.

## Brands (`brands.json`)

A curated **sample** catalog from several regions — mainstream, contemporary/premium, luxury and
independent labels. It is not a complete or verified directory.

| Field | Type | Rules |
| --- | --- | --- |
| `id` | string | lowercase-kebab-case, unique |
| `name`, `nameZh` | string | official name; `nameZh` optional |
| `aliases` | string[] | lowercase search terms incl. Chinese; must not collide with another brand (duplicate check) |
| `country` | code | vocab `countries`. **Editorial** (shown as "editorial" in the UI) until a person verifies it |
| `segment` | enum | `mainstream` · `premium` (contemporary & premium) · `luxury` · `independent` (designer-led / emerging) |
| `knownInChina` | bool | editorial hint for the newcomer persona; every brand can be entered as "a brand I like" |
| `usAvailability` | enum | `yes` (listed as sold in the US — editorial, shown as "not verified") · `intl-online` (official international store; US shipping not confirmed) · `unknown` |
| `departments`, `styles`, `categories`, `fits`, `colors`, `occasions`, `sizes` | string[] | vocab ids; `styles` and `categories` need ≥1 |
| `price` | object | `tiers` 1–4 (`$` <$40 … `$$$$` $250+, per piece), `note`, `status` `estimate` \| `verified` |
| `officialUrl` | https URL or `""` | leave empty unless you are sure it is the brand's own site |
| `online`, `hasStores` | bool \| null | US online shopping / physical US stores; `null` = unknown |
| `stores` | object | `status` `verified` \| `pending` \| `none`, `summary` (general text, **no addresses**) |
| `intro` | string | one short English sentence |
| `similarTo` | `{id, note}[]` | curated links to other brands; `note` starts with "it …" |
| `source` | enum | `editorial` · `official` · `partner-feed` |
| `lastVerified` | `YYYY-MM-DD` or `""` | date a **person** checked the record; required before any `verified` status |

Product listings never live in `brands.json` (the old editorial `items` field was removed).

## Products (`products.json`)

Real products from a brand's or authorized retailer's own product page. Add a record only after
opening the page and confirming every field you enter. Never add generic or invented products.

| Field | Rules |
| --- | --- |
| `id` | unique, kebab-case |
| `brandId` | must match a brand in `brands.json`; the URL should be on that brand's site (validator warns otherwise) |
| `name` | product name as shown on the page (light casing clean-up allowed); `nameOnPage` keeps the raw text if it differs |
| `category` | vocab category |
| `color` | only if the page states it; otherwise `""` |
| `url` | the **exact** product page (https) |
| `image` | `{ url, alt }` — the image URL the brand's page itself publishes (schema.org `image` / `og:image`). Linked, not copied. `alt` describes the product |
| `price` | `{ amount, currency }` as listed on the page (ISO currency; non-USD prices are never converted) |
| `checks` | `checkedAt` (YYYY-MM-DD), `pageVerified`, `priceVerified`, `availability` (`in-stock` \| `out-of-stock` \| `unverified`), `availabilityDetail` |

`product-checks.json` holds the latest automated re-check; the app uses it when it is at least as
recent as `checks.checkedAt`. A listing whose page fails the latest check is hidden from picks.

**Image rights:** images are displayed by linking to the brand's own image URL. That is fine for a
demo, but production use needs permission — ideally an affiliate/retailer feed that licenses images.

## Link checks (`link-checks.json`)

A link is `verified` only when the page returned HTTP 2xx and its `<title>` names the brand
(short names need a whole-word match; bot-block pages are rejected). `needs-review` means the brand
appears only in the page body. A check only applies while `url` equals the brand's `officialUrl`.

## Maintenance workflow

```
powershell -ExecutionPolicy Bypass -File tools/brands-csv.ps1 -Export      # edit data/brands.csv in Excel / Sheets
powershell -ExecutionPolicy Bypass -File tools/brands-csv.ps1 -Import      # writes brands.json + validates
powershell -ExecutionPolicy Bypass -File tools/check-links.ps1             # refresh official-link checks
powershell -ExecutionPolicy Bypass -File tools/check-products.ps1          # re-check product pages, prices, stock
powershell -ExecutionPolicy Bypass -File tools/validate-brands.ps1         # validate brands + products
```

Both check tools respect robots.txt and fetch only the pages listed. Never add invented prices,
stock, addresses, products or links.
