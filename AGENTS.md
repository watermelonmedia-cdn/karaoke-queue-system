# Fusion Starter

A production-ready full-stack React application template with integrated Express server, featuring React Router 6 SPA mode, TypeScript, Vitest, Zod and modern tooling.

While the starter comes with a express server, only create endpoint when strictly neccesary, for example to encapsulate logic that must leave in the server, such as private keys handling, or certain DB operations, db...

## Tech Stack

- **PNPM**: Prefer pnpm
- **Frontend**: React 18 + React Router 6 (spa) + TypeScript + Vite + TailwindCSS 3
- **Backend**: Express server integrated with Vite dev server
- **Testing**: Vitest
- **UI**: Radix UI + TailwindCSS 3 + Lucide React icons

## Project Structure

```
client/                   # React SPA frontend
├── pages/                # Route components (Index.tsx = home)
├── components/ui/        # Pre-built UI component library
├── App.tsx                # App entry point and with SPA routing setup
└── global.css            # TailwindCSS 3 theming and global styles

server/                   # Express API backend
├── index.ts              # Main server setup (express config + routes)
└── routes/               # API handlers

shared/                   # Types used by both client & server
└── api.ts                # Example of how to share api interfaces
```

## Key Features

## SPA Routing System

The routing system is powered by React Router 6:

- `client/pages/Index.tsx` represents the home page.
- Routes are defined in `client/App.tsx` using the `react-router-dom` import
- Route files are located in the `client/pages/` directory

For example, routes can be defined with:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";

<Routes>
  <Route path="/" element={<Index />} />
  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
  <Route path="*" element={<NotFound />} />
</Routes>;
```

### Styling System

- **Primary**: TailwindCSS 3 utility classes
- **Theme and design tokens**: Configure in `client/global.css` 
- **UI components**: Pre-built library in `client/components/ui/`
- **Utility**: `cn()` function combines `clsx` + `tailwind-merge` for conditional classes

```typescript
// cn utility usage
className={cn(
  "base-classes",
  { "conditional-class": condition },
  props.className  // User overrides
)}
```

### Express Server Integration

- **Development**: Single port (8080) for both frontend/backend
- **Hot reload**: Both client and server code
- **API endpoints**: Prefixed with `/api/`

#### Example API Routes
- `GET /api/ping` - Simple ping api
- `GET /api/demo` - Demo endpoint  

### Shared Types
Import consistent types in both client and server:
```typescript
import { DemoResponse } from '@shared/api';
```

Path aliases:
- `@shared/*` - Shared folder
- `@/*` - Client folder

## Development Commands

```bash
pnpm dev        # Start dev server (client + server)
pnpm build      # Production build
pnpm start      # Start production server
pnpm typecheck  # TypeScript validation
pnpm test          # Run Vitest tests
```

## Adding Features

### Add new colors to the theme

Open `client/global.css` and `tailwind.config.ts` and add new tailwind colors.

### New API Route
1. **Optional**: Create a shared interface in `shared/api.ts`:
```typescript
export interface MyRouteResponse {
  message: string;
  // Add other response properties here
}
```

2. Create a new route handler in `server/routes/my-route.ts`:
```typescript
import { RequestHandler } from "express";
import { MyRouteResponse } from "@shared/api"; // Optional: for type safety

export const handleMyRoute: RequestHandler = (req, res) => {
  const response: MyRouteResponse = {
    message: 'Hello from my endpoint!'
  };
  res.json(response);
};
```

3. Register the route in `server/index.ts`:
```typescript
import { handleMyRoute } from "./routes/my-route";

// Add to the createServer function:
app.get("/api/my-endpoint", handleMyRoute);
```

4. Use in React components with type safety:
```typescript
import { MyRouteResponse } from '@shared/api'; // Optional: for type safety

const response = await fetch('/api/my-endpoint');
const data: MyRouteResponse = await response.json();
```

### New Page Route
1. Create component in `client/pages/MyPage.tsx`
2. Add route in `client/App.tsx`:
```typescript
<Route path="/my-page" element={<MyPage />} />
```

## Production Deployment

- **Standard**: `pnpm build`
- **Binary**: Self-contained executables (Linux, macOS, Windows)
- **Cloud Deployment**: Use either Netlify or Vercel via their MCP integrations for easy deployment. Both providers work well with this starter template.

## Architecture Notes

- Single-port development with Vite + Express integration
- TypeScript throughout (client, server, shared)
- Full hot reload for rapid development
- Production-ready with multiple deployment options
- Comprehensive UI component library included
- Type-safe API communication via shared interfaces

---

# Rossco's Karaoke - project specifics

Read this before changing anything singer-facing.

## Scope

**One host, one event, at a time.** The app is not for coordinating multiple
concurrent events. Do not add multi-event or multi-room features without asking.

## The TWO song submission paths. Both are intentional. Do not merge them.

| File | Route | Function | device_id / ip | Audience |
|---|---|---|---|---|
| `client/pages/Index.tsx` | `/` | `addRequestAsync` | real values | End user. **The only singer-facing form.** |
| `client/pages/Host.tsx` | `/host` | `addRequestAsHost` | literal `"host"` | Host, entering songs in the background |

The end-user form lives in the `SubmitForm` component in `Index.tsx`, at the
`#submit-form-section` anchor that the hero button scrolls to.

**Any change to the request form goes in `Index.tsx`.** Styling changes too:
`/` is the page every singer sees.

A third page, `client/pages/Event.tsx` at `/event/:id`, was **deleted**. It was
a per-event singer page from before the landing page took over, and nothing in
the app linked to it. It duplicated the request form, which caused two bugs in
one session: a duet feature and a styling pass both shipped to it instead of to
`Index.tsx` and were invisible to users. Do not reintroduce it.

Event creation is in `HostEvents.tsx` (`/host/events`) and the Start Shift modal
in `Host.tsx`. Both call `upsertEvent`.

## Singer identity grouping

`client/lib/identity.ts` groups every request in an event, **including completed
ones**, into "people" by union-find over shared IP and shared device id. This
catches a singer who performed earlier and re-submits under a new name, which
the old active-queue-only check missed.

- Placeholders `"host"`, `"unknown"` and empty strings are excluded from
  linking, so host-entered songs never group with real singers.
- Labels (P1, P2...) are per event, derived at render, ordered by first
  appearance. Not stored; they can renumber if two groups merge.
- Colour is assigned only to people who used more than one name, so a coloured
  badge always means "look at this".
- On venue wifi everyone shares a public IP, so **device id is the load-bearing
  signal**. If device ids stop persisting, the whole room collapses into one
  person.

Covered by `client/lib/identity.spec.ts`. Run `npx vitest run` before shipping
changes to it.

## Singers are anonymous. Never change this.

End users do NOT authenticate. No account, no email, no login. Requests are
submitted anonymously through the public form in `Index.tsx` using the
publishable key.

Supabase Auth applies to `/host/login` only. If a change would make a singer
sign in, or add any step before they can submit a song, it is wrong. Friction
here directly reduces the number of requests coming in during an event.

Anonymous insert and read policies are recreated in section 0 of
`supabase-rls-step2.sql` so they survive any RLS change.

## Build and deploy

- Vite outputs to `dist/spa`, **not** `dist`. `vercel.json` sets
  `outputDirectory`. Removing it gives a 404 on every route.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are inlined at build time.
  Changing them needs a redeploy.
- Without them `getSupabase()` returns null and all 12 call sites silently
  no-op, falling back to per-browser localStorage. The app looks healthy and
  nothing syncs between devices.
- Push with `PUSH.bat`. It clears stale `.git/*.lock` files first; a leftover
  lock silently blocks `git add` and produces an empty-looking push.

## Mobile

Singers are on phones, often old ones. Below 640px, `backdrop-filter` is
disabled and the grain layer is hidden for performance. Tap targets are 44px on
phones. Keep it that way.

## Known state

- Host login is `djross` / `merlinthedog`, hashed in-browser, stored in
  `localStorage` per device. Not real security. Migrating to Supabase Auth is
  the next planned job.
- `supabase-rls-step2.sql` is written but **must not run until that migration
  lands**: it restricts writes to `authenticated` and the host is currently
  `anon`.
- Singer IP addresses are readable by anyone with the public key until step 2
  runs.
- 7 pre-existing TypeScript errors, mostly union narrowing on `res.reason`.
  They do not block the build. Compare against baseline before assuming a
  change introduced one.
