---
name: nextjs-app-router
description: Use when building, reviewing, or refactoring a Next.js App Router codebase (v15/v16) — pages, layouts, route handlers, server/client components, data fetching, caching, metadata, proxy/middleware, or migrating from the Pages Router. Covers async request APIs, the server/client boundary, Cache Components, typed route helpers, and Next.js 16 breaking changes.
license: MIT
compatibility: dsh
metadata:
  version: "1.0.0"
  source: "Derived from nextjs.org/docs (Next.js 16.x)"
---

# Next.js App Router

App Router is the only routing model for new code. Target **Next.js 16 + React 19**
(Node 20.9+, TypeScript 5.1+); Turbopack is the default bundler. `pages/` and
`next/router` are legacy — never use them in new work.

## Hard rules (read first)

1. **Request APIs are async.** `params`, `searchParams`, `cookies()`,
   `headers()`, `draftMode()` return Promises. Always `await` them (or read with
   React `use()`). Synchronous access was removed in v16.
2. **Server Components by default.** Add `"use client"` only for state, effects,
   event handlers, refs, or browser APIs. Push the boundary to leaf components.
3. **Never import server-only code into a client module.** Guard DB/env modules
   with `import "server-only"`.
4. **`route.ts` and `page.tsx` cannot coexist** in the same segment.
5. **Route Handlers are not cached by default** (since v15). Opt in with
   `export const dynamic = "force-static"`.
6. **`middleware.ts` → `proxy.ts` in v16** (Node.js runtime only).
7. **Verify auth inside every Route Handler and Server Function.** Proxy/matcher
   exclusions do not protect them.
8. **`revalidateTag(tag, profile)` needs the 2nd argument in v16.**
9. **Every parallel-route slot needs `default.js`** or the v16 build fails.
10. **Throw `notFound()` / `forbidden()` / `unauthorized()`** — never render a
    fake 404 by hand.

## Project structure

Folders are URL segments; a segment is publicly routable only with `page` or `route`.

| File | Purpose |
|---|---|
| `layout` | Shared UI, preserves state, does not rerender. Root layout must render `<html>`/`<body>`. |
| `page` | Route UI (leaf). |
| `loading` | Auto-wraps the segment in `<Suspense>`. |
| `error` | Segment error boundary — **must be a Client Component**. |
| `global-error` | Root boundary; defines its own `<html>`/`<body>`. |
| `not-found` | 404 UI via `notFound()`. |
| `route` | Route Handler (`.ts` only). |
| `template` | Like layout but remounts on navigation. |
| `default` | Fallback for a parallel-route slot (required in v16). |

- **Route groups** `(group)` organize without changing the URL (e.g. `(auth)`, `(app)`).
- **Private folders** `_folder` opt a subtree out of routing.
- **Dynamic** `[id]`, catch-all `[...slug]`, optional catch-all `[[...slug]]`.
- **Parallel routes** `@slot` render sibling slots in a layout.
- **Intercepting** `(.)`, `(..)`, `(...)` implement modal-over-route patterns.
- Colocate non-route files freely; only `page`/`route` create routes.

## Server vs Client components

```tsx
// Server Component (default): async, direct DB/secret access, zero client JS
export default async function Page({ params }: PageProps<"/posts/[id]">) {
  const { id } = await params
  return <Post post={await getPost(id)} />
}
```

- Client boundary: `"use client"` at the top of a file. Everything it imports and
  directly renders joins the client bundle — no directive on each child.
- **Pass server data down as serializable props.** Functions/class instances
  cannot cross the boundary.
- **Pass Server Components as `children`** of Client Components — the server
  output is serialized into the RSC payload; the client never imports the module.
- Use `React.cache(fn)` to dedupe non-`fetch` (ORM/DB) calls within one request.

## Data fetching

- `fetch` is **not cached by default** and blocks until it resolves.
- Identical `fetch` calls in one render pass are memoized automatically.
- Stream with `<Suspense>` (granular) or `loading.tsx` (whole segment).
- Avoid waterfalls: start promises eagerly, then `await Promise.all([...])`.
- Cache Components (`cacheComponents: true`) makes PPR the default model:
  a static shell plus streamed dynamic holes.

```ts
import { cacheLife, cacheTag } from "next/cache"

export async function getUsers() {
  "use cache"
  cacheLife("hours")
  cacheTag("users")
  return db.query("SELECT * FROM users")
}
```

- `"use cache"` functions/components must be `async`; cache keys include build id,
  function id, args, and captured closures.
- **Cannot call `cookies()`/`headers()`/`searchParams` inside `use cache`** — read
  them outside and pass values as arguments.
- Revalidate: `revalidateTag(tag, profile)` (background refresh), `updateTag(tag)`
  (Server-Action read-your-writes), `revalidatePath(path)`. Prefer tags over paths.

## Route handlers

```ts
// app/api/routines/[id]/route.ts
export async function GET(_req: Request, ctx: RouteContext<"/api/routines/[id]">) {
  const { id } = await ctx.params
  return Response.json({ data: await getRoutine(id) })
}
```

- Methods: `GET POST PUT PATCH DELETE HEAD OPTIONS` (others → 405).
- Read body with `await request.json()` / `.formData()` / `.text()`; query via
  `request.nextUrl.searchParams`.
- `GET` is dynamic by default; `export const dynamic = "force-static"` to cache it.
- With Cache Components, wrap cacheable reads in a `"use cache"` **helper**, not
  in the handler body.

## Async request APIs & typed helpers

```tsx
export default async function Page(props: PageProps<"/blog/[slug]">) {
  const { slug } = await props.params
  const query = await props.searchParams
}
```

- Generated helpers (via `next typegen`, available in dev/build): `PageProps<'/route'>`,
  `LayoutProps<'/route'>`, `RouteContext<'/route'>`.
- Using `searchParams` opts the page into dynamic rendering.

## Proxy (formerly middleware)

```ts
// proxy.ts (project root, next to app/)
import { NextResponse, type NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  if (!request.cookies.has("session")) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  return NextResponse.next()
}

export const config = { matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"] }
```

- Renamed from `middleware.ts` in v16. **Node.js runtime only**; Edge requires
  keeping `middleware.ts`. Codemod: `npx @next/codemod@canary middleware-to-proxy .`
- For headers, rewrites, redirects, CORS, and optimistic auth checks only — not
  data fetching. Always re-verify auth inside handlers/functions.

## Metadata

Server Components only: static `export const metadata: Metadata` or
`export async function generateMetadata({ params }): Promise<Metadata>` (await
`params`). Memoize shared data between metadata and the page with `React.cache`.

## Common mistakes

| Mistake | Fix |
|---|---|
| `params`/`cookies()` used synchronously | `await` them (removed in v16) |
| `useState`/`useEffect` in a Server Component | Extract a Client Component |
| Server-only module imported into a client file | `import "server-only"` guard |
| Whole page marked `"use client"` | Push the boundary to leaf components |
| Non-serializable prop across the boundary | Pass plain data / Server Functions |
| Expecting `fetch`/`GET` handlers to be cached | Opt in explicitly |
| `cookies()` inside `use cache` | Read outside; pass as args |
| One-arg `revalidateTag` | Pass a cacheLife profile |
| Parallel slot without `default.js` | Add it (v16 build fails otherwise) |
| Auth only in proxy | Re-check in every handler/Server Function |
| Layout reads runtime data with no `<Suspense>` | Wrap it; `loading.tsx` won't cover it |

## Project alignment (gym-tracker)

This repo is **client-first** (see `docs/superpowers/specs/2026-09-22-gym-tracker-design.md`).
Apply the App Router rules above, with these project conventions:

- **RSC renders static shells/layouts** (fast first paint). **Data flows through
  `app/api/*` Route Handlers** consumed by axios + TanStack Query — do **not** call
  Prisma directly from pages just because you can.
- **Layering:** thin Route Handler → service → repository. Handlers only parse,
  validate, auth-gate, map errors, and set status.
- **Validate with shared Zod schemas** (same schema client and server); never
  hand-roll body validation.
- **API envelope:** success `{ data }`; error `{ error: { code, message, details? } }`
  via the shared `toApiError` mapper.
- **Scope every query by `userId`** from the Auth.js session; never trust ids from
  the client, and `select` only the fields you need.
- Locale-prefixed routes (`app/[locale]/...`); `/api` is not localized.

## Verify before done

- [ ] No synchronous access to `params`/`searchParams`/`cookies()`/`headers()`.
- [ ] Every `"use client"` is justified and as low in the tree as possible.
- [ ] Sensitive modules guarded with `server-only`.
- [ ] Each route handler validates input, checks auth, and returns the envelope.
- [ ] Proxy matcher does not accidentally exclude protected paths.
- [ ] `next build` and `next typegen` pass (typed route helpers resolve).
