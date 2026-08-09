# Durby

An AI operations manager for independent restaurants. It ingests real
operational data (sales, shifts, inventory, invoices, reservations,
compliance records), reasons over it with domain-specific AI agents, and
turns that reasoning into concrete, explainable actions a manager can
approve — demand forecasts, staff schedules, purchase recommendations,
compliance flags, and a grounded chat assistant.

The product pipeline is: **Profile → Communication → Decision Engine →
Manager approval.** Every feature exists to serve one of those stages —
either building a better picture of the restaurant, getting information
in/out of it, reasoning over it, or putting a human in the loop before
anything happens.

## Architecture

Three services:

- **`/` (this directory)** — Next.js 15 frontend (App Router, React 19,
  TypeScript, Tailwind, Recharts, TanStack Query, Clerk for auth).
- **`backend/`** — NestJS API (Prisma/PostgreSQL, BullMQ/ioredis for async
  jobs, Zod-validated AI Decision Engine, OpenAI/Anthropic providers). See
  [backend/README.md](backend/README.md).
- **`ml-service/`** — Python FastAPI service owning the ML forecasting
  model lifecycle (train/predict/evaluate/explain), called by the NestJS
  backend over HTTP. See [ml-service/README.md](ml-service/README.md) and
  [ml-service/CONTRACT.md](ml-service/CONTRACT.md) for the wire contract.

Auth is multi-tenant via Clerk: a `User` can hold `RestaurantMember`
memberships on one or more `Restaurant`s. `GET /me` returns the signed-in
user plus their memberships; the frontend's `RestaurantProvider` currently
defaults to the first membership returned — **there is no restaurant
switcher UI yet**, so an account with multiple restaurants can only view
whichever one it joined/created first.

## What's built

A public marketing site lives at `/` (`src/app/page.tsx` +
`src/components/marketing/*`), fully separate from the authenticated app,
which is mounted under `/dashboard`.

**Frontend pages** (`src/app/dashboard/*`): Dashboard, AI Chat, Forecast,
Data Center (CSV import), Menu, Inventory, Scheduling, Compliance,
Analytics, Alerts, Integrations, Restaurant Profile, Settings.

**Backend modules** (`backend/src/modules/*`): alerts, analytics,
automation, availability, chat, communication, compliance, conversations,
dashboard, data-center, finance, forecast, integrations, inventory,
invoices, marketing, menu, orders, restaurants, scheduling, supplier,
whatsapp, workforce.

**AI agents** (`backend/src/ai/agents/*`): analytics, compliance, finance,
inventory, marketing, scheduling, supplier, plus a **Vision Agent**
(photo-based shelf/delivery/waste analysis) and a **Knowledge Agent**
(answers grounded in the restaurant's own data via retrieval tools).
Domain agents gather facts only and hand them to a shared Decision Engine
(agents never reason freestyle) — recommendations always come back with a
problem/risk/recommendation/confidence/explanation shape, and get
persisted as `Alert` rows so the Alerts page and dashboard reflect every
agent's output without bespoke wiring.

**Core capabilities:**
- **Data Center** — async CSV import pipeline (BullMQ, falls back to
  inline processing if Redis is unreachable) covering sales, shifts,
  employees, inventory, suppliers, expenses, reservations, orders, and
  compliance documents/contracts/training/certifications. Each import
  triggers the relevant AI agents automatically.
- **Menu / Inventory / Recipes / Consumption** — Menu items link to
  Inventory products via versioned recipes (`RecipeVersion`/`RecipeLine`);
  completing an order deducts ingredient stock through a shared
  `StockMovement` ledger, with cancellation reversal and idempotent
  consumption on CSV order import.
- **Purchase recommendations** — burn-rate + forecast-adjusted reorder
  suggestions per product, generated from the Inventory agent.
- **AI Scheduling Engine** — generates a weekly `WeeklySchedule` of
  `ScheduledShift`s respecting employee availability, leave, max weekly
  hours, and role coverage rules.
- **Workforce configuration** — restaurant-owned lookup tables
  (departments, roles, skills) managed from the Restaurant Profile page,
  used by the scheduling engine and AI Chat.
- **Compliance checks** — German ArbZG rules (weekly hour caps, break
  minimums by shift length, 11h minimum rest between shifts) computed in
  code and handed to the Decision Engine to prioritize and explain.
- **Forecasting** — a Python ML service (with SHAP-based
  per-prediction explainability) predicts demand; predictions are
  automatically persisted as `Forecast` rows on first view of a date
  window so Analytics can later compare forecast vs. actual once the date
  passes and real sales are recorded.
- **AI Chat Orchestrator** — a tool-calling assistant (`backend/src/modules/chat`,
  `backend/src/ai/tools`) that reaches into live restaurant data through a
  registry of per-module tools (dashboard, alerts, compliance,
  availability, inventory, invoices, menu/recipes, forecast, scheduling,
  restaurants, integrations) rather than answering from a static prompt.
  Responses stream token-by-token over SSE. Side-effecting actions go
  through a confirmation-card mechanism (`PendingAction`) — the AI
  proposes, the manager approves, nothing is written silently. Users can
  also attach photos or documents; an attachment classifier routes them
  to the Vision Agent (photos) or Knowledge Agent (documents/questions
  grounded in the restaurant's own records).
- **Vision Agent** — photo-based inventory intelligence: shelf-health
  reads, multi-photo inventory walkthroughs, delivery verification
  (invoice vs. photo), and waste documentation. Each observation is
  persisted (`VisionObservation`) and combined with manual counts and
  consumption data by an `InventoryIntelligenceService` that produces a
  single confidence-scored stock estimate rather than trusting any one
  signal blindly.
- **POS integrations** — a pluggable `IIntegrationProvider` architecture
  (`backend/src/modules/integrations`) with a first real implementation
  for LieferSoft: encrypted credential storage, token refresh, webhook
  registration/signature verification for real-time order push, and a
  shared `SalesAggregationService` that rolls POS orders up into the
  same `Sale` records the forecasting and analytics pipeline already
  reads — no separate code path for POS-sourced vs. CSV-sourced sales.
- **WhatsApp integration** — Cloud API webhook lets employees reply with
  their availability via WhatsApp; parsed deterministically and written
  back into the same availability model the scheduling engine reads.
- **Automation framework** — confidence-scored decision hooks and an
  audit log exist as infrastructure, but the framework is currently
  frozen: no new automation behavior is being added while the team
  focuses on UX/integration/AI-quality work.

A key internal detail worth knowing if you're extending scheduling,
compliance, analytics, or ML training code: shifts live in two separate
tables for historical reasons — `Shift` (legacy, written only by CSV
import) and `ScheduledShift` (the AI Scheduling Engine's actual output).
Any code that needs "what shifts exist in this date range" should go
through `backend/src/modules/scheduling/shift-source.util.ts`
(`findNormalizedShifts`), which merges both sources — reading only one
table silently misses the other.

## Running locally

Requires Node 18+, PostgreSQL, and a Clerk application (for auth). Redis
is optional — the Data Center import pipeline falls back to synchronous
inline processing if it can't connect.

```bash
# 1. Backend
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL, Clerk keys, AI provider key
npx prisma generate
npx prisma migrate dev
npm run start:dev         # http://localhost:4000

# 2. ML service (optional — forecasting degrades gracefully without it)
cd ml-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd ..
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_API_URL, Clerk keys
npm run dev                  # http://localhost:3000
```

On first sign-in, a new account is prompted to create its first
restaurant (onboarding flow) — there's no seed data required to get
started with a real account, though `backend/README.md` documents a
`npm run seed` script for generating a demo restaurant with synthetic
sales history if you want data to look at immediately.

### Key environment variables

Frontend (`.env.local`):
- `NEXT_PUBLIC_API_URL` — backend base URL
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` — Clerk auth
- `NEXT_PUBLIC_DEMO_RESTAURANT_ID` — legacy single-tenant override, not
  needed for normal multi-tenant use; only relevant for the older demo
  seed flow

Backend (`backend/.env`):
- `DATABASE_URL` — PostgreSQL connection string
- `CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY` — must match the frontend's
  Clerk application
- `AUTH_MODE` — `required` (production) or `permissive` (local dev
  fallback for unauthenticated requests)
- `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` — at least one AI provider
- `REDIS_URL` — optional, enables async CSV import processing
- `ML_SERVICE_URL`, `ML_SERVICE_API_KEY` — forecasting service
- `WHATSAPP_*` — Cloud API credentials, only needed for the WhatsApp
  availability workflow

See each `.env.example` file for the full, current list.

## Known limitations

- **No restaurant switcher UI.** Multi-restaurant accounts only see their
  first membership.
- **AI Chat can still occasionally answer beyond its grounding data** on
  edge-case questions, despite the system prompt instructing it not to —
  a known reliability gap, not yet fully closed.
- **Forecast vs. Actual Revenue / Forecast Accuracy widgets need real
  time to pass.** Forecasts are only ever generated for future dates;
  these comparisons populate once a forecasted date arrives and actual
  sales are recorded against it, not immediately after setup.
- **AI Impact / Business Impact metrics count *resolved* alerts**, not
  just alert volume — a restaurant with plenty of AI-generated
  recommendations will still show zeros here until a manager actually
  resolves some of them.
- **Redis is best-effort.** In environments where Redis is unreachable
  over the expected connection method, the Data Center import pipeline
  falls back to inline synchronous processing — imports still work, just
  without background-job progress tracking.
- **The Automation framework is intentionally frozen** — the scoring/
  audit-log infrastructure exists but isn't being extended with new
  automated behaviors right now.

## Repository layout

```
src/                  Next.js frontend
backend/              NestJS API + Prisma schema
ml-service/           Python FastAPI forecasting service
backend/prisma/       Database schema + migrations
```
