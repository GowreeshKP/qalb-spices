# QALB Spices shop

A full-stack storefront for QALB Spices: public catalogue with search, filters and pagination; customer accounts, cart and checkout; and an admin area for products and orders. Built on the QALB brand system (colours, type and components from the Developer Handbook v1.0).

| Layer | Choice |
| --- | --- |
| Frontend | Next.js 15 (App Router), React 19, TypeScript (strict), Tailwind CSS 3 |
| API | REST route handlers in `src/app/api`, thin service layer in `src/server/services` |
| Database | Prisma 6 + SQLite (zero setup). PostgreSQL swap documented below |
| Auth | Server-side sessions (HttpOnly cookie, hashed token in DB), bcrypt, roles: Guest, User, Admin |
| Validation | Zod, shared by client forms and server routes (`src/lib/validators.ts`) |
| Tests | Vitest (unit + integration), Playwright (end-to-end) |

## Quick start

Requires Node.js 20 or newer.

```bash
cd qalb-shop
npm install                 # also generates the Prisma client
cp .env.example .env        # on Windows PowerShell: Copy-Item .env.example .env
npm run db:setup            # applies migrations and seeds demo data
npm run dev                 # http://localhost:3000
```

Seeded accounts (change them in `.env` before seeding any shared database):

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@qalb.test` | `Admin#12345` |
| Customer | `user@qalb.test` | `User#12345` |

The seed also creates seven active products (one with only 3 in stock, to try the stock limits) and one archived product.

### Production

```bash
npm run build
npm run db:deploy           # apply migrations to the production database
npm start
```

Set `NODE_ENV=production` (done by `next start`), a real `DATABASE_URL`, and `APP_URL` to the public origin (used for the CSRF origin check). Run behind HTTPS: the session cookie is `Secure` in production and HSTS is sent.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | `tsc --noEmit` (strict, no `any`) |
| `npm run db:setup` | Apply migrations, then seed |
| `npm run db:migrate` | Create/apply a new migration during development |
| `npm run db:deploy` | Apply existing migrations (CI/production) |
| `npm run db:seed` | Seed demo data (idempotent) |
| `npm run db:reset` | Drop, re-migrate (dev only) |
| `npm test` | Unit, then integration, then E2E |
| `npm run test:unit` | Pure logic, validators, helpers |
| `npm run test:integration` | API routes against a real migrated database |
| `npm run test:e2e` | Full journeys in a real browser |

## Running the tests from scratch

```bash
npm install
npx playwright install chromium     # one-time browser download for E2E
npm test
```

* **Unit** (`tests/unit`): validators, money, slugs, pagination, order-status rules, image sniffing, rate limiter, password hashing, session and cookie helpers, error mapping, the route wrapper and the logger. No database needed.
* **Integration** (`tests/integration`): calls the real route handlers with real `Request` objects against `prisma/test.db`, which is rebuilt from the actual migrations before each run. Covers auth and CSRF, password reset, profile, product CRUD and permissions, search/filter/sort/pagination, cart rules, checkout (idempotency, stock races, rollback), order access control and status transitions, and uploads. Files run one at a time because they share one SQLite file.
* **E2E** (`tests/e2e`): Playwright starts its own production build on port 3100 with a throwaway database (`prisma/e2e.db`, migrated and seeded by `scripts/e2e-prepare.mjs`), then drives Chromium through sign-up, login/logout, roles, account settings, catalogue browsing, cart and checkout, double-submit protection, stock conflicts, admin product and order management, and security checks (CSRF, headers, cookies, XSS, traversal). The first run takes a couple of minutes because it builds the app. Reports go to `playwright-report/`; traces and screenshots of failures go to `test-results/`.

## Project structure

```
prisma/                 schema, migrations, seed
scripts/                e2e-prepare.mjs (fresh database for E2E)
src/
  app/                  pages and API route handlers (App Router)
  components/           UI components (server and client)
  lib/                  pure, shared code: validators, money, slug, pagination, order rules
  server/               server-only code: db, auth, services, http wrapper, logger, uploads
  middleware.ts         exposes the requested path so guests return to it after login
tests/
  unit/  integration/  e2e/
```

## Behaviour worth knowing

**Roles and access**

* Guests can browse the shop and product pages. Cart, orders and account need a login; `/admin/*` needs the ADMIN role. Guests are sent to `/login?next=...` and returned afterwards (only same-site paths are accepted).
* Customers only ever see their own orders. Someone else's order id returns 404, not 403, so ids cannot be probed.
* Signing up always creates a USER. Role fields in request bodies are ignored.

**Data integrity**

* Every input is validated with Zod on both client and server. Server errors use one shape: `{ "error": string, "code": string, "details"?: ... }`, with `details.fieldErrors` for validation problems (HTTP 422).
* Prices are always read from the database at checkout, never from the client, and are copied onto the order lines.
* Checkout runs in one transaction. Stock is decremented with a guarded update, so two buyers cannot take the last unit; any failing line rolls everything back.
* Checkout takes an idempotency key (created once per checkout attempt in the browser). Replaying it returns the original order (HTTP 200) rather than creating a duplicate. Buttons also ignore double clicks.
* Product edits use a `version` number (compare-and-set). A stale edit gets `409 VERSION_CONFLICT`.
* Products that appear in past orders cannot be deleted (`409 PRODUCT_HAS_ORDERS`); archive them instead. Archived products disappear from the shop and cart.
* Order status moves only forward (`PLACED -> SHIPPED -> DELIVERED`), or to `CANCELLED` before delivery. Customers can cancel only while `PLACED`. Cancelling returns stock exactly once.
* Optimistic UI: cart quantity/removal and admin archive/restore update instantly and roll back on error.

**Security**

* Passwords: bcrypt (cost 12, configurable), 10+ characters with a letter and a number. Login timing is equalised for unknown emails, failed logins are rate limited (10 per 15 minutes per IP and email), and reset requests never reveal whether an account exists.
* Sessions: random 256-bit tokens, only their SHA-256 hash is stored, 7-day expiry, revoked on logout, password change (other devices) and password reset (all devices).
* CSRF: `SameSite=Lax` cookies plus a strict `Origin` check on every non-GET API request, JSON-only bodies.
* SQL injection: all queries go through Prisma (parameterised). XSS: React escapes output, text input has control characters stripped, image URLs must be same-origin paths, and a CSP is sent. Uploads are checked by magic bytes (PNG/JPEG/WebP only, 2 MB), renamed to random UUIDs and served with `nosniff` and a locked-down CSP, so a script renamed `.png` is rejected.
* Responses never include stack traces; unexpected errors become `500 INTERNAL_ERROR` and are logged server-side with a request id (`x-request-id`).
* Secrets live in environment variables. `.env` is git-ignored; copy `.env.example`.

**Observability**

* Structured JSON logs (one line per request with method, path, status, duration and request id). Sensitive keys such as `password` and `token` are redacted. Control verbosity with `LOG_LEVEL`.
* `GET /api/health` returns `200 { status: "ok", database: "up" }`, or `503` when the database is unreachable.

## Switching to PostgreSQL

1. In `prisma/schema.prisma` change `provider = "sqlite"` to `"postgresql"`.
2. Set `DATABASE_URL` to your `postgresql://...` URL.
3. Delete `prisma/migrations`, run `npm run db:migrate -- --name init`, then `npm run db:seed`.

For multi-instance deployments also replace the in-memory rate limiter (`src/server/rate-limit.ts`) with a shared store, and move uploads (`UPLOAD_DIR`) to object storage.

## Known limits and next steps

* **Email is not wired up.** `src/server/mailer.ts` records messages in memory and logs only the recipient and subject. Plug in SES, Resend or SMTP there. For local development you can set `EXPOSE_DEV_RESET_LINK=true` to have the forgot-password response include the reset link; this is ignored in production.
* **Payment is pay-on-delivery.** There is no payment provider integration.
* **Prices are in INR** (`src/lib/money.ts`); change `CURRENCY` there.
* Brand assets still pending from the handbook: master SVG logo files, the Q-monogram favicon, and a botanical illustration set. Product photos in `public/images` are placeholders.
* The password-reset email flow is covered by integration tests, but not end to end in the browser, because the production build deliberately never exposes the reset link.
