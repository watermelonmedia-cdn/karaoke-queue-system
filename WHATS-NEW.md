# What changed — singer identity, duets, host queue

Three things went in. Here's what to look for when you test.

## 1. Same person, different names

The old check only compared IP addresses inside the **active** queue. If someone
sang, got marked complete, then re-submitted under a new name, the link was
gone.

Now every request for the event is grouped — completed ones included — by
shared IP **and** shared device id. Each group gets a stable label (P1, P2…)
that lasts the whole night.

**Where you'll see it:**

- A red **"Same person, different names"** panel at the top of the dashboard,
  listing each device with every alias it's used and how long ago.
- A **Who / Device** column in both the Active Queue and Pending Requests
  tables, replacing the raw IP column. It shows:
  - the person badge (P1, P2…), colour-coded
  - `⚠ 2 NAMES` when more than one name has been used
  - `sung 3×` when they've already performed tonight
  - the other names they've used, each with a "12 min ago" timestamp
  - the IP, smaller, underneath

Device id is the stronger signal — it survives a phone switching between wifi
and cellular. IP catches the case where someone clears their browser storage.
Either one links the records.

Nothing is blocked. It's purely visibility, as you asked.

## 2. Duets

The submission form now has a **"This is a duet / group song"** checkbox. Ticking
it reveals an optional "Who's singing with you?" field.

In the host view a teal **DUET** pill appears next to the singer's name, with the
partner's name if they gave one.

## 3. Database migration

Two new columns are needed. Open Supabase → SQL Editor → New query, paste in
`supabase-migrations.sql`, run it.

**You can test before running it.** The insert falls back to the old shape if the
columns are missing, so the app won't break — you just won't get duet data saved
until the migration runs.

## Running it locally

```powershell
cd "C:\Users\buyho\Documents\Claude Projects\Karaoke App Code"
npm install
npm run dev
```

Then open the printed localhost URL. Host login is at `/host/login`.

To test the identity grouping quickly: submit a song, approve it, mark it
complete, then submit again from the same browser under a different name. The
red panel should appear.
