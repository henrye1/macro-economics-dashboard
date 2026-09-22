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
- [x] 7. **Macro API service** - Express passthrough for the five read routes with
  server-side Auth0 token caching and retry
- [x] 8. **Live data wiring** - swap the fixture provider for the real service, including
  ETag passthrough and RFC 7807 error handling
- [x] 9. **Vintages & revisions** - published vintage list and the change view against the
  preceding vintage
- [x] 10. **Saved queries** - name, store, reload and reproduce a query with its pinned
  vintage ids
- [x] 11. **Export** - CSV and JSON download of the current result with optional
  vintage ids in the file header. XLSX was dropped on 2026-09-11: writing one needs
  a spreadsheet dependency, and the UTF-8 byte-order mark added in `e2267e1` makes
  the CSV open correctly in Excel, which was the format's main reason to exist.
- [x] 12. **Request builder** - live URL and curl for the working query, real response
  envelope and headers, and the status code reference
- [ ] 13. **Deployment readiness** - configure both Render services, env vars, health
  check and CORS, and verify the production build (run via `/release render`)

## Post-MVP

- [ ] 14. **Authentication** - Supabase Auth sign-in behind the existing auth middleware
  seam, replacing feature 19's fixture auth provider
- [ ] 15. **Roles** - role checks on the routes that need them
- [ ] 16. **Saved query accounts** - move saved queries to Supabase, keyed by user, with a
  one-time migration from localStorage
- [ ] 17. **Generated API types** - replace the hand-written contract types with types
  generated from the Core API OpenAPI document, once its URL and credentials are available
- [x] 18. **App shell split** - `app.html` is the shell: topbar, tabs, main and
  attribution footer, with every route rendering inside it. Extract that into a
  console shell component, add an auth layout beside it for the full-bleed
  split-panel screens feature 19 needs, and convert the seven flat routes into
  two parents with children so a route chooses its chrome. No new screens and no
  visible change: the seven tabs render identically before and after, which is
  the whole done-when. Its own feature because it moves `app.ts`, `app.html`,
  `app.scss` and `app.spec.ts` wholesale and is the one change that can break
  every existing tab at once.
- [x] 19. **Auth screens** - sign in, reset password, and accept invitation
  including its expired state, built against a typed auth provider seam backed
  by fixtures, the way feature 1 built the console before feature 8 wired live
  data. Adds the route guard that sends a visitor with no session to sign-in.
  No Supabase, no email, no token verification and no API change: `authSeam`
  stays a no-op. Build before 14, which replaces the fixture provider and is the
  point at which the seam earns its keep. The reference draws only the
  request-a-link half of reset; the screen that consumes the emailed link reuses
  the accept-invitation form and needs a design review before it is built.
- [ ] 20. **Administration** - the page the sign-in copy points at: user list,
  invitation issue and revoke, and role assignment. Not designed yet. Needs a
  mockup before it can be specced, and needs 14 and 15 to be real work rather
  than fixtures.
