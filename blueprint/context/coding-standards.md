# Coding Standards

> This project's conventions, tuned by `/onboard` to the real stack: Angular 20
> (standalone components, signals) in `ui/`, Express 5 on Node 22 with
> TypeScript ESM in `api/`. Edit freely as the project develops. Sections marked
> `> TODO` are conventions the code has not established yet; fill them in when
> the first real case lands rather than guessing now.

## Repository layout

- Two independent npm packages, no root workspace and no root `package.json`.
- `api/` - Express 5 API. Source in `api/src`, compiled to `api/dist`.
- `ui/` - Angular 20 app. Source in `ui/src`.
- Run npm commands from inside the package directory. See Commands in
  `AGENTS.md`.
- Shared types are currently duplicated across the boundary (for example
  `Health` in `ui/src/app/core/api.ts`). Keep response shapes narrow and
  explicit on both sides.
  > TODO: if the duplication grows, decide on a shared contract package or a
  > generated client and record it here.

## TypeScript

- Strict mode is on in both packages. `api/` also sets
  `noUncheckedIndexedAccess`; `ui/` also sets `noPropertyAccessFromIndexSignature`
  and `noImplicitReturns`. Do not weaken these to make code compile.
- No `any`. Use precise types or `unknown` plus a narrowing check.
- Define interfaces for API responses, request payloads, and data models.
- Use type inference where obvious, explicit types where they document intent.
- `api/` is ESM with `NodeNext` resolution: **relative imports need the `.js`
  extension** (`import { config } from './config.js'`), even though the source
  is `.ts`. `ui/` imports have no extension.

## API (api/)

- `createApp()` in `src/app.ts` builds and returns the Express app; `src/index.ts`
  only listens. Keep it that way so the app is testable without a live port.
- All routes mount under `/api` through `src/routes/index.ts`. Add a router per
  resource in `src/routes/<resource>.ts` and register it there.
- Read configuration only through `src/config.ts`. No `process.env` access
  elsewhere. Add new settings there with a safe default, and to `.env.example`.
- Errors: throw or forward to the shared `errorHandler`
  (`src/middleware/error-handler.ts`). It owns the response shape
  (`{ error }`), the 404 shape (`{ error, path }`), status selection, and the
  rule that 500 details are logged, never returned. Do not hand-roll error
  responses in a route.
- Validate every request input (params, query, body) at the route boundary and
  return 400 on failure. Never trust a client-supplied identifier.
  Use **Zod** (`zod`, v4) for request bodies: one schema per body beside the
  module that owns it, `safeParse` at the route, and a fixed-string `400` on
  failure. Never echo the input or a Zod issue in the response.
- Keep route handlers thin. Business logic and data access belong in modules a
  handler calls, not inline.

## UI (ui/)

- Standalone components only; no `NgModule`. Declare component dependencies in
  the `imports` array.
- Use `inject()` for dependencies, not constructor parameter injection.
- Use signals for component state (`signal`, `computed`). Mark component state
  `protected readonly` when only the template reads it, as in `app.ts`.
- HTTP goes through injectable services in `src/app/core/` (see `core/api.ts`),
  never `HttpClient` directly in a component.
- Call the API with relative `/api/...` paths so the dev proxy and production
  both work. Never hardcode `http://localhost:3000`.
- Providers are registered in `src/app/app.config.ts`; routes in
  `src/app/app.routes.ts`.
- Prefer separate `.html` and `.scss` files per component, matching the
  scaffolded `app` component.

## File organization

- API routes: `api/src/routes/<resource>.ts`
- API middleware: `api/src/middleware/<name>.ts`
- UI feature components: `ui/src/app/<feature>/<name>.ts` plus `.html`, `.scss`
- UI shared services: `ui/src/app/core/<name>.ts`

## Naming

- Files: kebab-case (`error-handler.ts`, `country-detail.ts`)
- Angular components and injectables: PascalCase class names (`App`, `Api`)
- Functions and variables: camelCase
- Types and interfaces: PascalCase, no `I` prefix
- Exported constants: camelCase for objects (`config`), SCREAMING_SNAKE_CASE for
  true literals

## Styling

- SCSS. Global styles in `ui/src/styles.scss`, component styles in the
  component's `.scss` file.
- No inline styles, no CSS framework installed.
  > TODO: no design system or theming approach is established yet. Decide before
  > the first substantial UI feature, or run `/prototype` to lock the look first.

## Data access

> TODO: no database, ORM, or ingestion layer exists yet. `CONSUMER-GUIDE.md`
> describes the intended data service. When the first data feature lands, record
> the chosen store, migration command, and query conventions here.

## Testing

The blueprint installs no test runner; testing is opt-in at the project level,
because the overlay can't know your stack. Adding unit testing is an explicit
setup task the AI can do through the normal workflow, either as a build-plan item
or with `/tests`. The setup should choose the stack-native runner, wire the
scripts or commands, add a small example test, and update the Commands section
of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. The command does not enable an absent
test runner or replace focused evidence. It gives local work and optional CI one
exact command to run. `/ci` owns Verify and CI setup. `/tests` adds the real test
command to Verify when it already exists, but never creates CI only because
testing was configured.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  parsers, formatters, validators, id/slug builders, server actions. These have
  assertable inputs and outputs and real edge cases (empty, missing, malformed).
- **What not to test:** UI components and integration-level surfaces (render or
  export routes, anything driving a real browser or external service). Verify those
  with a screenshot and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. The project's test command
  must be green before the step is approved, before any checkpoint commit, and
  before `/complete` merges. UI and integration-only steps are exempt and ride on
  screenshot plus build evidence.
- **When it's named:** the `/feature` spec's Testing section predicts the coverage,
  `/implement` writes the test with the step, and if a step surfaces logic the spec
  didn't foresee, add a focused test then.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `feature.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`), not a
  hardcoded tool name.

Stack binding for this project: both packages declare a `Test` command in
`AGENTS.md`, so **the gate is on**. `api/` uses Vitest with `vi.mock()` for
external dependencies and `vi.useFakeTimers()` for time-dependent logic; its
tests are named `*.test.ts`, sit beside their source, are excluded from the
emitted build, and are typechecked through `tsconfig.spec.json`. `ui/` uses the
Angular Karma and Jasmine builder with `*.spec.ts` beside their source, and
`TestBed` for component and injection-token work. There is no root
`package.json`, so run `npm test` in whichever package you changed.
Until then, verify logic by running the app, hitting the endpoint, and building.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- Browser automation is separately opt-in through `/browser-tests`. That setup
  reuses a compatible runner or prefers Playwright for supported projects, then
  documents the exact command as `Browser tests` in `AGENTS.md`.
- When `Browser tests` is declared, add focused coverage for stable behavioral
  done-whens when it is proportionate, and run the documented command during
  `/check`. Do not assume it proves visual fidelity, real authenticated-profile
  behavior, browser chrome, or another claim the test does not observe.
- If no Browser tests command is declared, do not add a runner silently in the
  middle of an unrelated feature. Use the available dev server, browser
  screenshots, build output, API output, or manual evidence instead.
- Browser tests are not part of the default Verify command or CI unless the user
  separately chooses that slower gate.
- Browser evidence is especially important for flows that click, type, submit,
  navigate, download files, render complex layouts, or depend on client-side
  state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
