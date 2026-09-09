# Build Plan

## MVP

- [x] 1. **App shell** - seven-tab navigation, Angular Material setup, header vintage
  strip, attribution footer, hand-written API contract types, and a typed data
  provider seam backed by fixtures
- [x] 2. **Overview page** - service summary, source cadence, and the countries,
  indicators and vintages counts
- [x] 3. **Working query** - shared query state (indicators, countries, years, source,
  forecast, vintage) that persists across tabs
- [x] 4. **Catalogue browsing** - searchable country list plus the indicator catalogue
  with category, source and curated filters, where clicking an indicator row adds it
  to the working query
- [x] 5. **Observations table** - paginated flat rows with actual and forecast badges and
  honest empty states
- [x] 6. **Series view** - grouped series per indicator and country with the
  `lastActualYear` boundary made visible
- [ ] 7. **Macro API service** - Express passthrough for the five read routes with
  server-side Auth0 token caching and retry
- [ ] 8. **Live data wiring** - swap the fixture provider for the real service, including
  ETag passthrough and RFC 7807 error handling
- [ ] 9. **Vintages & revisions** - published vintage list and the change view against the
  preceding vintage
- [ ] 10. **Saved queries** - name, store, reload and reproduce a query with its pinned
  vintage ids
- [ ] 11. **Export** - CSV, JSON and XLSX download of the current result with optional
  vintage ids in the file header
- [ ] 12. **Request builder** - live URL and curl for the working query, real response
  envelope and headers, and the status code reference
- [ ] 13. **Deployment readiness** - configure both Render services, env vars, health
  check and CORS, and verify the production build (run via `/release render`)

## Post-MVP

- [ ] 14. **Authentication** - Supabase Auth sign-in behind the existing auth middleware
  seam
- [ ] 15. **Roles** - role checks on the routes that need them
- [ ] 16. **Saved query accounts** - move saved queries to Supabase, keyed by user, with a
  one-time migration from localStorage
- [ ] 17. **Generated API types** - replace the hand-written contract types with types
  generated from the Core API OpenAPI document, once its URL and credentials are available
