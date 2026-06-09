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

## Status

Not built yet — this lands in **Phase 7**. See
[`docs/BUILD-LOG.md`](../../docs/BUILD-LOG.md).
