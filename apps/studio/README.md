# Onlook Desktop (`apps/studio`)

Local desktop shell for the Onlook visual editor. It runs the real Onlook web
app (`apps/web/client`) inside an Electron window and exposes a typed, local
filesystem API to the renderer — the foundation for offline project work.

The cloud version of Onlook (`apps/web/client`) is untouched: the desktop shell
is an independent runtime that loads the same application.

## Commands (from the repo root)

| Command | What it does |
|---|---|
| `bun --filter @onlook/studio dev` | Starts the web dev server, then launches Electron (hot reload) |
| `bun --filter @onlook/studio typecheck` | Type-checks the Electron code |
| `bun --filter @onlook/studio build` | Builds the web app (standalone) + packages the desktop app |
| `bun --filter @onlook/studio package` | Alias of `build` (used by CI) |
| `bun --filter @onlook/studio package:dir` | Same but skips the installer (unpacked dir only, for quick checks) |

Windows installer output: `apps/studio/dist/Onlook-<version>-x64.exe` (NSIS).

## How it works

- **Development**: `scripts/dev.mjs` starts `next dev` and waits for it, then
  runs Electron against `http://127.0.0.1:3000` (`ONLOOK_DEV_URL` overrides).
- **Packaged**: the Next.js standalone build
  (`.next/standalone/apps/web/client`) is shipped as an extra resource. The
  main process spawns `server.js` using Electron's own Node runtime
  (`ELECTRON_RUN_AS_NODE=1`) on a free local port and loads it. No separate
  Node install is required.
- **Security defaults**: `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`. External links open in the system browser. The preload
  exposes a minimal typed API (`window.onlook`) over IPC only.

## Local filesystem API (`window.onlook`)

Backed by `@onlook/code-provider`'s `NodeFsProvider` (paths are sandboxed to
the project root; escaping paths are rejected).

- `fsRoot()` — current project root
- `selectProjectDir()` — pick a folder (native dialog), re-roots the provider
- `fsList({ path })` / `fsRead({ path })` / `fsWrite({ path, content, overwrite? })`
- `fsStat({ path })` / `fsDelete({ path, recursive? })`
- `getAppInfo()` — platform / versions

All methods return `{ ok: true, value } | { ok: false, error }`.

## Environment

Pass through the same variables the web app needs. Cloud features (auth,
projects, sandboxes) require the Onlook backend — e.g. a locally self-hosted
Supabase (`bun backend:start` per the repo docs) or the hosted one.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` + anon key | Supabase auth/DB |
| `SUPABASE_DATABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | server-side DB access |
| `CSB_API_KEY` | CodeSandbox sandboxes |
| `CUSTOM_AI_BASE_URL` / `CUSTOM_AI_API_KEY` / `CUSTOM_AI_MODEL_NAME` | provider-agnostic AI endpoint/model (any OpenAI/Anthropic-compatible endpoint) |
| `SKIP_ENV_VALIDATION=1` | boot without keys (landing pages render) |

## CI

`.github/workflows/build-windows.yml` packages the app on `windows-latest`
when a `v*` tag is pushed and uploads the installer as a release artifact +
GitHub Release.
