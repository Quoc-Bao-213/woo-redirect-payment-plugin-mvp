<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Next.js + React 19 Production-Grade LLM Instructions

You are an expert in **TypeScript**, **Next.js (App Router)**, and **production React**.  
You write maintainable, performant, secure, and accessible code that follows modern framework guidance.

---

## TypeScript Best Practices

- Enable `"strict": true` in `tsconfig.json`.
- Prefer **type inference**, but annotate **public APIs** (exports, route handlers, server actions).
- Never use `any`. Use `unknown` with type guards or schema validation (Zod, Valibot).
- Explicitly model server/client boundaries with typed inputs/outputs.
- Use **discriminated unions** instead of enums.
- Avoid ambient types and globals.
- Co-locate types with features.
- Enable safety flags:  
  `noUncheckedIndexedAccess`, `noPropertyAccessFromIndexSignature`, `exactOptionalPropertyTypes`.

---

## React & Next.js Fundamentals

- Default to **Server Components**.
- Use `"use client"` only for browser interactivity.
- Prefer **Server Actions** for mutations and form handling.  
  Use **Route Handlers** only for public APIs, webhooks, or cross-app consumption.
- Target **React 19** (stable) with **Next.js 16+** — use Actions, Transitions, and RSC.
- Use **App Router** with filesystem conventions (`src/app/`, `layout.tsx`, route groups).
- Avoid Pages Router for new projects.

---

## Architecture & Project Structure

- Organize by **feature (vertical slices)**, not technology.
- Each feature folder includes its components, server actions, tests, and styles.
- Follow **Clean Architecture**:
  - **Domain** → pure business logic  
  - **Application** → use cases and services  
  - **Infrastructure** → DB, APIs, external adapters
- Keep boundaries explicit:
  - `server/` → server-only utilities  
  - `components/` → shared UI primitives  
  - `lib/` → pure, shared domain logic
- For large projects, use a **Turborepo monorepo** with shared packages:
  - `@acme/ui`, `@acme/tsconfig`, `@acme/eslint-config`, `@acme/schemas`, etc.
- Co-locate tests and stories with features.

---

## Data Fetching, Caching & Revalidation

- Fetch in **Server Components** by default.
- Use built-in Next.js caching:
  - Static content: `export const revalidate = <seconds>`
  - Dynamic/private: `fetch(url, { cache: 'no-store' })`
- Use **Incremental Static Regeneration (ISR)** or `revalidate` for periodic updates.
- Prefer **On-Demand Revalidation** for CMS integrations.
- For mutations:
  - Use **Server Actions** with optimistic UI (`useOptimistic`, Transitions).
  - Invalidate relevant paths instead of managing client caches manually.

---

## Components & State Management

- Keep components **small and focused**.
- Logic lives in pure functions or server utilities.
- Default to **Server Components**.
- Use **Client Components** only when required (event handlers, effects, browser APIs).
- Prefer **React built-ins**:
  - `useTransition`, `useOptimistic`, `useActionState`
- Avoid extra client state libraries unless truly needed.
- Derived data should stay derived — no duplicate state.
- Whenever rendering lists with `.map`, evaluate extracting the mapped fragment into a dedicated component to improve readability, reusability, and test coverage.

---

## Routing & Navigation

- Use nested `layout.tsx` for shared UI or data boundaries.
- Use **route groups** `( )` for organization without changing URLs.
- Use `<Link prefetch>` defaults; don’t override prefetching unless necessary.
- Avoid manual routers.

---

## Performance

- Minimize JS shipped to the browser — prefer server rendering.
- Use **Server Components** + `loading.tsx` for streaming and improved TTFB.
- Use `next/image` for all images:
  - Always include `alt`, `sizes`, `width`/`height` (or `fill`).
  - Define remote patterns or loaders for external sources.
- Use `next/font` for automatic optimization; avoid manual `<link>` tags.
- Avoid client-only fetching if server fetching is possible.
- Run **Lighthouse** regularly; fix hydration warnings immediately.

---

## Security

- Enforce strict **Content Security Policy (CSP)**:
  - Generate nonces in middleware for inline scripts.
  - Avoid `'unsafe-inline'`.
- Centralize headers:  
  `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`.
- Never expose secrets to the client:
  - Use `process.env` only in server code.
  - Only `NEXT_PUBLIC_` env vars are allowed in the client.
- Sanitize all inputs and outputs:
  - Validate with **Zod** or **Valibot**.
  - Avoid `dangerouslySetInnerHTML`; sanitize if absolutely required.
- Use **httpOnly cookies** for session/auth tokens.
- Defend against **CSRF** and **XSS**.
- Follow Next.js **Data Security** and middleware guidelines.

---

## Assets: Images, Fonts, Scripts

- Always use `next/image`:
  - Include `alt`, known dimensions, or `fill` layout.
  - Configure `remotePatterns` for external sources.
- Use `next/font` for local and Google fonts — reduces layout shift.
- Use `<Script strategy="lazyOnload">` for third-party scripts.

---

## Accessibility

- Always use **semantic HTML** and ARIA correctly.
- Every interactive element must be keyboard-accessible.
- Visible focus outlines are mandatory.
- Test with **axe**, **Lighthouse**, and manual keyboard navigation.

---

## Testing & Quality

- **Unit + integration**: Vitest/Jest + React Testing Library.
- **E2E**: Playwright.
- Test critical paths (auth, routing, server actions, errors).
- Enforce linting (`eslint-config-next`) + Prettier + type-checking in CI.

---

## Observability

- Use structured logging on the server.
- Capture Web Vitals (`onCLS`, `onFID`, `onLCP`).
- Integrate error tracking (e.g., Sentry).
- Track cache hit/miss rates and revalidation triggers.

---

## CI/CD & Deployment

- Run `next build` with `--strict` and type-checking in CI.
- Run tests before deploy.
- Monitor bundle size budgets; fail builds that exceed them.
- For **Vercel**:
  - Use ISR and Data Cache effectively.
  - Deploy edge functions for latency-critical reads.

---

## Route Handlers vs. Server Actions

| Use Case | Recommendation |
|-----------|----------------|
| In-app form handling | **Server Actions** |
| Mutations + optimistic updates | **Server Actions** |
| Public APIs / webhooks / mobile clients | **Route Handlers** |
| Cross-app data sharing | **Route Handlers** |

---

## Production Checklist

- [ ] No hydration warnings.  
- [ ] All images via `next/image` with correct sizes.  
- [ ] Fonts use `next/font`.  
- [ ] Revalidation/caching explicitly defined.  
- [ ] CSP + headers configured.  
- [ ] No secrets in client code.  
- [ ] Lighthouse scores all green (Perf, A11y, SEO).  
- [ ] Web Vitals logged.

---

## Codex Code Style Rules

- Prefer **Server Components** by default.
- Use `"use client"` **only when necessary**.
- Co-locate **Server Actions** with components that use them.
- Never access `process.env` in client code.
- For fetching:
  ```ts
  // Static
  export const revalidate = 3600;
  const data = await fetch(url, { next: { revalidate: 3600 } }).then(r => r.json());

  // Dynamic
  const data = await fetch(url, { cache: 'no-store' }).then(r => r.json());

