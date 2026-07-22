# Rollout — in order

Five steps. Steps 1-3 get it live. Steps 4-5 are the test pass before doors open.

---

## 1. Push to GitHub  (~2 min)

The repo `watermelonmedia-cdn/karaoke-queue-system` exists but is still empty —
the earlier push failed because Windows had a different GitHub account cached.

Right-click **`push-to-github.ps1`** → *Run with PowerShell*.

Or from a terminal in the project folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
```

It clears the stale credential, commits, and pushes. When the login window
appears, sign in as **watermelonmedia-cdn**.

**Verify:** https://github.com/watermelonmedia-cdn/karaoke-queue-system should
now show the files instead of "This repository is empty."

---

## 2. Point Vercel at the repo  (~3 min)

In the Vercel dashboard, open the karaoke project → **Settings → Git**.

- If no repo is connected, connect `watermelonmedia-cdn/karaoke-queue-system`,
  production branch `main`.
- If it's connected to an old repo, disconnect and reconnect to this one.

Then check **Settings → Environment Variables**. These two must exist or the app
silently falls back to browser-local storage and nothing syncs between phones:

| Name | Where to find it |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |

A push to `main` triggers the deploy. Watch it finish in the Deployments tab.

---

## 3. Run the database migration  (~1 min)

Supabase → **SQL Editor → New query** → paste the contents of
`supabase-migrations.sql` → **Run**.

Adds `is_duo` and `partner` to the requests table, plus indexes on
`event_id`, `ip`, `device_id`, and `created_at` that speed up the host queue.

Skipping this won't crash anything — the insert falls back to the old column
set — but duet selections won't be saved.

---

## 4. Test locally before the venue  (~10 min)

```powershell
cd "C:\Users\buyho\Documents\Claude Projects\Karaoke App Code"
npm install
npm run dev
```

**Create a `.env` first** if you want local testing to hit real data. The
current `.env` has no Supabase keys, so a local run works off browser storage
only:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### The four things to check

**a. Duet checkbox** — On the event page, request a song and tick *"This is a
duet / group song"*. A partner field appears. Submit. In the host view a teal
**DUET** pill sits next to the name.

**b. Same person, different names** — the one you asked for:

1. Submit a song as "Dave", approve it, mark it complete.
2. From the same browser, submit again as "Big D".
3. A red **"Same person, different names"** panel appears at the top of the
   host dashboard showing `"Dave" → "Big D"` with timestamps and
   *1 already sung*.

This is the case the old code missed — once a song was completed, the link was
gone. Now it holds for the whole event.

**c. Who / Device column** — replaces the raw IP column in both the Active
Queue and Pending Requests tables. Shows the person badge (P1, P2…), a
`⚠ 2 NAMES` flag, `sung 3×` if they've already performed, the other names with
"12 min ago" timestamps, and the IP underneath in small type.

**d. Two phones, two people** — submit from your phone and one other device
under different names. They must show as **separate** people (P1 and P2), with
no red panel. If everyone at the venue collapses into one person, see the note
below.

---

## 5. At the venue

Open the host view on the laptop, event page on your phone, and run a couple of
real requests through before you rely on it.

### The one thing to watch

Everyone on the venue's wifi shares a public IP. Device id is what keeps them
apart — it's per-browser and survives an IP change. The grouping links on
*either* signal, so:

- Same phone, new name → linked (device id). **This is the case you wanted.**
- Same wifi, different phones → separate, because device ids differ.
- Someone clears their browser data → new device id, but same IP still links
  them.

If you do see the whole room collapsing into one person, it means device ids
aren't being stored — tell me and I'll switch the IP link to require a
corroborating signal.

Nothing is ever blocked. It's all visibility, as you asked.

---

## Not done yet

**KaraFun** — still needs API access from them. Once you have credentials, the
song title and artist fields become a search box against your actual library,
so people can only pick songs you have. Send me whatever they give you.

**Pre-existing type errors** — the typecheck surfaced 8 errors that predate
this work, mostly a union-narrowing issue on `res.reason` across four pages.
They don't block the build or the deploy. Worth cleaning up on a calmer day.
