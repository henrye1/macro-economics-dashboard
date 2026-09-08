# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point: Codex, OpenCode, Cursor, GitHub Copilot, Gemini CLI, Aider, Zed,
Windsurf, and others read `AGENTS.md`. Claude Code reads `CLAUDE.md`, which imports
this file, so there is a single source of truth.

## What this is

**Micro Economics** is a two-package monorepo that serves annual macroeconomic
data by country from public sources (IMF World Economic Outlook and World Bank
World Development Indicators) so that downstream consumers, such as IFRS 9
forward-looking-information models, can pull realised history and forecast paths
from one contract instead of scraping each source. See `CONSUMER-GUIDE.md` for
the intended v1 API contract.

Layout:

| Path   | Stack                                              | Dev URL               |
| ------ | -------------------------------------------------- | --------------------- |
| `ui/`  | Angular 20, standalone components, signals, SCSS   | http://localhost:4200 |
| `api/` | Node 22, Express 5, TypeScript (ESM), `tsx` watch  | http://localhost:3000 |

Each package has its own `package.json` and `node_modules`. There is no root
workspace, so npm commands run inside `api/` or `ui/`. In development `ng serve`
proxies `/api/*` to the API (`ui/proxy.conf.json`), so the browser only talks to
port 4200.

> TODO: the database, ingestion jobs, and auth model described in
> `CONSUMER-GUIDE.md` are not built yet. The current app is a scaffold with a
> single `/api/health` endpoint.

This project is built with the **AI Blueprint**, a workflow layer, not an
app skeleton. Never run a framework scaffolder inside this directory; it already
holds the blueprint files (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`,
`blueprint/`) and the scaffolded app.

The workflow is defined by the local skills and context files below.

## Read these when relevant

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - read before changing code
- `blueprint/context/ai-interaction.md` - read when running the Blueprint workflow
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built right now

Reuse relevant context already loaded in the session. Claude Code imports only
this file; its Blueprint skills load the other files on demand.

## Project configuration

`blueprint/config.json` is the user-owned, machine-readable workflow policy for
this project. Workflow skills read the relevant settings before acting. A
missing file means built-in defaults. An invalid file falls back to defaults for
read-only status reporting, but mutating workflow commands stop and point to
`/doctor` instead of guessing.

Configuration can make review or verification stricter and can tune local
branch names and automated-mode limits. It never grants permission to commit,
merge, push, deploy, publish, send, delete data, waive a failing check, or accept
a finding. Those approval and safety boundaries are not configurable.

`qualityGates.regular` controls automatic audit, independent-review, check, and
try-guide behavior for the normal workflow and Autopilot.
`qualityGates.continuous` controls the same per-feature gates for Continuous
Mode. Independent review defaults to `when-sensitive` in both workflows, while
audit, check, and try guide default to `manual`. Sensitive or unusually broad
work therefore selects independent review automatically; ordinary small work
does not. Setting a workflow's independent review to `manual` disables that
automatic selection, while an explicit `/audit independent current` remains
available. The other conditional modes are `when-sensitive` for audit,
`when-behavioral` for check, and `when-user-facing` for try guides. `always`
runs the gate for every work item in that workflow.

`review.independentExecution` controls how a selected independent-review gate
runs. Its default, `automatic`, uses a fresh isolated reviewer child when the
active adapter can prove isolation, exact reviewer identity and model, and
completion. Otherwise it preserves the request and falls back to the manual
handoff. This setting changes execution only; the quality-gate policy still
decides whether review is selected.
The automatic path spawns a generic child through the current runtime and gives
it the installed project-local Audit skill and review contract. It never requires
or discovers global agent roles, skills, prompts, or TraversyFlow components.
New review requests record requested execution and completed receipts record
actual execution. Manual uses `fresh session`; automatic uses `fresh subagent`;
an explicit automatic fallback records actual manual with `fresh session`.

New projects default to one review packet after all small implementation steps
(`workflow.stepReview: "feature"`) with step checkpoint commits disabled. This
keeps the normal loop reviewable without repeating the full session context after
every step. Set `stepReview` to `every` when teaching, pairing closely, or working
on a high-risk change. That restores the per-step approval pauses. To fully
restore the previous workflow, including optional checkpoint prompts after an
approved step, also set `checkpointCommits` to `enabled`. Onboarding presents
these pairs as Efficient and Guided choices, but stores only the two low-level
settings. They can be changed at any time. Both styles end with an optional
read-only code walkthrough. Review cadence controls approval pauses, not whether
the user can ask for an explanation of the finished implementation.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. Each step's instructions
are plain markdown skills any capable agent can read and follow. The workflow is
exposed through tool-specific adapters:

- Codex: `.agents/skills/<skill>/SKILL.md`
- Claude Code: `.claude/skills/<skill>/SKILL.md`
- GitHub Copilot: `AGENTS.md` plus `.agents/skills/<skill>/SKILL.md`
- OpenCode: `AGENTS.md` plus the compatible `.agents/skills/` or
  `.claude/skills/` tree already installed for the selected tools

Unused adapters can be removed. Codex, GitHub Copilot, and OpenCode can share
`.agents/`. OpenCode can also reuse `.claude/` when Claude Code is selected.
Codex-only, Copilot-only, or OpenCode-only projects can delete `CLAUDE.md` and
`.claude/`. Claude Code-only projects can delete `.agents/`, but should keep
`AGENTS.md` because `CLAUDE.md` imports it. Do not duplicate the same Blueprint
skills under `.opencode/skills/`; OpenCode already discovers the compatible
trees.

When changing shared workflow behavior, update the matching skill in both
adapter folders so Codex, Claude Code, GitHub Copilot, and OpenCode stay aligned.

Core skills:

- `onboard` - tune commands, standards, visibility, ignore rules, and tool adapters after overlaying the Blueprint onto a freshly scaffolded or early project
- `discovery` - optional deep, multi-turn planning conversation that drafts the two user-owned plans only after review and approval; direct plan writing remains fully supported
- `doctor` - Blueprint health check for setup, adapters, plans, overview freshness, dashboard state, and workflow drift; it may offer to reset only malformed generated dashboard state after approval
- `adopt` - bootstrap the Blueprint into an existing brownfield app with shipped features
- `overview` - distill the two planning docs into
  `blueprint/context/project-overview.md`, then offer a reviewed initial planning
  baseline commit before Feature 1
- `brief` - read-only briefing on an upcoming build-plan feature (scope, dependencies, size) before you spec it
- `feature` - turn a build-plan item into a spec, or propose a reviewed plan addition for a genuinely new feature
- `debug` - reproduce and isolate a failure without editing code, then hand the evidence to `fix` or `implement`
- `fix` - document an ad-hoc bug or change into `blueprint/context/current-feature.md`
- `tests` - add or normalize unit testing and turn on the test gate
- `browser-tests` - explicitly add or normalize a repeatable browser test harness and document its command
- `ci` - explicitly set up one project-specific Verify command and matching automatic GitHub checks
- `implement` - build the current spec one small, reviewed step at a time
- `check` - prove the current spec against the running app
- `try` - read-only manual review guide: where to go, what to click, what to expect
- `audit` - branch-aware or full-project review across all concerns or a focused quality, security, performance, or tests lens; `audit independent current` prepares an immutable checkpoint for a fresh reviewer session or configured isolated reviewer child; records findings in `blueprint/context/findings.md` and independent receipts in `blueprint/context/review.md`, where blocking findings or stale review state stop `complete`
- `rollback` - plan a safe reversal of a completed feature from its archive and exact git commit, with later-dependency review before code changes
- `complete` - run the final safety pass, log features, fixes, or rollbacks under `blueprint/history/`, then merge with approval
- `release` - optional Render or Vercel deployment readiness, local config, env review, and smoke-test planning
- `prototype` - optional, pre-build static mockups to lock the look
- `status` - read-only progress summary, workflow drift warning, and suggested next action

In Codex, invoke these as skills (`$onboard`, `$discovery`, `$overview`, `$feature`,
`$implement`, and so on) or ask naturally, such as "run the overview." In Claude
Code, use the slash commands (`/onboard`, `/discovery`, `/overview`, `/feature`,
and so on). In OpenCode or other tools without a dedicated invocation syntax,
ask the agent to run the matching skill or follow its `SKILL.md` manually. The
conventions in `blueprint/context/` apply however a step is invoked. `/discovery`
is never required: users may write detailed plans directly or develop them
through any conversation before running `/overview`.

Optional explicit-only skill: `autopilot` combines `feature` or `fix` with
`implement` in one bounded pass when directly invoked, including the configured
regular quality gates. The normal workflow stops for human approval of the spec
before implementation; Autopilot continues through that review point. It may
create checkpoint commits on the feature or fix branch after passing steps and
repair confirmed P0/P1 findings when its audit gate runs. It stops before
`/complete`, merge, push, deploy, or destructive actions.

Optional explicit-only skill: `continuous` can resume or select the next planned
feature and repeat the complete local feature lifecycle through the configured
limit or end of the build plan. It creates one branch and one local main commit
per feature, applies the Continuous quality gates, archives and merges serially,
and stops on decisions or failed safety gates. It never pushes, deploys,
publishes, sends, or performs destructive actions.

Deployment is also explicit. `/release` can prepare local Render or Vercel config
and run readiness checks, but it must stop before deploy, remote service changes,
push, or publish unless the user gives a separate yes in the current chat.

## Dashboard activity

The dashboard can show the active or most recent substantial Blueprint command
from `blueprint/.state/run.json`. This file is generated local state, ignored by
Git, and never part of a feature commit.

Commands with meaningful progress or a durable handoff should write it when the
state directory exists: `onboard`, `adopt`, `discovery`, `overview`, `feature`,
`fix`, `rollback`, `implement`, `debug`, `check`, `audit`, `tests`,
`browser-tests`, `ci`, `prototype`, `autopilot`, `continuous`, `complete`, and
`release`. Short orientation commands such as `brief`, `try`, `status`, and
`doctor` do not need activity state. Doctor's optional approved reset removes
malformed activity instead of recording another run.

Writing the initial activity record is the first action of a tracked command,
before project inspection, preflight, or other tool calls. This one generated
state write does not authorize product changes or bypass any safety check.

Never create or edit `run.json` directly. From the project root, use the first
helper that exists:

```text
node .agents/skills/doctor/scripts/run-state.mjs <action> <options>
node .claude/skills/doctor/scripts/run-state.mjs <action> <options>
```

Start with `start --command <skill> --summary <truthful-summary> --boundary
<boundary>`. Use `update` at meaningful milestones or for a blocker, with
`--status blocked` and `--resume <exact-command>` when recovery is needed. End
with `finish --status ready|completed --summary <truthful-summary>`. The helper
validates every field before atomically replacing the generated file. If it is
missing or fails, report the activity warning and continue the workflow without
writing a manual fallback.

The helper writes this schema:

```json
{
  "schemaVersion": 1,
  "command": "continuous",
  "status": "running",
  "summary": "Completing the remaining build plan",
  "detail": "Implementing feature 3.",
  "boundary": "local-only",
  "startedAt": "<ISO-8601 timestamp>",
  "updatedAt": "<ISO-8601 timestamp>",
  "resumeCommand": "/continuous resume",
  "progress": { "current": 2, "total": 5, "label": "features" },
  "feature": { "id": "3", "title": "Export reports" }
}
```

`status` must be `running`, `blocked`, `ready`, or `completed`. Use `ready` when
the command reached its intended review handoff, such as Autopilot waiting for
review before `/complete`. Use `blocked` with the exact recovery command when
work can resume. `boundary` must be `read-only`, `reviewed`, or `local-only`.
The progress, feature, detail, boundary, and resume fields are optional. Never
put secrets, raw logs, prompts, or user content in this file. Activity tracking
must not change a command's approval boundaries or turn a reporting failure into
a workflow failure.

## Automatic verification

Automatic GitHub checks are a separate explicit setup. `/onboard` and `/adopt`
only report existing checks and point to `/ci` or `$ci` when none exist. Running
`/ci` inspects the real project and defines one `Verify` command from checks that
already exist. Use this order when available: typecheck, tests, then build. Never
invent a test runner or another check just to fill the command.

For JavaScript and TypeScript projects, prefer a package script such as `verify`
and use the detected package manager. For other stacks, use the native task
runner or exact combined command. Record the exact command under Commands below.

The optional `.github/workflows/verify.yml` must run that same command for pull
requests and pushes to the default branch. Preserve existing workflows, use the
project's real runtime and install command, and grant only `contents: read` by
default. This setup does not add local git hooks, coverage, browser tests,
security scans, or version matrices. Those remain later project choices.

GitHub branch protection or a ruleset can require the check after the repository
is pushed, but that is a separate remote setting. Missing automatic GitHub
checks do not make the Blueprint unusable.

## Commands

Two packages, no root workspace. Run each command from its own directory.

**api/** (npm, `package-lock.json`)

- Dev server: `npm run dev` (tsx watch, http://localhost:3000)
- Build: `npm run build` (tsc to `dist/`)
- Production server: `npm start`
- Typecheck: `npm run typecheck` (source and tests)
- Test: `npm test` (Vitest, one shot)
- Test watch: `npm run test:watch`

**ui/** (npm, `package-lock.json`)

- Dev server: `npm start` (ng serve, http://localhost:4200, proxies `/api/*`)
- Build: `npm run build` (production bundle to `dist/ui`)
- Typecheck: covered by `npm run build`; no separate script
- Test: `npm test` (Karma and Jasmine, headless Chrome, one shot)
- Test watch: `npm run test:watch`

No lint command is configured in either package. No `Verify` command exists yet.

Testing is **on**. Both packages declare a `Test` command above, so tests are a
gate for logic-bearing steps as defined in
`blueprint/context/coding-standards.md`. Each package uses the runner native to
its stack:

- `api/` uses **Vitest**. Tests live beside their source as `*.test.ts` and are
  excluded from the emitted build; `tsconfig.spec.json` keeps them typechecked.
- `ui/` uses the **Angular Karma and Jasmine** builder that came with the
  scaffold. Specs live beside their source as `*.spec.ts`.

There is no root `package.json`, so there is no single command that runs both.
Run `npm test` in each package you changed.

Browser testing is also opt-in. Run `/browser-tests` or `$browser-tests` to add
or normalize a browser harness and document its exact command as `Browser
tests`. Check and Continuous Mode can then reuse it without installing tooling
mid-feature.
