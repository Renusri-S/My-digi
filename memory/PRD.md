# Studium Labs Marketplace PRD

## Original problem statement
Build a production-quality digital project marketplace for college students with discovery, project details, cart, secure Razorpay checkout architecture, protected downloads, Supabase-ready authentication, student dashboard, admin dashboard, analytics, SEO, responsive accessibility, and six realistic sample projects.

## Architecture decisions
- React JavaScript starter preserved with reusable JSX components and Tailwind-compatible CSS; TypeScript migration remains a later refactor.
- Existing FastAPI + MongoDB architecture retained for dynamic project data and payment/download API boundaries.
- Supabase Auth and Storage, Razorpay, and signed downloads are represented as fail-closed integration contracts; no fake payment success.
- Project catalog data lives in backend seed/database flow rather than UI components.

## User personas
- College student discovering, learning from, purchasing, and presenting a project.
- Platform owner managing projects, orders, users, categories, analytics, and SEO.

## Core requirements (static)
- Premium Archive / Signal visual system with responsive layouts and accessible interaction states.
- Six catalog projects across AI/ML, Generative AI, Computer Vision, Full Stack, Data Science, and NLP.
- Student routes: landing, catalogue, detail, login/register, cart, checkout, dashboard, purchases, profile.
- Admin routes with fail-closed access boundary.
- Secure server-side payment and download architecture; never trust client prices or expose private assets.

## What is implemented (2026-08-10)
- Built responsive landing page, project library, dynamic search/filter/sort, project details with tabs, cart, checkout boundary, auth screens, student workspace, and protected admin route shell.
- Added FastAPI project/category endpoints, six seeded projects, secure payment creation/verification/webhook boundaries, purchases auth boundary, protected download boundary, and admin overview auth boundary.
- Added polished responsive styling, motion, reduced-motion support, toasts, skeleton/empty states, unique data-testid coverage, and mobile overflow validation.
- Added canonical studium-labs detail alias to the Neural Notes seed project.

## What is implemented (2026-02-10 — Supabase integration)
- Wired **Supabase Auth** end-to-end using the publishable key: email/password sign-in, sign-up, Google OAuth entry point, session persistence, and automatic profile fetch via `useAuth` React context.
- Added `/app/schema.sql` — full Postgres schema (profiles, categories, projects, orders, order_items, purchases, analytics_events, site_settings), RLS policies, admin bootstrap for `renusrisiva@gmail.com`, storage buckets (`thumbnails` public, `source-zips` private), and idempotent seed of the six sample projects. To be run once in Supabase SQL Editor.
- **Projects catalogue and detail now fetch from Supabase** first, falling back to the FastAPI/MongoDB demo seed until the SQL migration is executed.
- **FastAPI backend verifies Supabase JWTs** via the project's JWKS endpoint (`/auth/v1/.well-known/jwks.json`), with legacy HS256 fallback. New `/api/me` endpoint returns the authenticated user's identity + admin flag. Admin routes require the configured `ADMIN_EMAIL`.
- **Student dashboard** now loads real purchases from the `purchases` table (RLS-scoped). Profile page lets users edit `full_name` and `mobile` (updates `profiles` table under RLS).
- **Admin dashboard** protected by `renusrisiva@gmail.com` gate. Admin can list, create, edit, delete, publish/archive projects with a full form (all fields including features/deliverables/learning outcomes, discount, accent, featured/popular flags).
- Razorpay is intentionally **still a dummy** — `/api/payments/create-order` returns `pending_gateway_credentials` with server-computed prices and never fakes success. Ready to activate once `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are added to backend `.env`.
- Signed downloads endpoint returns `503 — add SUPABASE_SECRET_KEY to enable` until the service-role/secret key is provided.
- Added legal pages: `/privacy`, `/terms`, `/refund-policy`.

## Prioritized backlog
P0
- Connect Supabase URL/anon key and implement real email/password + Google session handling.
- Validate Supabase JWT and admin role/allowlist server-side; persist profiles and purchases with RLS.
- Add Razorpay SDK and environment credentials to create orders, verify signatures, and reconcile webhooks.
- Implement private Supabase Storage buckets and short-lived signed download URLs.
P1
- Replace static dashboard metrics with database-backed purchases, download history, and admin analytics.
- Add admin CRUD forms for projects, categories, assets, orders, users, SEO, and settings.
- Add real route metadata, sitemap, robots, canonical URLs, and Product structured data.
P2
- Add reviews, coupons, email confirmations, support/contact workflow, and richer video learning progress.

## Next tasks
1. Supply Supabase project configuration and admin email/role policy.
2. Add Razorpay test configuration and complete verified payment flow in development.
3. Connect storage upload/signing and replace demo visual assets with owner assets.
4. Continue TypeScript migration once backend/auth contracts stabilize.
