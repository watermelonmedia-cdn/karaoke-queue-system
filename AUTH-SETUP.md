# Host auth migration - what to do

> ## Singers never log in
>
> This applies **only** to `/host/login`. Nothing here adds a step for the
> people requesting songs.
>
> Their flow is unchanged: open the page, type name and song, submit. No
> account, no email, no password, no extra tap, no added wait.
>
> Verified in the code: `Index.tsx`, the only singer-facing page, contains no
> reference to `loginHost`, `signInWithPassword` or `isHostAuthed`. Anonymous
> inserts are explicitly preserved in section 0 of `supabase-rls-step2.sql`.
>
> If a singer is ever asked to sign in, that is a bug. Report it.

The code now supports real Supabase Auth. It is **not** switched on yet, because
switching it on requires creating a user, which only you can do.

Nothing is broken in the meantime. Login falls back to the old in-browser
account automatically, so you can keep working either way.

---

## Why this is worth finishing

Right now `djross` / `merlinthedog` is checked entirely in the browser, stored
per-device in `localStorage`. Anyone who reads your page source can see how it
works, and the password is in your public repo history.

More importantly, it blocks `supabase-rls-step2.sql`, which is what stops your
singers' IP addresses being readable by anyone with your public key.

---

## Step 1 - create your host user (2 minutes)

Supabase dashboard → **Authentication** → **Users** → **Add user** →
**Create new user**.

- Email: your real email
- Password: something strong, from your password manager
- Tick **Auto Confirm User**, otherwise you'll be stuck waiting on a
  confirmation email

I can't do this part. Creating accounts and handling passwords is not something
I'm able to do on your behalf.

## Step 2 - turn off public signups

Same section → **Providers** → **Email** → turn **Enable signup** OFF.

Skip this and anyone can create themselves a host account.

## Step 3 - sign in

Go to `/host/login` and use the **email address**, not `djross`.

The field accepts either. If what you type contains an `@` it tries Supabase
first; anything else goes straight to the legacy check.

**How to tell it worked:** the amber "Legacy login in use" banner at the top of
the host dashboard is gone. If you still see it, you're on the fallback.

## Step 4 - only now, run the RLS lockdown

Once you have confirmed that banner is gone:

Supabase → SQL Editor → paste `supabase-rls-step2.sql` → Run.

**Do not run it before that.** It restricts writes to `authenticated` sessions.
On a legacy login you are `anon`, so you would lose the ability to approve
songs, reorder the queue, or mark anything complete.

If it goes wrong, the rollback is commented at the bottom of that file.

## Step 5 - verify, then retire the old password

Check the queue still loads, then confirm the IP columns are actually hidden.
In the browser console on your live site, signed out:

```js
// should now fail with: permission denied for column ip
fetch(SUPABASE_URL + '/rest/v1/requests?select=ip&limit=1',
      {headers:{apikey:PUBLISHABLE_KEY}}).then(r=>r.status)
```

Then change the legacy password in Host Settings so `merlinthedog` stops
working. Keep the legacy account, just make it something only you know. It is
your way back in if Supabase ever has an outage mid-event.

---

## How the fallback works

`loginHost()` in `client/lib/karaoke.ts`:

1. If the identifier contains `@` and Supabase is configured, try
   `signInWithPassword`.
2. On success, mark the session mode as `supabase`.
3. On any failure, fall through to the legacy SHA-256 check and mark the mode
   `legacy`.

The mode is stored under `karaoke_authMode` and surfaced in the host dashboard
banner. `refreshHostSession()` re-checks the Supabase session on load, so a
real session survives a page refresh.

This dual path is deliberate. A single hard cutover to Supabase Auth could lock
you out of your own dashboard in the middle of an event, which is the one
failure this app cannot afford.
