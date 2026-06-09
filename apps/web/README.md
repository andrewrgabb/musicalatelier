# web — the website

**Plain language:** this is the actual website you see in your browser — the
pages, buttons, the upload form, the live progress bar, and the preview of your
transcribed score. It's served to you from servers all around the world so it
loads quickly wherever you are, and it talks to the API for anything that needs
data or sign-in.

**Technical:** a React **single-page app (SPA)** built with Vite and React
Router (client-side routing). It ships as static files to **Vercel's global
CDN**, so it's region-independent and fast everywhere. The only network distance
that matters is the browser → API (Sydney) call.

## What it will do

- Sign-in / sign-up (the one genuinely auth-provider-specific UI).
- Upload a sheet-music image/PDF (directly to R2 via a presigned URL).
- A "My uploads" list showing each score with **live status**
  (`queued → processing → % → completed`).
- An in-browser **preview** of the resulting score, rendered from the MusicXML
  with Verovio or OpenSheetMusicDisplay (OSMD) — shown beside the original.

## Layout (feature-based)

```
src/
├─ lib/                  # cross-cutting: API client, auth wrapper,
│                        #   useCurrentUser(), <RequireAuth>
└─ features/
   ├─ scores/            # routes/ pages/ apis/ components/ for the upload flow
   └─ auth/              # the sign-in / sign-up pages
```

Screens never call the auth provider's SDK directly — they go through our own
`useCurrentUser()` hook and `<RequireAuth>` component, so swapping auth
providers later touches only `lib/`.

## Running it

The API must be running (and backing services up). Then:

```bash
pnpm --filter @musical-atelier/web dev   # http://localhost:5173
```

Vite reads `VITE_*` variables from the **repo-root `.env`** (via `envDir`), so
`VITE_API_URL` and (later) the Clerk publishable key come from the same single
env file as the rest of the stack.

## What's built (Phase 7)

- **Upload** (`features/scores/pages/UploadPage`): pick an image/PDF →
  `createScore` (presigned URL) → upload **directly to storage** → `markUploaded`
  (enqueue) → redirect to the list.
- **My scores** (`MyScoresPage`): polls the API every 2 s and shows each upload
  with a **live status badge + progress bar**.
- **Preview** (`ScorePreview`): renders the resulting MusicXML as engraved sheet
  music with OpenSheetMusicDisplay. It's **lazy-loaded** (OSMD is ~1 MB) so it
  only downloads when you open a preview.
- **Auth boundary** (`lib/auth.tsx`): wraps the app in `<ClerkProvider>`,
  renders Clerk's `<SignIn>` on the sign-in page, attaches the Clerk session JWT
  to every API call (`setTokenGetter`), and shows a `<UserButton>` in the
  header. Feature screens only use `useCurrentUser()`/`<RequireAuth>` — the
  Clerk-specific code is confined to `lib/auth.tsx` and `SignInPage`, so
  swapping providers touches just those two files. Requires
  `VITE_CLERK_PUBLISHABLE_KEY`.

## A note on imports

Frontend imports are **extensionless** (`from "../apis/scores"`) — Vite resolves
them. (The API, by contrast, runs on Node's native ESM and must use `.js`
extensions even for `.ts` sources; that's a Node-ESM rule, not JavaScript.)
