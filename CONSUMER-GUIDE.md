# Macro Data Service — Consumer Guide

A developer guide for consuming the Cyte macroeconomic data service. Written for anyone building against the Core API: suite modules, Bootsure, other Core API modules, and external M2M integration clients.

> **Status note:** this guide describes the v1 contract as designed. Response examples are illustrative; the OpenAPI document (Scalar) on the Core API is the authoritative machine-readable contract.

---

## 1. What this service gives you

Annual macroeconomic data for **every country**, from two public sources, served from Cyte's own database:

| Source | Code | What it contributes | Updated |
|---|---|---|---|
| IMF World Economic Outlook | `IMF_WEO` | Realised history **and IMF staff forecasts** (~5 years forward), ~145 factors per country | Twice a year (April & October), occasional interim updates |
| World Bank World Development Indicators | `WB_WDI` | Realised history only, curated set of 10 core indicators | A few times per year |

Typical uses:

- **IFRS 9 forward-looking information (FLI):** the WEO forecast path (GDP growth, inflation, unemployment, …) as scenario input to expected-credit-loss models.
- **Benchmarking and dashboards:** history + forecast series for any country, chart-ready.
- **Reproducible reporting:** re-fetch exactly the numbers that were current at a past reporting date (see *Vintages*, §4).

Three properties worth internalising before you integrate:

1. **You never hit the IMF or World Bank.** Cyte ingests on a schedule and serves from its own store. Upstream outages never affect your reads — at worst the data is a day less fresh.
2. **Data is annual.** One value per indicator, per country, per calendar year. No quarterly/monthly frequencies in v1.
3. **Published data is immutable.** New upstream releases create a *new vintage*; old vintages remain queryable forever.

---

## 2. Authentication

Every endpoint requires a valid Auth0 access token for the Cyte Core API. There is **no macro-specific scope** — any authenticated consumer can read.

**M2M clients (Bootsure, external integrations):** client-credentials grant with your assigned client id/secret:

```bash
curl -s https://<auth0-domain>/oauth/token \
  -H 'content-type: application/json' \
  -d '{ "grant_type": "client_credentials",
        "client_id": "<your-client-id>",
        "client_secret": "<your-client-secret>",
        "audience": "<core-api-audience>" }'
```

**Suite UI / suite API callers:** your existing suite token works as-is (both authentication schemes are accepted).

Then call with the bearer token:

```bash
curl -s "https://<core-api-host>/api/macro/series?indicators=GDP_GROWTH_REAL&countries=ZAF" \
  -H "Authorization: Bearer $TOKEN"
```

On `401`, refresh your token. Admin endpoints (`api/admin/macro/*`) are sysadmin-only and not part of the consumer surface.

---

## 3. Core concepts

### 3.1 Indicators — the canonical taxonomy

You always query by **canonical indicator codes** like `GDP_GROWTH_REAL`, never by raw source codes (`NGDP_RPCH`, `NY.GDP.MKTP.KD.ZG`). The service maintains the mapping so your code doesn't have to care which upstream a number came from.

**The curated set (v1)** — stable, documented, recommended for modelling:

| Code | Name | Unit | WEO | WDI |
|---|---|---|---|---|
| `GDP_GROWTH_REAL` | Real GDP growth | Percent | ✔ | ✔ |
| `CPI_INFLATION_AVG` | Inflation, average CPI | Percent | ✔ | ✔ |
| `CPI_INFLATION_EOP` | Inflation, end of period CPI | Percent | ✔ | — |
| `UNEMPLOYMENT_RATE` | Unemployment rate | Percent of labour force | ✔ | ✔ |
| `GOVT_DEBT_GDP` | General government gross debt | Percent of GDP | ✔ | — |
| `FISCAL_BALANCE_GDP` | Govt net lending/borrowing | Percent of GDP | ✔ | — |
| `CURRENT_ACCOUNT_GDP` | Current account balance | Percent of GDP | ✔ | ✔ |
| `GDP_PER_CAPITA_USD` | GDP per capita, current prices | US dollars | ✔ | ✔ |
| `REAL_INTEREST_RATE` | Real interest rate | Percent | — | ✔ |
| `LENDING_RATE` | Lending interest rate | Percent | — | ✔ |
| `PRIVATE_CREDIT_GDP` | Domestic credit to private sector | Percent of GDP | — | ✔ |
| `BROAD_MONEY_GDP` | Broad money | Percent of GDP | — | ✔ |
| `REER_INDEX` | Real effective exchange rate | Index (2010=100) | — | ✔ |

**The full WEO breadth** is also available: every other WEO factor is auto-registered under a `WEO_`-prefixed code (e.g. `WEO_NGAP_NPGDP`). These carry names/units taken from the IMF codelist but are not curated — use them when you know the WEO factor you want. Discover them with `GET /api/macro/indicators?curated=false`.

**Units matter.** Indicators mix percent, index values, and US-dollar amounts. Every indicator carries `unit` (and sometimes `scale`) metadata — read it, never assume. Values are stored exactly as the source reports them; no unit conversion is applied.

### 3.2 Sources and "preferred"

Some indicators exist in both sources (e.g. GDP growth). By default the service resolves `source=preferred` per indicator — WEO wins where it exists, because it extends into forecast years. You can force a source with `source=IMF_WEO` or `source=WB_WDI`. Every observation in a response tells you which source it came from.

### 3.3 Actuals vs forecasts

WEO series include IMF staff projections. Every observation carries `isForecast`:

- `false` — realised history (at the time the vintage was published)
- `true` — IMF projection

Filter server-side with `forecast=actual` or `forecast=forecast`, or split client-side. WDI data is always actuals. Series responses also give you `lastActualYear` per series — the boundary year.

**FLI note:** what counts as "actual" is vintage-relative. In the WEO 2026 April vintage, 2025 may still be an estimate; in the October vintage it may be realised. This is exactly why vintages exist.

### 3.4 Vintages — point-in-time reproducibility

A **vintage** is one immutable snapshot of one source. When the IMF or World Bank publish changed data, Cyte ingests it as a *new* vintage; nothing is overwritten.

- Default queries use `vintage=latest` — the newest published snapshot per source.
- Pin a vintage by id or label (`vintage=WEO 9.0.0 2026-04-15`) to reproduce a past state **exactly** — the numbers can never change under you. Pinning a vintage implies its source.
- List what exists with `GET /api/macro/vintages`.

**If your output must be reproducible (IFRS 9 reporting, audit, backtests): record the vintage ids from `meta.vintages` alongside your results, and re-query with those ids pinned when you need to reproduce.** This is the single most important integration habit for this service.

### 3.5 Countries

Countries are identified by **ISO 3166-1 alpha-3** codes (`ZAF`, `NAM`, `KEN`, `GBR`, …) — the same codes as the central Cyte geo country service (`GET /api/geo/countries`), which is the platform-wide country reference.

- `GET /api/macro/countries` tells you which countries actually **have macro data**, per source.
- An unknown/invalid code → `400` with the offending code named.
- A valid code with no data for your query → `200` with an empty result. Not every source reports every indicator for every country (e.g. WEO has no unemployment rate for Namibia). **Design for absence, not for nulls** — missing series simply don't appear.
- Regional aggregates ("Sub-Saharan Africa", "Euro area") are **not** served in v1 — countries only.

---

## 4. The endpoints

Base route: `/api/macro`. All responses share one envelope:

```json
{
  "data": [ ... ],
  "meta": {
    "page": 1, "pageSize": 500, "totalCount": 1234,
    "vintages": [ { "id": 12, "source": "IMF_WEO", "label": "WEO 9.0.0 2026-04-15" } ],
    "attribution": [ "Source: IMF World Economic Outlook database",
                     "Source: World Bank World Development Indicators (CC BY 4.0)" ]
  }
}
```

Pagination: `page` (1-based) and `pageSize` (default 500, max 5000). Errors are RFC 7807 `application/problem+json` — read `detail` for the human explanation.

### 4.1 `GET /api/macro/countries` — what can I query?

Countries with data in the latest vintages, names resolved from the geo service:

```json
{ "data": [
    { "iso3": "ZAF", "name": "South Africa", "sources": [ "IMF_WEO", "WB_WDI" ] },
    { "iso3": "NAM", "name": "Namibia",      "sources": [ "IMF_WEO", "WB_WDI" ] } ] }
```

### 4.2 `GET /api/macro/indicators` — the catalogue

Query params: `curated` (default `true`; `false` adds the auto-registered WEO factors), `category`, `source`, `q` (substring search on code/name), pagination. Single item: `GET /api/macro/indicators/{code}`.

```json
{ "data": [ {
    "code": "GDP_GROWTH_REAL", "name": "Real GDP growth", "unit": "Percent",
    "scale": null, "category": "growth", "curated": true,
    "sources": [
      { "source": "IMF_WEO", "sourceCode": "NGDP_RPCH", "preferred": true },
      { "source": "WB_WDI", "sourceCode": "NY.GDP.MKTP.KD.ZG", "preferred": false } ] } ] }
```

### 4.3 `GET /api/macro/observations` — the workhorse

Flat rows; best for ingestion into your own store or model input pipelines.

| Param | Default | Notes |
|---|---|---|
| `indicators` | **required** | csv of canonical codes |
| `countries` | all countries | csv of ISO3 |
| `yearFrom` / `yearTo` | unbounded | inclusive |
| `source` | `preferred` | `IMF_WEO` \| `WB_WDI` \| `preferred` |
| `vintage` | `latest` | vintage id or label to pin |
| `forecast` | `all` | `actual` \| `forecast` |
| `page` / `pageSize` | 1 / 500 | max 5000 |

```
GET /api/macro/observations?indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG&countries=ZAF,NAM&yearFrom=2020&yearTo=2030
```

```json
{ "data": [
    { "indicator": "GDP_GROWTH_REAL", "country": "ZAF", "year": 2024,
      "value": 0.6, "isForecast": false, "source": "IMF_WEO", "vintageId": 12 },
    { "indicator": "GDP_GROWTH_REAL", "country": "ZAF", "year": 2027,
      "value": 1.8, "isForecast": true, "source": "IMF_WEO", "vintageId": 12 } ] }
```

### 4.4 `GET /api/macro/series` — chart/model-ready

Same filters as `/observations`, grouped one object per (indicator, country). Pagination counts **series**, not rows.

```json
{ "data": [ {
    "indicator": "GDP_GROWTH_REAL", "name": "Real GDP growth", "unit": "Percent",
    "country": "ZAF", "source": "IMF_WEO", "vintage": "WEO 9.0.0 2026-04-15",
    "lastActualYear": 2025,
    "points": [ { "year": 2024, "value": 0.6, "isForecast": false },
                { "year": 2026, "value": 1.5, "isForecast": true } ] } ] }
```

### 4.5 `GET /api/macro/vintages` and `GET /api/macro/vintages/{id}/revisions`

- `/vintages?source=IMF_WEO` — every published snapshot, newest first (`id`, `label`, `sourceVersion`, `retrievedAtUtc`, `isLatest`).
- `/vintages/{id}/revisions?countries=&indicators=` — what that vintage **changed** versus its predecessor: previous vs new value per (indicator, country, year), plus appeared/disappeared series. This is the governance view — "what did the new WEO release do to my inputs?" Only *significant* value changes are flagged (default: >10% relative or >0.5 absolute).

---

## 5. Recipes

### 5.1 Feed an ECL model with the forecast path (FLI)

```
1. GET /api/macro/series?indicators=GDP_GROWTH_REAL,CPI_INFLATION_AVG,UNEMPLOYMENT_RATE
       &countries=ZAF&yearFrom=2018
2. Split each series at lastActualYear → history (fit) vs forecast (scenario path).
3. Persist meta.vintages ids with the model run.
```

### 5.2 Reproduce a previous reporting date

```
1. Look up the vintage ids you stored with the original run (or find them via GET /vintages
   by retrievedAtUtc ≤ reporting date).
2. Re-run the same query with &vintage={id}. Values are guaranteed identical.
```

### 5.3 React to a new WEO release

```
1. Poll GET /api/macro/vintages?source=IMF_WEO (daily is plenty; use ETag, see §6).
2. On a new isLatest id: GET /vintages/{id}/revisions?countries=ZAF,NAM
   to see which inputs moved materially.
3. Re-pull your series; decide whether models need re-running.
```

### 5.4 Discover a non-curated WEO factor

```
1. GET /api/macro/indicators?curated=false&q=savings
2. Use the returned code (e.g. WEO_NGSD_NGDP) in /observations or /series as usual.
```

---

## 6. Caching, freshness, and polite consumption

- **ETags:** responses carry an `ETag` derived from the underlying vintages. Send `If-None-Match` on repeat queries; you'll get `304 Not Modified` until a new vintage publishes. Responses also carry `Cache-Control: private, max-age=3600`.
- **Freshness:** data changes at most daily (ingestion runs overnight SAST); meaningful WEO changes arrive around April and October. Polling more than daily buys you nothing.
- **Volume:** prefer filtered queries (`countries`, `yearFrom`) over pulling everything; if you do need bulk, use `pageSize=5000` and iterate pages rather than hammering small pages.

---

## 7. Attribution and licensing

Every response's `meta.attribution` carries the source attribution strings. If you display or redistribute this data:

- **World Bank WDI** is CC BY 4.0 — attribution is **required** in anything user-facing.
- **IMF WEO** — surface the attribution string in user-facing output; check IMF terms before redistributing outside the Cyte ecosystem.

The simplest compliant approach: render `meta.attribution` verbatim as a data-source footnote wherever the numbers are shown.

---

## 8. Error handling reference

| Status | Meaning | Typical cause |
|---|---|---|
| `400` | ProblemDetails, `detail` names the issue | Unknown indicator code, unknown ISO3 code, `yearFrom > yearTo`, bad `source`/`forecast` value, missing `indicators` |
| `401` | Not authenticated | Missing/expired token — refresh and retry |
| `404` | Not found | Unknown indicator on `/indicators/{code}`, unknown or never-published vintage |
| `304` | Not modified | Your cached copy is still current (ETag hit) |
| `5xx` | Server fault | Not caused by upstream IMF/World Bank outages (reads never touch them) — report it |

Empty `data` with `200` is **not** an error: the query was valid, the source just doesn't report that combination.

---

## 9. FAQ

**Why do WEO and WDI disagree on the same indicator/year?**
Different compilation methods and revision cycles. Use `preferred` (default) for one consistent answer, or pick a source explicitly and stay consistent within one analysis.

**Why did a historical value change between my pulls?**
You queried `latest` across a vintage boundary — sources revise history. If that's unacceptable, pin a vintage (§3.4). Check `/vintages/{id}/revisions` to see what moved.

**Can I get quarterly/monthly data? Exchange rates?**
Not from this service (annual only, v1). Daily exchange rates live on the geo proxy: `GET /api/geo/exchangeRates/{date}`.

**How far back / forward does data go?**
History from 2010 (configurable server-side), forward through the WEO forecast horizon (~current year + 5).

**A country I need isn't in `/api/macro/countries`.**
Then the sources don't report it (or its data hasn't been ingested yet). All ISO3 countries the sources cover are ingested automatically — there is no onboarding step. Check `/api/geo/countries` for the code, and confirm with a direct `/observations` query.

**Who do I contact about data quality?**
Raise it with the Cyte core team, quoting the `vintageId` and the exact query — vintages make issues perfectly reproducible.
