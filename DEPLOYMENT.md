# Deployment

This app is two deployables plus a database:

| Part | What it is | Suggested host |
| --- | --- | --- |
| `apps/web` | Static React build (the PWA) | Vercel |
| `apps/api` | Long-running Express server | Render / Railway / Fly.io |
| PostgreSQL | Managed database | Neon / Supabase / Render |

**Vercel hosts the frontend only.** The API keeps a database connection pool,
writes uploaded files and runs for up to 150 s on AI routes, so it needs a real
Node process rather than serverless functions. Deploy it somewhere that gives
you one.

Nothing here is automated. No commit is pushed and no deployment is created
without you running the commands yourself.

---

## 1. Review what changed

```bash
git status
git diff
```

Confirm `.env` is **not** listed. It is covered by `.gitignore`, and it holds
your database password and provider API key.

```bash
git check-ignore -v .env
```

That must print a match. If it prints nothing, stop and fix `.gitignore` before
committing anything.

---

## 2. Push to GitHub

If this is not yet a git repository:

```bash
git init
git add .
git commit -m "AI Career Preparation: full-stack MVP with installable PWA"
git branch -M main
```

Create an empty repository on GitHub (no README, no .gitignore), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

After pushing, open the repository on GitHub and confirm `.env` is absent.

---

## 3. Deploy the API first

The frontend needs the API's URL at build time, so do this one first.

1. Create a managed PostgreSQL database and copy its connection string.
2. Create a Node service pointing at this repository.
3. Settings:

   | Setting | Value |
   | --- | --- |
   | Build command | `npm install && npm run build -w @career-prep/shared && npm run build -w @career-prep/api && npx prisma generate` |
   | Start command | `npx prisma migrate deploy && npm run start -w @career-prep/api` |
   | Node version | 20.11 or newer |

4. Environment variables:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | Your managed PostgreSQL connection string |
   | `NODE_ENV` | `production` |
   | `SESSION_SECRET` | A fresh 32+ character random string — **not** your local one |
   | `FRONTEND_URL` | Your Vercel URL, e.g. `https://career-prep.vercel.app` |
   | `SESSION_COOKIE_SAMESITE` | `none` (see step 5) |
   | `TRUST_PROXY` | `true` |
   | `LLM_PROVIDER` | `openai` |
   | `LLM_API_KEY` | Your **rotated** provider key |
   | `LLM_MODEL` | `gpt-5.5`, or leave unset |
   | `RESUME_STORAGE_MODE` | `memory` unless you attach a persistent disk |

   Generate the session secret with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
   ```

5. Deploy, then check `https://<your-api>/health` returns
   `{"success":true,"data":{"status":"ok","database":true,...}}`.

---

## 4. Deploy the frontend to Vercel

1. **Add New → Project**, import the repository.
2. Leave the root directory as the repository root. `vercel.json` already sets
   the build command, output directory and SPA rewrites for this monorepo:

   | Setting | Value (from `vercel.json`) |
   | --- | --- |
   | Build command | `npm run build -w @career-prep/shared && npm run build -w @career-prep/web` |
   | Output directory | `apps/web/dist` |
   | Install command | `npm install` |

3. Add one environment variable:

   | Variable | Value |
   | --- | --- |
   | `VITE_API_BASE_URL` | `https://<your-api>/api/v1` |

   It is a build-time value baked into the bundle, so a change needs a
   redeploy. It is public by design — never put a secret in a `VITE_` variable.

4. Deploy and note the HTTPS URL.

---

## 5. Make cross-origin login work

This is the step that silently breaks otherwise.

Authentication uses an `httpOnly` cookie. With the frontend on
`*.vercel.app` and the API on another domain, those requests are **cross-site**,
and a browser will not send a `SameSite=Lax` cookie on them. You would see every
request return 401 with no obvious reason.

So on the API, set both:

- `SESSION_COOKIE_SAMESITE=none` — the browser only accepts this with `Secure`,
  which the API sets automatically when `NODE_ENV=production`
- `FRONTEND_URL=https://<your-vercel-url>` — the CORS allowlist; the origin is
  never reflected blindly

**The alternative, and the better one:** put both behind a single domain, e.g.
`app.example.com` for the frontend and `app.example.com/api` via a proxy. Then
`SESSION_COOKIE_SAMESITE` stays `lax` and the cookie is first-party. Use a
custom domain on Vercel with a rewrite to the API host.

---

## 6. Verify the deployment

Open the Vercel URL on a desktop browser:

```
1. Sign up, then sign in            → confirms cookies cross the origins
2. Upload a resume                  → confirms file upload and parsing
3. Run a resume review              → confirms the provider key works
4. Reload a deep link such as /history → confirms the SPA rewrite
5. DevTools → Application → Manifest → no errors, icons render
6. DevTools → Application → Service Workers → activated
7. DevTools → Application → Cache Storage → NO /api entries
```

Step 7 is the one worth doing by hand. If an `/api` URL ever appears there,
stop and report it.

---

## 7. Install on Android

1. Open the HTTPS Vercel URL in **Chrome on Android**.
2. Either accept the install prompt, or use **⋮ → Add to Home screen** /
   **Install app**.
3. Launch it from the home screen. It opens standalone, with no address bar
   and the indigo theme colour in the status bar.

Notes, honestly:

- Chrome and Edge on Android support this. **Firefox and some manufacturer
  browsers present it differently or not at all**, so do not expect an identical
  button everywhere.
- iOS Safari has no install prompt — it is **Share → Add to Home Screen**. The
  app has the Apple meta tags for this, but iOS support was not tested.
- **HTTPS is required.** It will not install over plain HTTP, except on
  `localhost`.

### Updating an installed app

The service worker uses `autoUpdate`. After you redeploy, an installed app picks
up the new build on its next launch — usually the second launch, since the first
one serves the cached shell while fetching the update in the background. No
reinstall is needed.

To force it: Android Settings → Apps → Career Prep → Storage → Clear cache.

---

## Environment variable reference

Secrets live only in your host's environment settings. Never commit them.

| Variable | Where | Secret |
| --- | --- | --- |
| `DATABASE_URL` | API host | **yes** |
| `SESSION_SECRET` | API host | **yes** |
| `LLM_API_KEY` | API host | **yes** |
| `NODE_ENV`, `TRUST_PROXY`, `SESSION_COOKIE_SAMESITE` | API host | no |
| `FRONTEND_URL`, `LLM_PROVIDER`, `LLM_MODEL` | API host | no |
| `VITE_API_BASE_URL` | Vercel | no (public, in the bundle) |

Full table with defaults: see the README's "Environment variables" section.

---

## Persistent file storage

`RESUME_STORAGE_MODE=disk` writes uploaded resumes to a local directory. Most
hosts give you an **ephemeral** filesystem, so those files vanish on redeploy.

Two options:

- `RESUME_STORAGE_MODE=memory` — the file is parsed in RAM and never written.
  The extracted text and parsed fields still persist in PostgreSQL, so every
  feature keeps working. **This is the right default for Vercel-style hosting.**
- Attach a persistent disk and keep `disk`. If you later move to object
  storage, use a **private** bucket with short-lived signed URLs — never a
  public one.
