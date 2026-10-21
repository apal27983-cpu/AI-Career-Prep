# AI Career Preparation

A full-stack interview preparation app. Candidates keep a career profile, upload a
resume, get a skill gap report against a target role, and practise interviews in
four modes with structured AI feedback on every answer.

It is a working application, not a UI prototype: the React client talks only to the
Express API, the API owns the database and the LLM key, and every AI response is
validated against a schema before it is stored or shown.

---

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Switching LLM provider](#switching-llm-provider)
- [Running in development](#running-in-development)
- [Running the tests](#running-the-tests)
- [API reference](#api-reference)
- [Security model](#security-model)
- [Cost control](#cost-control)
- [Installing as an app (PWA)](#installing-as-an-app-pwa)
- [Production build and deployment](#production-build-and-deployment)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)

---

## What it does

**Career profile.** Registration, then an onboarding form covering current and
target role, experience level, education, skills, learning goals and an optional
job description. Validated with the same Zod schema on both sides.

**Resume analyzer.** Drag-and-drop PDF or DOCX upload, then a target role, then
the review - all on one page. The server validates the extension, MIME type and
file signature, extracts the text layer, and runs a deterministic section-based
extractor over it. Everything it finds is editable, and anything it could not
establish is left empty rather than guessed.

The review answers "how well does this resume fit this role?" and separates two
kinds of statement:

| | Source | Examples |
| --- | --- | --- |
| **Measured** | Computed in backend code | Summary present, contact fields found, share of bullets containing a number, share led by an action verb, longest bullet, word count |
| **Estimated** | AI, labelled as such | Match score, strengths with quotes from the document, gaps with a severity, missing role keywords, section-by-section status, prioritised fixes |

A fix has to be the actual edit to make. "Add metrics" is rejected by the prompt;
"change 'improved API performance' to state the before and after latency" is what
it asks for. The measured facts are handed to the model as established, so its
commentary cannot contradict what the UI shows.

Because PDF parsing improves over time, a **Re-read file** action re-runs
extraction over the text already stored, with no re-upload. It replaces manual
corrections, so it is an explicit button rather than something that happens
silently.

**Skill gap analysis.** Compares the candidate's confirmed skills and resume text
against a target role and optional job description. The report separates four
different things that look alike:

| Status | Meaning |
| --- | --- |
| `EVIDENCE_IN_RESUME` | The resume shows the skill being used |
| `CLAIMED_WITHOUT_EVIDENCE` | Listed, but nothing demonstrates it |
| `NOT_MENTIONED` | Absent from the resume - **not** proof the candidate lacks it |
| `PROFICIENCY_UNCLEAR` | Present, but too thin to judge depth |

Proficiency is a 1-5 estimate and is `null` where the data supports no estimate.
The readiness score is 0-100, labelled as an AI estimate everywhere it appears,
and never presented as a hiring probability.

**Interview practice.** Four modes sharing one engine:

| Mode | Focus | Scored on |
| --- | --- | --- |
| Technical | Fundamentals, data structures, databases, APIs, system design, debugging | Technical accuracy, reasoning, completeness, practical applicability |
| Non-Technical | Communication, situational judgement, collaboration, prioritisation | Relevance, communication, problem solving, professional judgement |
| Aptitude | Numerical and logical reasoning, data interpretation, verbal reasoning | Correctness, reasoning, calculation accuracy, method efficiency |
| HR | Introduction, motivation, conflict, teamwork, STAR behavioural questions | Relevance, specificity, behavioural evidence, structure and clarity |

Every evaluated answer returns **Strengths**, **Weaknesses** and **Suggested
Improvements** (each with a concrete actionable step), four 1-5 dimension scores,
and a 0-100 overall score computed in backend code from those dimensions.

Aptitude multiple-choice answers are graded **deterministically** against an answer
key that is stored server-side and never serialised to the browser before
submission. The model is then asked only for the reasoning feedback, and the
correctness score it returns is overwritten by the deterministic result.

**Dashboard and history.** Readiness, interview counts, average score, score by
mode and score over time - all computed from the signed-in user's own rows, with a
real empty state for new users and `--` where a metric does not exist yet.

---

## Architecture

```
ai-career-preparation/
├── apps/
│   ├── api/                        Express + TypeScript backend
│   │   ├── src/
│   │   │   ├── config/             env validation, Prisma client
│   │   │   ├── controllers/        HTTP concerns only
│   │   │   ├── middleware/         auth, CSRF, validation, errors, rate limits, uploads, timeouts
│   │   │   ├── repositories/       all database access, always scoped by user
│   │   │   ├── routes/             versioned route table
│   │   │   ├── services/           business logic
│   │   │   │   ├── interview/      modes, question bank, generation, evaluation
│   │   │   │   └── llm/            provider abstraction, prompt fencing, mock provider
│   │   │   ├── utils/              errors, logger, response envelope
│   │   │   └── server.ts
│   │   └── tests/                  unit, integration, security
│   └── web/                        React + Vite + Tailwind frontend
│       ├── src/
│       │   ├── components/ui/      design system primitives
│       │   ├── components/feature/ domain components and charts
│       │   ├── components/layout/  shell, guards, error boundary
│       │   ├── context/            auth and toast providers
│       │   ├── hooks/              async query and action hooks
│       │   ├── pages/              one file per screen
│       │   └── services/           API client and endpoint wrappers
│       └── tests/
├── packages/shared/                Zod schemas, enums and types used by both sides
├── prisma/
│   ├── schema.prisma
│   ├── migrations/0_init/
│   └── seed.ts
├── .env.example
└── package.json                    npm workspaces
```

**Layering.** Controllers handle HTTP, services hold the logic, repositories own
every Prisma call. No controller queries the database directly, and no service
constructs an HTTP response.

**One source of truth for shapes.** `packages/shared` holds the Zod schemas. The
client validates forms with them, the API validates requests with them, and the
JSON Schema the model is given is generated from them - so the three cannot drift.

### Database model

| Model | Holds |
| --- | --- |
| `User` | Credentials (Argon2id hash only) |
| `AuthSession` | Server-side sessions; only a SHA-256 hash of the cookie token |
| `CandidateProfile` | One profile per user |
| `Resume` | File metadata, extracted text, editable parsed data, private storage key |
| `ResumeFitAnalysis` | A validated resume-fit report, its measured checks, score and provenance |
| `SkillGapAnalysis` | A validated report plus its readiness score and provenance |
| `InterviewSession` | Mode, role, difficulty, status, progress, final summary |
| `InterviewQuestion` | Question text, options, and `gradingMetadata` (never sent to the client) |
| `InterviewAnswer` | One row per question (unique constraint), answer and evaluation |
| `AiUsageLog` | Per-user token and latency accounting; no prompts, no answers |

Cascading deletes mean removing a user removes everything that belongs to them.

---

## Prerequisites

| Requirement | Version |
| --- | --- |
| Node.js | 20.11 or newer (developed on 24.x) |
| npm | 10 or newer |
| PostgreSQL | 14 or newer (developed against 18) |

An LLM API key is **optional**. Set `LLM_PROVIDER="mock"` to run the whole app end
to end with a deterministic curated engine and no external calls - useful for
development and required for the test suite.

---

## Setup

```bash
npm install
```

Create the databases (adjust the user to match your install):

```bash
createdb career_prep && createdb career_prep_test
```

On Windows, or if `createdb` is not on your PATH:

```bash
psql -U postgres -c "CREATE DATABASE career_prep;"
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

Generate a session secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Apply the schema:

```bash
npm run prisma:generate && npm run prisma:deploy
```

Optionally create a demo account to click through:

```bash
npm run prisma:seed
```

---

## Environment variables

Everything lives in a single root `.env`. The API validates it at startup and
refuses to boot with a clear message if anything is missing or still a placeholder.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | yes | - | PostgreSQL connection string |
| `TEST_DATABASE_URL` | no | - | Used by the integration tests instead of `DATABASE_URL` |
| `NODE_ENV` | no | `development` | `development` \| `test` \| `production` |
| `PORT` | no | `4000` | API port; hosting platforms usually set this |
| `API_PORT` | no | - | Explicit API port, used in preference to `PORT`. Keeps a combined dev launcher from moving the API onto the web port |
| `FRONTEND_URL` | no | `http://localhost:5173` | Comma-separated CORS allowlist |
| `SESSION_SECRET` | yes | - | 32+ characters; signs CSRF tokens |
| `SESSION_TTL_DAYS` | no | `7` | Session lifetime |
| `TRUST_PROXY` | no | `false` | Set `true` behind a hosting proxy so client IPs are correct |
| `LLM_PROVIDER` | no | `anthropic` | `anthropic` \| `openai` \| `mock` |
| `LLM_API_KEY` | yes unless mock | - | **Server-side only.** Never prefix with `VITE_` |
| `LLM_MODEL` | no | per provider | Empty means `claude-opus-5-5` / `gpt-5.5`. See [Switching provider](#switching-llm-provider) |
| `LLM_MAX_OUTPUT_TOKENS` | no | `8000` | Hard output cap per call |
| `LLM_TIMEOUT_MS` | no | `90000` | Per-request timeout |
| `LLM_MAX_RETRIES` | no | `2` | Also bounds schema-repair attempts |
| `LLM_EFFORT` | no | `medium` | `low`-`max`; lower is cheaper and faster. On OpenAI this maps to `reasoning_effort` |
| `LLM_SERVER_FALLBACKS` | no | `true` | Anthropic only; disabled automatically if the account rejects the beta |
| `MAX_RESUME_SIZE_MB` | no | `5` | Upload limit |
| `RESUME_STORAGE_DIR` | no | `./storage/resumes` | Private directory, never web-served |
| `RESUME_STORAGE_MODE` | no | `disk` | `memory` processes uploads in RAM only |
| `AUTH_RATE_LIMIT_MAX` | no | `10` | Per IP per window |
| `AI_RATE_LIMIT_MAX` | no | `30` | Per user per window |
| `UPLOAD_RATE_LIMIT_MAX` | no | `10` | Per user per window |
| `RATE_LIMIT_WINDOW_MINUTES` | no | `15` | Window length |
| `MAX_INTERVIEW_SESSIONS_PER_DAY` | no | `20` | Per-user daily AI budget |
| `LOG_LEVEL` | no | `info` | pino level |

The only variable the frontend reads is the optional `VITE_API_BASE_URL`
(default `/api/v1`). There is no code path by which a server secret reaches the
browser bundle, and a test asserts it.

---

## Switching LLM provider

The API talks to a model only through the `LlmProvider` interface in
`apps/api/src/services/llm/`, so changing provider is a configuration change, not
a code change. Each provider supplies its own structured-output mechanism and its
own error mapping; everything above it — prompts, schemas, validation, repair
retries, usage accounting, curated fallbacks — is shared.

| Provider | Set | Structured output |
| --- | --- | --- |
| Anthropic | `LLM_PROVIDER="anthropic"` | JSON Schema output format, generated from the Zod schema |
| OpenAI | `LLM_PROVIDER="openai"` | Chat Completions `json_schema` in **strict** mode |
| None | `LLM_PROVIDER="mock"` | Curated local content, no network calls |

**OpenAI models.** These were checked against the real structured-output path the
app uses, with every schema it sends:

| Model | Observed latency per call | Notes |
| --- | --- | --- |
| `gpt-5.5` | 8-43 s | The default. Balanced. |
| `gpt-5.4-mini` | 2-6 s | Fastest; good for development |
| `gpt-6.1-sol` | 18-38 s | Slowest of the three; still inside the 150 s route budget |

Pricing was not measured, so treat the cost ordering as unverified — check your
provider's current rates before committing to a default.

**Why strict mode.** OpenAI's non-strict `json_schema` treats the schema as a
hint: in testing it returned `8` and `9` for fields documented as 1-5. Strict mode
enforces the shape, but requires every property to be listed in `required` and
does not enforce numeric ranges. `apps/api/src/services/llm/openaiSchema.ts`
therefore adapts the generated schema:

- every property becomes required, with optional ones expressed as nullable
- a small integer range such as 1-5 becomes an `enum`, which strict mode *does*
  enforce
- `default` keywords are stripped

On the way back, a null in a slot our own schema did not require is removed, so
the Zod `.default(...)` applies instead of failing on an explicit null. Zod
remains the enforcement layer either way — a structured-output mode is never
treated as a substitute for validating the response.

---

## Running in development

```bash
npm run dev
```

This builds `packages/shared`, then starts the API on <http://localhost:4000> and
the client on <http://localhost:5173>. Vite proxies `/api` to the API, so the
session cookie is same-origin in development exactly as it will be in production.

| Command | What it does |
| --- | --- |
| `npm run dev` | API and client together |
| `npm run build` | Production build of all three packages |
| `npm run start` | Run the built API |
| `npm run lint` | ESLint across the monorepo |
| `npm run typecheck` | `tsc --noEmit` for all three packages |
| `npm test` | API tests then client tests |
| `npm run test:unit` | API unit tests only (no database needed) |
| `npm run test:integration` | API integration and security tests |
| `npm run prisma:migrate` | Create a new migration from schema changes |
| `npm run prisma:deploy` | Apply existing migrations |
| `npm run prisma:studio` | Browse the database |
| `npm run prisma:seed` | Create the demo account |
| `npm run db:reset` | Drop, recreate and re-migrate |

Health check: `curl http://localhost:4000/health`.

---

## Running the tests

```bash
npm test
```

The LLM provider is forced to `mock` in `apps/api/tests/setup.ts`, so **no test
makes a paid API call.**

Unit tests and the frontend suite need no database. The integration and security
suites do, and **skip themselves with a warning** when one is not reachable, so
`npm test` still works on a fresh checkout. To run them:

```bash
# once
psql -U postgres -c "CREATE DATABASE career_prep_test;"

# then, with TEST_DATABASE_URL set in .env
TEST_DATABASE_URL="postgresql://postgres:PASSWORD@localhost:5432/career_prep_test" \
  npx prisma migrate deploy
npm run test:integration
```

The suites truncate every table between tests, so point them at a database you do
not mind losing.

What is covered:

- **Unit** - resume validation and parsing failures, field extraction, score
  calculation, per-mode evaluation schemas, deterministic aptitude grading,
  question-bank integrity, prompt fencing, curated fallbacks, error mapping,
  CSRF token derivation.
- **Integration** - registration and login, profile create/update, resume upload
  and correction, skill gap analysis, all four interview modes end to end,
  duplicate-answer handling, on-demand question generation, report retrieval.
- **Security** - every protected route rejects anonymous callers, CSRF is enforced
  on writes, one user cannot read or write another's resume, report, session or
  answer, client-supplied user ids are ignored, invalid and oversized uploads are
  rejected, answer keys are absent from every client payload, no secret appears in
  the frontend source or the built bundle, and environment validation rejects
  placeholders and the mock provider in production.

---

## API reference

All routes are under `/api/v1`. Every response uses one envelope:

```json
{ "success": true, "data": {}, "message": "Request completed successfully" }
```

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Please check the submitted information.",
    "details": { "email": ["Enter a valid email address"] }
  }
}
```

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/auth/register` | - | Create an account and a session |
| POST | `/auth/login` | - | Sign in |
| POST | `/auth/logout` | session | Destroy the session |
| GET | `/auth/me` | session | Current user and a fresh CSRF token |
| PUT | `/auth/password` | session | Change password, revoke other sessions |
| DELETE | `/auth/account` | session | Delete the account and all data |
| GET | `/profile` | session | Read the career profile |
| PUT | `/profile` | session | Create or update it |
| GET | `/dashboard` | session | Aggregated stats for the signed-in user |
| POST | `/resumes/upload` | session | Upload and parse a PDF or DOCX |
| GET | `/resumes` | session | List resumes |
| GET | `/resumes/:resumeId` | session | One resume with text and parsed data |
| PUT | `/resumes/:resumeId` | session | Save corrections to the parsed data |
| POST | `/resumes/:resumeId/reparse` | session | Re-run extraction over the stored text |
| POST | `/resumes/:resumeId/fit` | session | Review the resume against a target role |
| GET | `/resumes/:resumeId/fit` | session | Most recent review for that resume |
| DELETE | `/resumes/:resumeId` | session | Delete the record and the stored file |
| POST | `/skill-gap/analyze` | session | Run an analysis |
| GET | `/skill-gap/history` | session | Past reports |
| GET | `/skill-gap/:analysisId` | session | One report |
| POST | `/interviews` | session | Create a session and its first questions |
| GET | `/interviews` | session | List sessions |
| GET | `/interviews/:sessionId` | session | Session with questions and answers |
| POST | `/interviews/:sessionId/next-question` | session | Generate or return the next question |
| POST | `/interviews/:sessionId/answer` | session | Submit an answer and get feedback |
| POST | `/interviews/:sessionId/complete` | session | Finish and generate the summary |
| GET | `/interviews/:sessionId/report` | session | Full report for a finished session |
| GET | `/health` | - | Liveness and database reachability |

Error codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
`CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `RATE_LIMITED`,
`USAGE_LIMIT_REACHED`, `CSRF_TOKEN_INVALID`, `AI_UNAVAILABLE`,
`AI_INVALID_RESPONSE`, `RESUME_PARSE_FAILED`, `TIMEOUT`, `INTERNAL_ERROR`.

Writes require the `x-csrf-token` header, which the client copies from the
`career_prep_csrf` cookie.

---

## Security model

**Authentication.** Argon2id password hashing (19 MiB, t=2, p=1). Sessions are
opaque random tokens in an `HttpOnly`, `SameSite=Lax` cookie, `Secure` in
production; only a SHA-256 hash of the token is stored. Login and an unknown email
return the identical message, and a failed lookup still burns comparable CPU, so
the endpoint does not enumerate accounts. Changing a password revokes every
session.

**CSRF.** Cookie authentication needs it, so writes carry a signed double-submit
token derived from a per-session secret with HMAC-SHA256 and compared in constant
time.

**Authorisation.** `requireAuth` is the only thing that sets `req.authUser`, and it
reads the session cookie alone - no code path takes a user id from a body, query
or header. Every repository read filters on `userId` as well as the resource id,
and a resource belonging to another user returns **404, not 403**, so the API never
confirms that someone else's record exists.

**Uploads.** Extension, declared MIME type and magic bytes must all agree. Files
are buffered in memory, written under a server-generated UUID key inside a private
directory with mode `0600`, and the original filename is kept only as a sanitised
display string. Paths are checked against the storage root before any write or
delete, no filesystem path appears in any response, nothing uploaded is ever
executed, and a failed parse cleans up after itself. Orphaned files are swept on
startup.

**Prompt injection.** Resume text, job descriptions and candidate answers are
untrusted input. They are never concatenated into system instructions; each is
wrapped in a `<untrusted_data id="NONCE">` block with a per-request random nonce,
forged fence tags are stripped, and the system prompt states that the block is data
and not an instruction. The model has no tools, no database access and no
filesystem access, and the fencing is covered by tests.

**AI output.** Structured output is requested with a JSON Schema generated from the
Zod schema. The response is then validated against that same Zod schema, with a
bounded repair retry, and invalid output is never persisted as a completed
evaluation. Overall scores are recomputed in backend code, and a readiness score
that contradicts its own skill list is replaced by the derived figure. Nothing from
the model is rendered as HTML.

**Answer keys.** `gradingMetadata` is stored in its own column and stripped by the
serialiser, so the public question shape physically cannot carry the expected
answer, rubric or correct option index.

**Key handling.** The provider key is read from the environment on the server
only. It is never imported into `apps/web`, never exposed through a `VITE_`
variable, and never returned by an endpoint; tests assert its absence from both
the frontend source and the built bundle. If a key is ever pasted into a chat, a
ticket, a screenshot or a commit, treat it as compromised and rotate it - the
only change needed is the `LLM_API_KEY` line in `.env`.

**Other defaults.** Helmet with a restrictive CSP, an explicit CORS allowlist (the
origin is never reflected), 256 KB JSON body cap, per-route timeouts, rate limits on
auth, uploads and AI endpoints, Prisma parameterised queries throughout with no raw
SQL outside the test truncation helper, structured logging with redaction of
cookies, tokens, passwords, resume text and answers, and production errors that
carry a safe message while the stack stays in the log.

---

## Cost control

- Questions are generated in batches of five as the candidate progresses, so a
  15-question session only pays for what is reached.
- Resume field extraction, overall scores, aggregate statistics and aptitude
  correctness are all deterministic code, not model calls.
- `LLM_MAX_OUTPUT_TOKENS`, `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES` and `LLM_EFFORT` cap
  the spend per call; `AI_RATE_LIMIT_MAX` and `MAX_INTERVIEW_SESSIONS_PER_DAY` cap it
  per user.
- Reports are stored and re-read from the database, never regenerated on render.
- An idempotency key makes a resubmitted answer return the stored evaluation
  instead of paying for a second one.
- `AiUsageLog` records operation, model, token counts and latency per user.
- When the provider is unavailable the app degrades to curated content and labels
  it as such, rather than failing or quietly passing it off as AI output.

---

## Installing as an app (PWA)

The web client is an installable Progressive Web App. On a deployed HTTPS URL it
launches standalone with no browser chrome.

The app offers installation itself rather than leaving it to the browser, because
Chromium hides its own entry under the ⋮ overflow menu and iOS has none at all —
which makes a perfectly installable app look un-installable to most visitors. An
**Install app** button sits in the signed-in header and under the sign-in form,
and adapts to what the browser actually supports:

| Browser | What the button does |
| --- | --- |
| Chromium (Android, desktop) | Calls the real `beforeinstallprompt`; one tap installs |
| iOS Safari / Chrome | Opens the **Share → Add to Home Screen** steps, the only route WebKit has |
| In-app browser (WhatsApp, Instagram, ...) | Explains that webviews cannot install, and how to reopen the page |
| Already installed, or no signal | Renders nothing — a button that might do nothing is worse than none |

| Piece | Where |
| --- | --- |
| Manifest | Generated by `vite-plugin-pwa` into `dist/manifest.webmanifest` |
| Service worker | Generated into `dist/sw.js` (Workbox `generateSW`) |
| Icons | `apps/web/public/`, produced by `scripts/generate-icons.mjs` |
| Install button | `apps/web/src/components/layout/InstallAppButton.tsx` |
| Install detection | `apps/web/src/hooks/useInstallPrompt.ts` |
| Offline notice | `apps/web/src/components/layout/ConnectionBanner.tsx` |

Chromium fires `beforeinstallprompt` during page load, often before React has
mounted. The hook therefore captures the event at module scope and replays it to
whichever component subscribes later; listening from inside the component would
miss it on most loads.

Regenerate the icons after a brand change:

```bash
node scripts/generate-icons.mjs
```

### What the service worker does and does not cache

It precaches the built shell: HTML, JS, CSS and icons. That is all.

**`/api/**` is never cached.** Those responses carry the signed-in user's resume
text, interview answers and session state, and a cached copy would outlive
sign-out and could be served to the next person on a shared device. The rule is
declared explicitly as `NetworkOnly` rather than merely omitted, and
`navigateFallbackDenylist` keeps the SPA shell from being returned for an API
path. A test asserts no `/api` entry ever enters the cache.

### What "offline" actually means here

Being honest about this: **the app does not work offline.** Every screen needs
the API. Installing it means the shell opens instantly and a deep link such as
`/history/<id>` resolves, but with no connection you get the amber banner and
the app's normal network-error states.

There is no offline queue and no background sync. Nothing you type while
offline is saved or sent later.

### Testing the PWA locally

The service worker is disabled in `npm run dev` on purpose - it would serve
stale modules through hot reload. Use the production build:

```bash
npm run build
npm run preview -w @career-prep/web
```

That serves the real build on <http://localhost:4173> and proxies `/api` to the
API on port 4000, so you can exercise the installed behaviour end to end.

---

## Production build and deployment

```bash
npm run build
```

Produces `packages/shared/dist`, `apps/api/dist` and `apps/web/dist`.

Suggested topology: the client on static hosting or a CDN, the API on a Node host,
and managed PostgreSQL.

**Step-by-step instructions for GitHub, Vercel and Android installation are in
[DEPLOYMENT.md](DEPLOYMENT.md).** It covers the one thing that silently breaks a
split deployment: a `SameSite=Lax` session cookie is not sent cross-site, so a
Vercel frontend talking to a separately hosted API needs
`SESSION_COOKIE_SAMESITE=none` (or, better, one shared domain).

Production checklist:

- [ ] `NODE_ENV=production`
- [ ] Secrets set through the host's secret manager, never a committed file
- [ ] A fresh `SESSION_SECRET` (not the development one)
- [ ] `FRONTEND_URL` set to the real client origin(s)
- [ ] `TRUST_PROXY=true` if there is a proxy in front, so rate limiting sees real IPs
- [ ] HTTPS everywhere - the session cookie is `Secure` in production and will not
      be sent over plain HTTP
- [ ] `VITE_API_BASE_URL` set at build time if the API is on another origin
- [ ] `npm run prisma:deploy` run against the production database
- [ ] `RESUME_STORAGE_DIR` on a persistent volume, or switch to
      `RESUME_STORAGE_MODE=memory` on ephemeral hosts. For durable storage, move to
      a **private** object-storage bucket with short-lived signed URLs
- [ ] `LLM_PROVIDER` set to a real provider - the mock is rejected in production

If the API and client are served from different origins, the session cookie needs
`SameSite=None; Secure`, which means serving both over HTTPS and adding the client
origin to `FRONTEND_URL`. Putting both behind one domain avoids this entirely.

---

## Troubleshooting

**`Invalid environment configuration`** - the message lists each offending
variable. Copy `.env.example` to `.env` and replace every `replace-with-...`
placeholder.

**`Could not reach the database`** - the API starts but data routes fail. Check
that PostgreSQL is running, that `DATABASE_URL` has the right user, password,
host, port and database name, and that the database exists. `npm run prisma:deploy`
creates the tables.

**`Authentication failed against database server`** - the password in
`DATABASE_URL` is wrong. On a default Windows install the user is `postgres` with
the password chosen during setup.

**Integration tests report "no database"** - expected without one. Create
`career_prep_test`, set `TEST_DATABASE_URL`, run `npx prisma migrate deploy`
against it, then `npm run test:integration`.

**`LLM_API_KEY is required`** - either set a real key, or set
`LLM_PROVIDER="mock"` to use the curated engine.

**Every AI feature returns "Baseline" or "Curated"** - the provider is `mock`, the
key is rejected, or the provider is unreachable. `GET /health` reports the active
provider; the server log records the reason with the provider payload redacted.

**One feature works and another falls back** - the server log names the failing
operation and the schema issue behind it. The usual cause is a model that cannot
satisfy a particular schema; try the default model for your provider before
changing anything else.

**`LLM_MODEL` set to a model the account cannot use** - the provider returns 404,
which is mapped to `AI_UNAVAILABLE`, so the feature degrades to curated content
rather than erroring. Clear `LLM_MODEL` to fall back to the verified default, or
list what your key can actually reach:

```bash
node --env-file=.env -e "const O=require('openai').default??require('openai');new O({apiKey:process.env.LLM_API_KEY}).models.list().then(r=>console.log(r.data.map(m=>m.id).sort().join('
')))"
```

**"We could not find any readable text in that file"** - the PDF is a scan with no
text layer. Export a text-based PDF or upload the DOCX.

**401 on every request from the browser** - the session cookie is not arriving.
In development use `http://localhost:5173` so the Vite proxy keeps the API
same-origin. In production check `FRONTEND_URL`, that the site is on HTTPS, and
that cookies are not blocked.

**"Your request could not be verified"** - the CSRF token is missing or stale.
Reload the page; the client re-arms it from `GET /auth/me`.

**Port already in use** - change `PORT`, or `vite --port` for the client.

---

## Known limitations

- **Verified against PostgreSQL 18 only.** The schema uses standard types and
  should work on 14+, but that is untested here.
- **Provider coverage is uneven.** The OpenAI path was exercised against the live
  API across all five AI operations. The Anthropic path is covered by unit tests
  and the mock provider, but has not been run against a live Anthropic key.
- **Model pricing is not measured.** Latency figures in
  [Switching LLM provider](#switching-llm-provider) are observed; cost is not.
- **Cross-field rules cannot be expressed in JSON Schema.** For example "a
  multiple-choice question needs exactly four options" is a Zod refinement, so a
  model can still violate it. The repair retry feeds the Zod error back and fixes
  it, at the cost of an extra call.
- **Resume extraction is heuristic.** It reads section headings, so an unusual
  layout (heavy tables, multi-column, graphic-heavy) will extract less. That is why
  every field is editable and empty rather than guessed.
- **Scanned PDFs are not supported.** There is no OCR; a text layer is required.
- **No email verification or password reset.** Both need an email provider, which
  the MVP does not configure.
- **Single-region file storage.** Resumes are written to a local private directory.
  A multi-instance deployment needs private object storage instead.
- **The PWA does not work offline.** The shell is precached so it opens and deep
  links resolve, but every screen needs the API. There is no offline queue and no
  background sync.
- **Android installation was not tested on a device.** The installability
  criteria were verified in a desktop browser against the production build
  (manifest valid, icons served, service worker activated, standalone display),
  but no physical Android install was performed. iOS was not tested at all.
  The **Install app** button was exercised against the production build with a
  synthetic `beforeinstallprompt`, which confirms the wiring but not a real
  Chrome install dialog; the iOS and in-app-browser branches are covered by unit
  tests with spoofed user agents, not by those devices.
- **No streaming.** Evaluations arrive as one response, so a long answer waits a few
  seconds behind a staged progress indicator rather than streaming in.
- **AI feedback is an estimate.** Scores, readiness and proficiency levels are
  model output, labelled as such throughout, and are not verified assessments or
  predictions of hiring outcomes.
- **Playwright is not configured.** End-to-end coverage is provided by the API
  integration suite plus the React Testing Library suite.
- **Server-side refusal fallback** is enabled by default and switches itself off if
  the account rejects the beta flag; set `LLM_SERVER_FALLBACKS=false` to skip the
  attempt entirely.
