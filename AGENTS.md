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

Read this before changing anything singer-facing. Two mistakes were made in one
session by not knowing it.

## There are THREE song submission paths. All three are intentional.

| File | Route | Function called | device_id / ip stored | Audience |
|---|---|---|---|---|
| `client/pages/Index.tsx` | `/` | `addRequestAsync` | real values | End user. **Primary surface.** |
| `client/pages/Event.tsx` | `/event/:id` | `addRequestAsync` | real values | End user |
| `client/pages/Host.tsx` | `/host` | `addRequestAsHost` | literal `"host"` | Host, working in the background |

**Do not "consolidate" these.** The host form and the end-user forms serve
different jobs and both are needed.

`Index.tsx` is where singers actually submit. Its form lives in the `SubmitForm`
component at the `#submit-form-section` anchor, which the hero button scrolls
to. **Any change to the request form must be applied to `Index.tsx`**, and
usually to `Event.tsx` as well. Changing only `Event.tsx` looks correct in code
review and is invisible to real users.

Same trap applies to styling. `/` is the landing page every singer sees.

## Singer identity grouping

`client/lib/identity.ts` groups every request in an event, **including completed
ones**, into "people" by union-find over shared IP and shared device id. This is
what catches a singer who performed earlier and re-submits under a new name.

- Placeholder values `"host"`, `"unknown"` and empty strings are deliberately
  excluded from linking, so host-entered songs never group with real singers.
- Labels (P1, P2...) are per event, derived at render time, ordered by first
  appearance. They are not stored and can renumber if groups merge.
- Colour is only assigned to people who used more than one name, so a coloured
  badge always means "look at this".
- On venue wifi everyone shares a public IP, so **device id is the load-bearing
  signal**. If device ids ever stop persisting, the whole room collapses into
  one person.

Covered by `client/lib/identity.spec.ts`. Run `npx vitest run` before shipping
changes to it.

## Build and deploy

- Vite outputs to `dist/spa`, **not** `dist`. `vercel.json` sets
  `outputDirectory` accordingly. Removing that produces a 404 on every route.
- Env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are inlined at build
  time. Changing them requires a redeploy, not just a restart.
- Without them `getSupabase()` returns null and all 12 call sites silently
  no-op, falling back to per-browser localStorage. The app looks fine and
  nothing syncs between devices.
- Push with `PUSH.bat`. It clears stale `.git/*.lock` files first; a leftover
  lock silently blocks `git add` and results in an empty-looking push.

## Known state

- Host login is `djross` / `merlinthedog`, hashed in-browser and stored in
  `localStorage` per device. Not real security. Migrating to Supabase Auth is
  the next planned job.
- `supabase-rls-step2.sql` is written but **must not run until that migration
  lands**, because it restricts writes to `authenticated` and the host is
  currently `anon`.
- Singer IP addresses are readable by anyone with the public key until step 2
  runs.
- 8 pre-existing TypeScript errors, mostly union narrowing on `res.reason`.
  They do not block the build. Compare against baseline before assuming a
  change introduced one.
