# Durby — Architecture

> AI Operations Manager for restaurants. Every feature must serve at least one of the
> five core principles below — features that serve none are rejected or reshaped.

## Five core principles

1. **Teach the AI** — the Restaurant Profile teaches the AI how the business operates.
2. **Collect Facts** — integrations and conversations collect operational facts.
3. **Reason Centrally** — only the Decision Engine reasons. Agents gather facts but never
   make independent decisions.
4. **Human Approval** — every operational change requires manager approval.
   *AI recommends. Managers decide.*
5. **Learn Continuously** — business notes, availability, operational history and feedback
   improve future recommendations.

```
Restaurant Profile        →  AI learns how the restaurant operates       (principle 1)
Communication Layer       →  AI collects facts from employees & systems  (principle 2)
Decision Engine           →  All agents reason using shared context      (principle 3)
Manager                   →  Reviews and approves AI recommendations     (principle 4)
        ↓
Notes / history / feedback flow back into future recommendations         (principle 5)
```

Where each principle lives in code today:

| Principle | Implementation |
|-----------|----------------|
| 1 Teach | Restaurant Profile → `RestaurantContextService.getFacts()` (§2) |
| 2 Collect | Demand-signal providers (§4), Availability Assistant (§5), CSV/data-center imports |
| 3 Reason | `DecisionEngineService` — the only place LLM reasoning produces recommendations (§1) |
| 4 Approve | Proposal/draft tables + explicit approve endpoints (§7, "Manager approval pattern") |
| 5 Learn | `RestaurantFacts.aiNotes` (reserved), availability history, forecast-vs-actual comparison in the Analytics agent — the least built-out principle; new features should extend it |

## Stack

| Layer     | Tech |
|-----------|------|
| Frontend  | Next.js 15 (App Router), React 19, TailwindCSS, TanStack Query v5, Clerk auth |
| Backend   | NestJS 10 (port 4000), modular, `PrismaModule` is `@Global()` |
| Data      | Prisma 5.22 → PostgreSQL (Neon) |
| AI        | OpenAI + Anthropic behind a provider abstraction; all output Zod-validated |

Frontend talks to the backend via `src/lib/api-client.ts` (`NEXT_PUBLIC_API_URL`, default
`http://localhost:4000`). The active restaurant comes from `useRestaurantId()`
(`NEXT_PUBLIC_DEMO_RESTAURANT_ID`). Every request attaches a Clerk session token
(`api-client.ts` reads `window.Clerk.session.getToken()`); the backend verifies it (§0).

---

## 0. Platform Hardening (pre-Phase-5 infrastructure)

Five pieces of infrastructure, built **before** any employee-facing workflow, so Phase 5
(AI Employee Assistant) and Phase 6 (Employee Communication) can be added without
refactoring the foundation. None of these ship a workflow — they are the seams a workflow
plugs into.

### 0.1 Backend tenancy and authorization

| File | Role |
|------|------|
| `backend/src/common/auth/tenancy.guard.ts` | `TenancyGuard` — global `APP_GUARD` |
| `backend/src/common/auth/auth.module.ts` | Registers the guard globally (`@Global()`) |
| `backend/src/common/auth/principal.ts` | `Principal` param decorator, `@Roles()`, `@Public()` |

Every request is authenticated and tenancy-checked before it reaches a controller:

1. **Authentication** — verifies the Clerk-issued RS256 JWT against the issuer's JWKS
   (`CLERK_ISSUER` env var, cached `createRemoteJWKSet`). `AUTH_MODE=required` rejects
   unauthenticated requests; `AUTH_MODE=permissive` (dev default) grants a synthetic
   `OWNER` principal scoped to the requested restaurant when no token is sent — logged
   loudly once per process. **An invalid/expired token is always a hard 401**, even in
   permissive mode — permissive only covers the *absence* of a token, never a bad one.
2. **Tenancy** — resolves `User.restaurantId` from the token's `sub` (Clerk id) and
   rejects any request whose `:restaurantId` route param doesn't match. A valid token for
   restaurant A can never read or write restaurant B.
3. **Roles** — `@Roles("OWNER", "MANAGER")` on a handler restricts by the resolved
   membership role. Applied today to profile PATCH, availability request/approve, and
   schedule generate/approve — the state-changing manager actions.

`@Public()` opts a route out entirely (health checks). No route is tenancy-checked
without a `:restaurantId` param in its path — routes without one skip the membership
check by construction, so any new controller must nest under
`restaurants/:restaurantId/...` to get tenancy for free.

### 0.2 Availability model: recurring pattern + dated overrides

The old model (`unique(employeeId, weekday)`) could not represent "just this Friday I
can't work" — Phase 5's first real employee sentence. Fixed with a second table and a
resolver, not a bigger schema:

| File | Role |
|------|------|
| `backend/prisma/schema.prisma` | `EmployeeAvailability` (recurring) + `AvailabilityOverride` (dated, `unique(employeeId, date)`) |
| `backend/src/modules/availability/availability-resolver.ts` | Pure `resolveAvailability(date, weekday, patterns, overrides)` |

**Resolution rule: a dated override always wins over the weekly pattern for that
weekday.** Every consumer that needs "is this employee available on date X" — the
schedule engine's `canFill()` today, any future consumer tomorrow — must call
`resolveAvailability()` rather than reading `EmployeeAvailability` directly, or a dated
exception becomes invisible to code that predates it.

The availability parser (`availability-parser.service.ts`) now emits an optional `date`
per entry: present → one-off exception ("next Friday"), absent → recurring pattern
("every Monday", "I usually work..."). On approval, `AvailabilityService.reviewProposal()`
routes to `AvailabilityOverride` when `date` is set, `EmployeeAvailability` otherwise —
verified live: a message with a mixed recurring + one-off statement produced two
proposals, approved independently, written to the correct table each time.

### 0.3 Generic Conversation and Message models

`AvailabilityMessage` was availability-specific — the wrong foundation for Phase 5/6,
which need many intents over the same channel. Replaced with a channel-agnostic pair:

| File | Role |
|------|------|
| `backend/prisma/schema.prisma` | `Conversation` (per restaurant+employee+channel, `status: OPEN\|CLOSED`) + `Message` (generic; `direction`, `channel`, `intent`, `externalId` unique, `processingStatus`) |

- `Message.externalId` is unique so webhook redelivery (WhatsApp/Twilio retry on
  timeout) is a no-op, not a duplicate write — required infrastructure before any real
  channel connects, verified live by resending an identical `externalId` and getting
  `status: "duplicate"` back with zero new rows.
- `Message.intent` starts `null` and is set by the Intent Router (§0.4) after
  classification — a message's row never has to guess what workflow it belongs to before
  one is assigned.
- `AvailabilityProposal.messageId` now references `Message`, nullable with `onDelete:
  SetNull` — proposals never hard-couple to a conversation.
- The frontend contract was preserved: `AvailabilityService.getInbox()` maps the generic
  `processingStatus`/`processingError` columns back to the `parseStatus`/`parseError`
  shape the existing `/availability` page already expects. No frontend changes were
  needed for this migration.

**Never couple a domain outcome to a Conversation/Message by hard foreign key** — only
nullable references, as `AvailabilityProposal` demonstrates. A future shift-swap or
sick-day workflow follows the same shape.

### 0.4 Intent Router

The seam Phase 5 build on top of. A workflow is one class; adding it never touches the
router, the classifier, or the storage model.

| File | Role |
|------|------|
| `backend/src/ai/intent/intent-handler.interface.ts` | `IIntentHandler` contract + `INTENT_HANDLERS` DI token |
| `backend/src/ai/intent/intent-classifier.service.ts` | LLM classification, Zod-validated, confidence-thresholded |
| `backend/src/ai/intent/intent-router.service.ts` | `IntentRouterService.route()` — the one generic entry point |
| `backend/src/ai/intent/handlers/availability-intent.handler.ts` | The only registered handler today — wraps the existing availability parser, doesn't reimplement it |
| `backend/src/modules/conversations/conversations.controller.ts` | `POST /restaurants/:id/conversations/inbound` — generic inbound endpoint |

```
inbound message → Conversation/Message (idempotent on externalId)
                → IntentClassifierService (known intents from registered handlers)
                → matching IIntentHandler.handle(), or → escalate to a manager Alert
```

- The classifier is given the **live list of registered handlers' descriptions** — it
  never hardcodes intent names, so a new handler is automatically classifiable the moment
  it's registered.
- Confidence below 0.5, or an intent with no registered handler, routes to
  **`escalate()`**: the message is marked `intent: "unknown"`, and a
  `EMPLOYEE_MESSAGE_ESCALATION` `Alert` is created — reusing the existing manager alert
  feed rather than inventing a new inbox. Verified live: an off-topic message
  ("reset my payroll password") produced `status: "escalated"` and a visible Alert; a
  genuine availability message produced `status: "handled"` and dispatched correctly.
- Adding workflow N+1: implement `IIntentHandler`, add one line to the factory in
  `intent.module.ts`. `IntentRouterService` and `IntentClassifierService` need zero
  changes — mirrors the `DEMAND_SIGNAL_PROVIDERS` / `COMMUNICATION_PROVIDERS` pattern.

### 0.5 Persona-scoped Restaurant Context

`RestaurantContextService.getFacts()` returns everything, which was fine while only
managers (via the Decision Engine) consumed it. An employee-facing assistant must never
see wages, margins, or targets — enforced at the **service boundary**, not in a prompt
instruction (a prompt is not a security boundary).

```ts
getScopedFacts(restaurantId, "manager"): Promise<RestaurantFacts>          // unchanged, full block
getScopedFacts(restaurantId, "employee"): Promise<EmployeeFacingFacts>     // RestaurantFacts minus businessGoals
```

`EmployeeFacingFacts = Omit<RestaurantFacts, "businessGoals">` — the `businessGoals` key
(currency, `targetFoodCostPct`, `avgTicketSize`) is **absent**, not nulled, from the
employee payload. Verified at runtime: manager persona returns
`businessGoals: { currency, targetFoodCostPct: 30, avgTicketSize: 38 }`; employee persona
has no `businessGoals` key at all while retaining `openingHours`, `capacity`,
`serviceModel`, `peakHours`, and `staffingConstraints` (headcount floors are operational,
not wage data).

All seven existing Decision Engine agents call `getFacts()` (equivalent to
`getScopedFacts(id, "manager")`) — **unchanged behavior**. No employee-facing consumer
exists yet; `getScopedFacts(id, "employee")` is ready for Phase 5 to call.

---

## 1. Four-layer rule (never violate)

```
integrations → unified data store (Prisma) → AI Decision Engine → agents
```

- **Agents gather facts only. They never reason.** Reasoning lives in the Decision Engine
  (`backend/src/ai/engine/decision-engine.service.ts`).
- Every AI recommendation MUST carry an `explanation` — enforced by Zod in the engine.
  Malformed model output fails loudly; it never reaches the database or the manager.
- LLM calls go through the provider abstraction
  (`backend/src/ai/providers/llm-provider.interface.ts`) — never call OpenAI/Anthropic
  directly from a module.

---

## 2. Restaurant Context (shared business context)

**The single access point for business facts.** No agent, module, or service may query the
`Restaurant` table directly for profile data.

```
Restaurant Context  →  Facts  →  Decision Engine
```

### Files

| File | Role |
|------|------|
| `backend/src/modules/restaurants/restaurant-context.service.ts` | `RestaurantContextService` — the access point |
| `backend/src/modules/restaurants/restaurant-profile.types.ts`   | Zod schemas for profile input (`patchProfileSchema`, `openingHoursSchema`) |
| `backend/src/modules/restaurants/restaurant-profile.service.ts` | GET/PATCH profile; calls `context.invalidate()` after every PATCH |
| `backend/src/modules/restaurants/restaurant-profile.controller.ts` | `GET/PATCH /restaurants/:id/profile` |
| `src/hooks/use-restaurant-profile.ts` | Frontend hooks |
| `src/app/restaurant-profile/page.tsx` | Profile form (Basics, Opening Hours, Capacity, Service Model, Staffing Minimums, Financial Targets) |

### Two read shapes

- **`getContext(restaurantId)` → `RestaurantBusinessContext`** — typed, domain-grouped
  (`identity`, `location`, `hours`, `capacity`, `serviceModel`, `staffing`, `financial`).
  For services that need structured access (e.g. the forecast capacity constraints).
- **`getFacts(restaurantId)` → `RestaurantFacts`** — the **canonical fact block** every AI
  agent attaches to the Decision Engine **unchanged** under `facts.restaurantFacts`:

```ts
RestaurantFacts {
  identity            // name, cuisineType, city, timezone
  openingHours        // { mon: [{open,close}], … } — empty array = closed that weekday
  closureExceptions   // [{ date: "YYYY-MM-DD", reason }]
  capacity            // seatsIndoor, seatsTerrace, totalSeats, terraceWeatherDependent
  serviceModel        // dineIn, takeaway, delivery (≥1 always true — enforced on PATCH)
  peakHours           // typicalPeakHour: 19 + source string (heuristic until POS hourly data)
  businessGoals       // currency, targetFoodCostPct, avgTicketSize
  staffingConstraints // minKitchenStaff, minServiceStaff, minBarStaff
  aiNotes             // string[] — empty; populated by the communication layer later
}
```

**Rules for new code:**
1. A new agent injects `RestaurantContextService`, calls `getFacts()`, and attaches the
   block as-is. Never reshape it into a bespoke vocabulary.
2. A new business fact is added to `getFacts()` **once**; every agent sees it on the next
   run with zero agent changes.
3. Caching: 60 s in-memory per restaurant, so 7 agents in one review cycle = 1 DB read.
   `RestaurantProfileService.patchProfile()` invalidates, so saved profile edits are
   visible to agents immediately.

All seven agents (`backend/src/ai/agents/`: inventory, scheduling, compliance, finance,
analytics, marketing, supplier) consume the identical block. Engine rules reference facts
by path, e.g. *"Each shift must meet the minimum staffing floors in
`restaurantFacts.staffingConstraints`"*.

---

## 3. Communication Layer

**Status: seam only — no concrete provider ships yet.** WhatsApp/SMS/email plug in later
without touching consumers.

### Files

| File | Role |
|------|------|
| `backend/src/modules/communication/communication-provider.interface.ts` | Contract + DI token |
| `backend/src/modules/communication/communication.module.ts` | Registers `COMMUNICATION_PROVIDERS` (currently `[]`) |

### Contract

```ts
interface ICommunicationProvider {
  readonly channel: "whatsapp" | "sms" | "email" | "in_app";
  isEnabled(): boolean;                     // API keys present?
  sendMessage(msg: OutboundMessage): Promise<{ messageId: string }>;
}
// OutboundMessage / InboundMessage carry a conversationId to correlate replies.
```

### Adding a real provider (e.g. WhatsApp)

1. Implement `ICommunicationProvider` (e.g. `whatsapp.provider.ts` using Twilio/Meta).
2. Register it in `communication.module.ts`:
   ```ts
   { provide: COMMUNICATION_PROVIDERS,
     useFactory: (wa: WhatsAppProvider) => [wa].filter(p => p.isEnabled()),
     inject: [WhatsAppProvider] }
   ```
3. Add an inbound webhook controller that resolves the sender to an employee and calls
   `AvailabilityService.submitReply()` (or a future message router).

Consumers (`AvailabilityService`) already select the first enabled provider and fall back
to the `"simulated"` channel — no consumer changes needed. This mirrors the
`DEMAND_SIGNAL_PROVIDERS` pattern in the forecast module.

---

## 4. Forecast Pipeline

**Guest demand is the primary forecast; revenue is always derived/secondary.**

```
historical sales (28d weekday averages)          baseline forecast
        │                                               │
demand-signal providers (weather, holiday, event)       ▼
        └──────────────► AdjusterService  ─────►  signal-adjusted forecast
                                                        │
Restaurant Profile (via RestaurantContextService)       ▼
        └──────────► CapacityConstraintService ─► final forecast
```

**Signals say what guests WANT to do; the profile says what the restaurant CAN serve.
Signals apply first, constraints second.**

### Files

| File | Role |
|------|------|
| `backend/src/modules/forecast/forecast.service.ts` | Orchestrator; `getAdjustedSummary()` runs the whole chain |
| `backend/src/modules/forecast/providers/demand-signal.interface.ts` | `IDemandSignalProvider` + `DEMAND_SIGNAL_PROVIDERS` token |
| `backend/src/modules/forecast/providers/weather.provider.ts` | OpenWeatherMap (`OPENWEATHER_API_KEY`) |
| `backend/src/modules/forecast/providers/holiday.provider.ts` | German public holidays (bundesland-aware) |
| `backend/src/modules/forecast/providers/event.provider.ts` | PredictHQ, events within ~10 km (`PREDICTHQ_API_KEY`) |
| `backend/src/modules/forecast/adjustment/adjuster.service.ts` | Sums signal `adjustmentPct`, damps staff, clamps up/down |
| `backend/src/modules/forecast/adjustment/capacity-constraint.service.ts` | Profile physics (Phase 3) |
| `backend/src/modules/forecast/adjustment/multipliers.ts` | Clamp/damping constants |
| `src/hooks/use-forecast.ts`, `src/app/forecast/page.tsx` | Frontend (grouped bars: reservations vs walk-ins) |

### Capacity constraints (applied per day, after signals)

1. **Closed day** — the date is in `closureExceptions`, or the weekday has no
   `openingHours` window (only when hours are configured at all) → prediction `0`,
   factor `🚪 Closed — <reason>`, `totalAdjustmentPct: -100`.
2. **Terrace rule** — a rain factor is present **and** `seatsTerrace > 0`:
   `Heavy Rain` → 100 % terrace loss, `Rain Likely` → 60 %. Reduction = terrace share of
   total seats × loss. Factor `⛱️ Terrace unavailable (rain) — capacity 120 → 80 seats`.
   Staff reduction is dampened ×0.5 (indoor service still needs a minimum crew).
3. Unconfigured profile (no hours, no seats) → constraints skip entirely; an empty profile
   never zeroes a forecast.

Factor `category` union is `"weather" | "holiday" | "event" | "capacity"` — mirrored in
`src/hooks/use-forecast.ts` and `use-operational-dashboard.ts`.

### Adding a demand-signal provider

Implement `IDemandSignalProvider`, add the class to the `DEMAND_SIGNAL_PROVIDERS` factory
in `forecast.module.ts`. `ForecastService` needs no changes.

### Key endpoints

```
GET  /restaurants/:id/forecast/summary            baseline (revenue/guests/inventory/staff)
GET  /restaurants/:id/forecast/adjusted           full chain (signals + capacity)
POST /restaurants/:id/forecast/adjusted/generate  compute + persist REVENUE_ADJUSTED rows
```

---

## 4a. ML Forecast Engine (training data → Python ML platform)

The rule-based pipeline above (§4) coexists with a machine-learning path that
*learns* from historical outcomes rather than only applying hand-authored
rules. Four pieces, built in order:

**Training dataset** (`backend/src/modules/forecast/ml/training-dataset.service.ts`)
— one `ForecastTrainingRow` per (restaurant, date, `featureVersion`) with a
real, non-fabricated feature set. Target: `walkInGuests = max(0, totalGuests
- reservationGuests)`. Every feature without a real data source (historical
weather, marketing campaigns) is null/false and flagged in a `dataQuality`
JSON column rather than silently zero-filled — a model must know the
difference between "no rain" and "we don't know." Feature versioning
(`feature-version.ts`) means the same date can have multiple rows, one per
version of the feature set, coexisting forever — a model trained on
`featureVersion: 1` stays reproducible even after `featureVersion: 2` adds
new columns. **A data-quality bugfix backfills the affected version's rows
in place (`buildDataset(..., featureVersion: N)`); a new feature always
bumps the version.**

**Forecast Evaluation + Reconciliation** (`forecast-evaluation.service.ts`,
`forecast-reconciliation.service.ts`) — records every rule-based prediction
alongside a reconciliation layer that floors the total-guest forecast at
confirmed reservation guests (since total can never physically be lower than
what's already booked) without modifying `ForecastService` itself. This is
the audit trail Phase 3's model comparison and continuous retraining read
from.

**Python ML Platform** (`ml-service/`) — a separate FastAPI service that
owns the complete model lifecycle: training, validation, prediction,
evaluation, persistence, and feature importance. See
[`ml-service/CONTRACT.md`](../ml-service/CONTRACT.md) for the full versioned
wire contract. Key properties:

- **NestJS never sees an algorithm.** `MlServiceClientService`
  (`ml-service-client.service.ts`) is the only stable surface — it exposes
  `train()`, `predict()`, `evaluate()`, `getModel()`, `listModels()` and
  nothing algorithm-specific. Inside the Python service, XGBoost/LightGBM/
  CatBoost are interchangeable implementations of one `ModelAdapter`
  interface (`ml-service/app/models/base.py`) — adding algorithm #4 means
  writing one adapter and registering it in `factory.py`.
- **The Python service never sees a restaurant.** Every request carries an
  opaque `task` label (`"walk_ins"` today) and generic `features: Record<string,
  ...>` dicts — `training-row-mapper.ts` is the ONE place that decides which
  `ForecastTrainingRow` columns become model inputs. This is also where
  target leakage is prevented: `totalGuests` is excluded from features
  because `walkInGuests = totalGuests - reservationGuests` would let a model
  trivially reconstruct the target by subtraction rather than learn anything.
- **Chronological train/validation split, never shuffled.** Rows arrive
  pre-ordered by date; the last `test_size` fraction is held out as-is. A
  random shuffle would leak future rows into training for what is
  fundamentally a forecasting problem, producing dishonestly optimistic
  validation metrics.
- **Missing values stay missing all the way into the model.** No imputation
  — XGBoost/LightGBM/CatBoost all natively learn an optimal split direction
  for NaN, so a null feature is never silently treated as zero, consistent
  with the training dataset's `dataQuality` philosophy.
- **Categorical columns need an explicit hint from the caller.**
  `TrainRequest.categorical_features` — a column that happens to be entirely
  null within a given training range (e.g. `weatherCategory` before any
  `WeatherSnapshot` existed) gives the service no data to infer type from;
  NestJS knows its own domain and must say so rather than the service
  guessing.
- **All requested algorithms train and report metrics; only the winner's
  artifact persists.** `candidates` in the train response is the full
  comparison — this is what "compare models over time" means concretely.
- **`MlModel`** (Prisma) is NestJS's own record of which model is active per
  (restaurantId, task) — the Python service is stateless about that; NestJS
  owns "which model do we currently use," the Python service owns "how do
  we train/run one."

### Phase 4 — Production Prediction API

`MlModelService.predictWalkIns()` works for **genuine future dates**, not
just dates already present in the training dataset — a real production
requirement, since a training row structurally requires a `Sale` record
(ground truth) that a future day cannot have yet.
`TrainingDatasetService.buildLiveFeatures()` shares the exact same per-day
computation as the persisted training pipeline (`computeRow()`, extracted
from `buildDataset()` during this phase) but never gates on a `Sale` row
existing — every other feature (lag/rolling on *past* actuals, reservations
already booked, weather/holiday/event signals, restaurant profile, scheduled
staff) is fully computable ahead of time. `totalGuests`/`walkInGuests` are
computed as unused placeholders internally (excluded from ML features
regardless, per the target-leakage rule above).

Per-prediction explainability (`top_factors` on `PredictionOut`, §CONTRACT.md)
uses SHAP (`shap.TreeExplainer`, works uniformly across all three
algorithms) — a **local** explanation of this one prediction, distinct from
`feature_importance`'s **global** ranking at training time. Added as an
additive contract field, no version bump.

Every served prediction is logged as a side effect into `ForecastEvaluation`
(`mlPrediction`, `mlModelId`, `mlConfidenceScore`,
`mlPredictionIntervalLow/High`, `mlTopFactors`) — merging into the *same* row
the rule-based reconciliation layer already writes for that date, so rule
and ML predictions for a given day sit side by side for direct comparison.
Logging is best-effort: `ForecastEvaluationService.recordPrediction()`
requires `forDate` to be today-or-future and within the rule engine's
forecast horizon, so a request spanning dates outside that horizon still
returns every prediction but silently skips logging for those (`skippedLogging`
in the response).

### Phase 5 — Prediction logging, evaluation, and controlled continuous learning

Logging (above) and evaluation were **not** built as new infrastructure —
`ForecastEvaluation.mlPrediction`/`mlError`/`mlAbsoluteError`/`mlPercentageError`
already existed from the reconciliation-layer work before Phase 3 shipped a
model to populate them. `reconcileActuals()` and `getAccuracySummary()`
needed no changes; Phase 5 wired real data through them and verified the
loop end-to-end (rule MAE vs ML MAE, computed from the same reconciled rows).

**Retraining readiness is a signal, never an action**
(`retraining-readiness.service.ts`). `GET .../ml/models/retraining-readiness`
checks two independent things against the active model and returns a
recommendation — it never calls `/train` itself:
1. **New data volume** — count of `ForecastTrainingRow` rows (at the active
   model's `featureVersion`) dated after the model's `trainedAt`. Default
   threshold: 14 new labeled days.
2. **Accuracy drift** — live MAE from `ForecastEvaluation` rows reconciled
   *since* training, compared against the model's own training-time
   validation MAE (stored in `MlModel.metrics`). Only trusted once at least
   10 reconciled samples exist since training; flags when live MAE is ≥25%
   worse.

`shouldRetrain` and `reasons[]` are informational. Retraining always requires
an explicit `POST /ml/models/train` call — automatic retraining is a
deliberate non-goal until a human (or a future, explicitly-approved job)
decides to act on the signal.

### Phase 6 — Multi-Restaurant Intelligence

Two new model classes, related by lineage:

- **`MlGlobalModel`** (Prisma) — a base model trained on a pooled dataset
  spanning MULTIPLE restaurants. Not tied to any one restaurant (no
  `restaurantId` FK). "Anonymized" means what it has meant since Phase 1:
  `training-row-mapper.ts` already excludes `restaurantId` from every
  feature payload, so pooling many restaurants' rows is safe by
  construction — Phase 6 adds no new redaction step, it relies on that
  existing guarantee.
- **`MlModel.baseGlobalModelId`** — set when a restaurant's active model was
  produced by *fine-tuning* a global model on that restaurant's own data
  (`MlModelService.fineTuneForRestaurant()`), rather than training fresh.
  Full lineage is queryable: `MlGlobalModel` (cross-restaurant, anonymized)
  → `MlModel` (one restaurant's specialization of it).

**`GlobalMlModelService.trainGlobalModel()`** pools `ForecastTrainingRow`s
from every restaurant with at least 20 rows at the target `featureVersion`,
and refuses to train below `MIN_RESTAURANTS_FOR_GLOBAL_MODEL` (3) —
verified live: training with only 1 qualifying restaurant returns a 400,
training with 3 (two synthetic + the demo restaurant, 285 pooled rows)
succeeds and records `restaurantsIncluded: 3`. This floor is sized for
demonstrating the mechanism, not a privacy guarantee — raise it substantially
before any real multi-tenant deployment. Endpoint is deliberately NOT
restaurant-scoped (`POST /ml/global-models/train`, no `:restaurantId`) since
this is a cross-tenant, platform-level operation; `@Roles("OWNER")` is a
stopgap floor, not a real platform-admin control (no such role exists yet).

**Fine-tuning** (`ml-service/app/models/*_adapter.py`'s `fine_tune()`) uses
each library's native continued-training support — `xgb_model=` for
XGBoost, `init_model=` for LightGBM and CatBoost — verified empirically
(not assumed) to genuinely continue from the base model's learned state:
a toy A/B test showed a fine-tuned prediction landing meaningfully between
the base model's output and a fresh fit on the new data alone, for all
three libraries. Live verification: 3 restaurants fine-tuned from the same
global model, each producing a distinct specialized MAE (0.68–7.04,
reflecting how close each restaurant's real pattern was to the synthetic
test data used), all three referencing the identical `baseGlobalModelId`.
`MlModelService.fineTuneForRestaurant()` needs only 10 rows (vs 20 for a
fresh train) — most valuable for a restaurant with too little history to
train a good model from scratch.

**Bug found during live verification, not hypothetical**: predicting from a
fine-tuned XGBoost model crashed — `shap.TreeExplainer` builds its own
internal `DMatrix` without `enable_categorical=True`, which XGBoost rejects
outright whenever any feature has `category` dtype (`season`,
`weatherCategory`). Undetected until Phase 6 because every model SHAP had
explained so far happened to be CatBoost (the winner in Phase 3/4 testing);
the bug was latent in `XGBoostAdapter.explain()` all along. Fixed by
constructing the `DMatrix` explicitly with `enable_categorical=True` before
handing it to SHAP.

### Pre-Phase-7 fix: a genuine target leak, not just a live-inference artifact

Found while starting Phase 7 (before writing any explanation code):
`capacityUtilizationPct = totalGuests/seatingCapacity` and
`staffToGuestRatio = staffScheduledCount/totalGuests` are both linear
rescalings of `totalGuests` (= walkInGuests + reservationGuests) — the exact
column already excluded from ML features in Phase 3 for leaking the target,
just smuggled back in one step removed via a Phase 2 engineered feature.
`totalGuests` defaults to a `0` placeholder for any live/future prediction
(no `Sale` row exists yet), so `capacityUtilizationPct` was **always exactly
0** for every real forecast — confirmed by inspecting logged
`ForecastEvaluation.mlTopFactors`: it was the #1 SHAP factor, same
"decrease" direction, on every prediction served since Phase 4 shipped. The
model had learned "near-zero utilization → low guests" from the leak during
training, then that fake 0 dragged down every live prediction regardless of
the actual day.

Fixed by adding both columns to `EXCLUDED_COLUMNS` in
`training-row-mapper.ts` (they remain in `ForecastTrainingRow` for
reporting/analytics — only excluded as ML **input** features). Every
existing model (the global model + all 3 fine-tuned restaurant models) was
retrained, since all had been trained on the leak. MAE went **up** after the
fix (global 5.49→6.17; per-restaurant 0.68–7.04 → 1.93–12.42) — the expected
and honest result of removing an artifact that was artificially inflating
apparent accuracy, not a regression. This is why Phase 7's explanations had
to wait for this fix: building manager-facing "Why?" text on top of a known-
poisoned SHAP signal would have fabricated a capacity story on every single
forecast.

### Phase 7 — Manager-Friendly Explainable AI

Translates the SHAP `top_factors` Phase 4 already computes into sentences a
manager can read without knowing what SHAP or gradient boosting is, plus
deterministic operational recommendations. Explicitly reuses rather than
recalculates: `BusinessExplanationService` never calls the ML service and
never sees an algorithm name — it consumes `top_factors`, the feature values
that produced them (already in hand from `TrainingDatasetService.
buildLiveFeatures()`), and `RestaurantContextService.getFacts()`.

**Deterministic by construction** — every strategy is a pure function of
(feature value, SHAP direction) → sentence, via a lookup table
(`walk-ins-explanation.strategy.ts`'s `FEATURE_EXPLAINERS`). No LLM call, no
randomness: the same prediction always produces the same explanation.

**Reusable across future tasks** (revenue, inventory, staffing, supplier) —
one `TaskExplanationStrategy` interface, one DI registry
(`EXPLANATION_STRATEGIES`, keyed by task) mirroring the `ModelAdapter`/
`IIntentHandler` pattern already used elsewhere. Adding a task's explanation
strategy is one new file plus one registration line in
`ml-forecast.module.ts`; `BusinessExplanationService` itself never changes.
A missing strategy for a task fails soft (empty explanation, not a broken
prediction).

**Business reasons** — each SHAP factor is tagged with a "concept" (day,
weather, reservations, events, holiday, trend); only the highest-ranked
(first-seen, since `top_factors` already arrives SHAP-sorted) phrase per
concept survives, capped at 4 total, so the model never says both "Friday"
and "Weekend" for the same underlying signal. One supplementary rule adds
"No major local events are expected today" when `localEventCount` is 0 and
the events concept isn't already covered — informational context the model
saw as an input even when it didn't rank in the top SHAP factors.

**Recommended actions** — classifies demand as busy/quiet/typical by
comparing the prediction against `rollingWalkIns7Avg` (±20% threshold), then
picks a deterministic action set. The peak-hour staffing window
(`Schedule one additional server between 18:00–20:30`) is derived directly
from `RestaurantFacts.peakHours.typicalPeakHour` — verified to reproduce the
Phase 7 spec's example output almost verbatim from an equivalent input.
Confidence below 0.6 always appends a caveat action regardless of demand
level.

### Contract versioning policy

`/v1` changes only by adding a new version (`/v2`) alongside it — never by
mutating a v1 field's meaning or removing one in place. A field may be
*added* to a v1 response without a version bump (additive, backward
compatible); anything else requires a new version, on both the Python router
(`app/api/v1/` → new `app/api/v2/`) and the NestJS client types
(`ml-service-client.types.ts`) together, in the same change.

### Key endpoints

```
POST /restaurants/:id/ml/training-dataset/build           generate/rebuild ForecastTrainingRow
GET  /restaurants/:id/ml/training-dataset                  read it (defaults to current featureVersion)
POST /restaurants/:id/ml/training-dataset/capture-weather   record today's actual weather

POST /restaurants/:id/ml/forecast-evaluations/record        snapshot a rule prediction for a future date
POST /restaurants/:id/ml/forecast-evaluations/reconcile      backfill actuals + error once Sale data lands
GET  /restaurants/:id/ml/forecast-evaluations/accuracy-summary  aggregate MAE/RMSE/MAPE

POST /restaurants/:id/ml/models/train                       train+compare XGBoost/LightGBM/CatBoost, keep best
POST /restaurants/:id/ml/models/predict                      predict walk-ins for a date range (future dates included), logs into ForecastEvaluation, includes businessReasons + recommendedActions per prediction (Phase 7)
POST /restaurants/:id/ml/models/:modelId/evaluate            score a specific model against known actuals
GET  /restaurants/:id/ml/models/active                       the model predict() currently uses
GET  /restaurants/:id/ml/models/retraining-readiness         signal only — never triggers training
POST /restaurants/:id/ml/models/fine-tune                    specialize the active global model to this restaurant

POST /ml/global-models/train                                pool anonymized data across restaurants, train a base model
GET  /ml/global-models/active                                the base model fine-tuning currently starts from
GET  /ml/global-models                                       list all global models (any task)
```

---

## 5. Availability Assistant (Phase 2, model hardened in §0.2/§0.3)

Employees state availability in natural language; AI parses it into structured proposals;
**the manager approves before anything touches scheduling data**.

```
manager clicks "Request from all staff"
  → OUT Message per active employee (own/first-OPEN Conversation per employee+channel)

employee replies in natural language (in-app simulator today; webhook later)
  → IN Message (direct via /availability/inbound, OR generically via /conversations/inbound
     → Intent Router → AvailabilityIntentHandler, see §0.4)
  → AvailabilityParserService (LLM, Zod-validated, emits optional dated `entries[].date`)
  → AvailabilityProposal rows, status PENDING (weekday-only, or dated one-off)

manager approves a proposal
  → dated proposal:   upsert AvailabilityOverride (unique employeeId+date)
  → weekday proposal: upsert EmployeeAvailability (unique employeeId+weekday)
  → the schedule engine resolves both via availability-resolver.ts (§0.2)
manager rejects → status REJECTED, nothing else changes
```

### Files

| File | Role |
|------|------|
| `backend/prisma/schema.prisma` | `Conversation`, `Message` (§0.3), `EmployeeAvailability`, `AvailabilityOverride` (§0.2), `AvailabilityProposal` |
| `backend/src/ai/parsers/availability-parser.service.ts` | NL → `{ entries[], summary, confidence }`, Zod-validated; each entry optionally dated |
| `backend/src/modules/availability/availability-resolver.ts` | Pure resolver: override wins over pattern for a given date |
| `backend/src/modules/availability/availability.service.ts` | Request / inbound / inbox / review / current; `parseAndCreateProposals()` is the reusable core also called by the Intent Router's handler |
| `backend/src/modules/availability/availability.controller.ts` | REST endpoints (role-restricted: request/review require OWNER/MANAGER) |
| `src/hooks/use-availability.ts` | Frontend hooks (includes `date`/overrides in types) |
| `src/app/availability/page.tsx` | Inbox UI, one-off badge on dated proposals, approved grid with override rows |

### Parser conventions

- `weekday`: **0 = Monday … 6 = Sunday** (matches `EmployeeAvailability`).
- `date` (optional, `YYYY-MM-DD`): present → one-off exception for that calendar date;
  absent → recurring weekly pattern. The prompt is given "today" to resolve relative
  dates ("next Friday").
- "lunch" ≈ 11:00–16:00, "dinner/evenings" ≈ 17:00–23:00, "mornings" ≈ 08:00–13:00.
- "can't work X" → `available: false`, `00:00–23:59`, note carries the reason.
- Days not mentioned get **no entry** (silence ≠ unavailable).
- Parse failure → `Message.processingStatus: "FAILED"` with `processingError`; no
  proposals are created. (`getInbox()` maps this back to `parseStatus`/`parseError` for
  the existing frontend contract.)

### Endpoints

```
POST  /restaurants/:id/availability/request                  broadcast ask to active staff        [OWNER|MANAGER]
POST  /restaurants/:id/availability/inbound                  { employeeId, message } → parse directly
GET   /restaurants/:id/availability/inbox                    messages + proposals + pendingCount
PATCH /restaurants/:id/availability/proposals/:proposalId    { action: "approve" | "reject" }       [OWNER|MANAGER]
GET   /restaurants/:id/availability/current                  approved grid: patterns + upcoming overrides
POST  /restaurants/:id/conversations/inbound                 { employeeId, message, channel?, externalId? }
                                                               → Intent Router → handled | escalated | duplicate
```

---

## 6. Schedule Generation (Phase 4)

`backend/src/modules/scheduling/schedule-engine.service.ts` consumes, per generation:

| Input | Source |
|-------|--------|
| Opening hours / closed days / staffing floors / peak hour | `RestaurantContextService.getFacts()` |
| Guest/staff forecast (already capacity-constrained) | `ForecastService.getAdjustedSummary()` |
| Availability | `resolveAvailability()` (§0.2) — `EmployeeAvailability` pattern + `AvailabilityOverride` dated exceptions, override always wins |
| Contracts | `Employee.contractType`, `weeklyContractedHours`, `maxWeeklyHrs` |
| Leave | `EmployeeLeave` (approved only) |
| Skills/roles | `Employee.role`, `secondaryRoles`, `skills` |

Flow: LLM proposes per-day `{ role, startTime, endTime, count }` requirements (falls back
to a deterministic tier table without an API key) → a **deterministic** assigner fills
slots respecting availability windows, leave, hour budgets, and no double-booking →
`WeeklySchedule` saved as `DRAFT` → manager approves via
`POST /restaurants/:id/scheduling/schedule/:scheduleId/approve`.

Hard profile constraints (enforced in code, not just prompted):
- Closed days get **zero** requirements even if the LLM emits some; a warning is surfaced.
- Staffing minimums are floors in the fallback table (`max(tierCount, minX)`).
- Prep roles start 2 h before that date's actual open; unfilled slots become warnings, not
  silent gaps.

---

## 7. Cross-cutting conventions

- **Zod at every AI boundary**: engine recommendations, availability parsing, profile PATCH.
  Time strings validate against `^([01]\d|2[0-3]):[0-5]\d$` — shape-only regexes let
  `25:99` through; don't regress this.
- **Weekday indices**: workforce code uses **0=Mon…6=Sun**; JS `getUTCDay()` is 0=Sun.
  Convert explicitly (see `toWeekdayIndex` in the schedule engine; `DAY_KEYS` maps in
  capacity-constraint and schedule-engine services).
- **Opening hours JSON**: `{ mon: [{open:"HH:MM", close:"HH:MM"}], … }`; empty array =
  closed; multiple windows per day allowed (e.g. lunch + dinner split).
- **Manager approval pattern**: AI writes to a *proposal/draft* table (`AvailabilityProposal`,
  `WeeklySchedule DRAFT`, alerts); a human action promotes it to operational data. New
  automation features must follow this shape.
- **Frontend**: `AppShell` requires `title`; its `<main>` already has `px-6 py-6` — pages
  must not add their own outer padding. Data fetching via TanStack Query hooks in
  `src/hooks/`, one hook file per domain.
- **NestJS module graph** (acyclic): `RestaurantsModule` is imported by `AiModule`,
  `ForecastModule`, and `SchedulingModule`; `AiModule` + `CommunicationModule` are imported
  by `AvailabilityModule`; `AvailabilityModule` is imported by `IntentModule`, which is
  imported by `ConversationsModule`. `AuthModule` is `@Global()` and imports nothing
  domain-specific. `RestaurantsModule` imports nothing from these — keep it that way to
  avoid cycles.
- **Tenancy is opt-out, not opt-in**: `TenancyGuard` runs globally; a new controller gets
  tenancy checking for free by nesting under `restaurants/:restaurantId/...`. Only use
  `@Public()` for routes with no restaurant context at all.
- **New employee-facing consumer of business context**: call
  `RestaurantContextService.getScopedFacts(id, "employee")`, never `getFacts()` or
  `getContext()` directly — the manager-only fields must never reach an employee payload.
- **New employee workflow**: implement `IIntentHandler` (§0.4), register it in
  `intent.module.ts`'s factory. Do not add a new controller endpoint per workflow unless
  the workflow needs its own management UI (as Availability's inbox does) — the generic
  `/conversations/inbound` endpoint is the single inbound path for anything routed by
  intent.

---

## 8. Recommended first employee workflow: Shift-Swap Requests

With the five hardening items in place, the next workflow should be chosen for how much
of the new foundation it forces into real use — not just how valuable it is standalone.
**Shift-Swap Requests** is the recommendation, ahead of sick-day reporting or an
open-ended Q&A assistant, for these reasons:

1. **It exercises every new seam at once.** A swap request needs: an authenticated
   employee principal (§0.1) — this would be the first *employee*-initiated write, not a
   manager one, so it's the first real test of tenancy beyond managers; a dated
   availability check via `resolveAvailability()` (§0.2, "can the other person actually
   cover this specific date"); a `Conversation`/`Message` thread that naturally spans
   multiple turns — request → counter-offer → confirmation (§0.3); a dedicated
   `IIntentHandler` proving the router handles a *second* intent, not just availability
   (§0.4); and `getScopedFacts(id, "employee")` so the assistant can tell an employee
   "you're already at 38 of your 40 contracted hours" without exposing wage or margin data
   (§0.5).
2. **It reuses, rather than invents, domain logic.** The scheduling module already has
   `reassignShift()` and hour/role eligibility checks (`canFill()`) built for the manager
   drag-and-drop UI. The swap workflow is a thin employee-initiated wrapper around
   existing shift-reassignment logic plus a manager-approval step — not a new subsystem.
3. **It has a natural, low-risk approval boundary.** A swap proposal is inherently a
   *proposal* (principle 4) — two employees agreeing doesn't move a shift; a manager
   still approves, reusing the exact proposal/approve shape `AvailabilityProposal`
   established. There's no version of this workflow that tempts skipping human approval.
4. **It's bounded.** Unlike a general Q&A assistant (unbounded scope, hard to know when
   "done") or full sick-day handling (touches leave, compliance, and same-day
   re-scheduling under time pressure), a swap request has a clear start and end state:
   proposed → countered/accepted → manager-approved → shift reassigned.

**Suggested shape**, not to be built yet: `ShiftSwapProposal` (proposer, target shift,
optional counter-employee, status) sitting alongside `AvailabilityProposal` in the same
"proposal → approve" family; a `ShiftSwapIntentHandler` that reads the requester's
upcoming shifts via existing scheduling queries and the target employee's resolved
availability; and reuse of `scheduleService.reassignShift()` on manager approval rather
than a new assignment path.

---

## 9. WhatsApp Communication Channel (live, supersedes §3's "seam only" status)

§3 above describes the Communication Layer as a seam with no provider registered. That has
since shipped: `CommunicationModule` registers `WhatsappProvider` as the sole entry in
`COMMUNICATION_PROVIDERS`, and it is the official, only channel employees use to submit
availability today (the in-app simulator from §5 remains available for testing only). Full
detail lives in `backend/docs/whatsapp-integration.md` — summarized here.

**Single shared number, multi-tenant by identity.** One Meta WhatsApp Business Account/
number serves every restaurant on the platform — a deliberate architectural choice, not a
placeholder. Meta's webhook payload carries no restaurant identifier, so
`WhatsappWebhookService` resolves the sender's phone number against `Employee.phoneNumber`
(globally unique) and takes `restaurantId` from that record — server-authoritative, never
trusted from the request. Every downstream row (`Conversation`, `Message`,
`AvailabilityProposal`) carries `restaurantId`, and every query filters by it.

```
Employee (WhatsApp) → Meta Cloud API → POST /webhooks/whatsapp (signature-verified)
  → BullMQ inbound queue (retry w/ backoff) → WhatsappInboundProcessor
  → WhatsappWebhookService (phone → Employee → restaurantId)
  → ConversationEngineService (same entry point every channel uses — persistence,
     externalId dedup, conversation lifecycle)
  → IntentRouterService (§0.4) → handler → reply queued back out
```

**`ConversationEngineService`** (`backend/src/ai/conversation-engine/`) was extracted as a
generic layer so WhatsApp and the in-app simulator share identical conversation-state
handling rather than WhatsApp reimplementing it. It owns conversation lifecycle
(start/continue/complete/timeout), externalId-based dedup, and a deterministic-first
parsing pass before falling back to the LLM parser, plus a clarification flow for
medium-confidence replies.

**Reliability, fixed during live hardening (not hypothetical):**
- Webhook acks `200` only once every item is durably queued or processed — an earlier
  version acked before processing, which meant a DB/Redis outage after the ack silently
  dropped the message with Meta never retrying it.
- Duplicate-webhook and duplicate-`OPEN`-conversation races were found and fixed (Meta
  redelivers on timeout; two near-simultaneous webhook deliveries could otherwise create
  two conversations or two `Message` rows for the same `externalId`).
- `Message.externalId` unique constraint makes redelivery a no-op, verified live.

**Branding**: every message identifies the platform first, restaurant second — "I'm Roof
Operations AI, assisting {restaurant}" — a fixed, deliberately-worded template
(`availability_request_v2`, Meta-approved), not ad hoc text per restaurant.

**Explicitly out of scope for the current phase** (documented, not an oversight): schedule
notifications, automatic schedule publishing, and a general-purpose employee assistant
(shift swaps, leave requests, hour balance) — the architecture (`ConversationEngineService`,
Intent Router) is built to support these without a redesign, per §8's Shift-Swap analysis,
but none are implemented yet.

**Dev/test mode**: a documented local-testing path exists (`backend/docs/whatsapp-
integration.md` §6) for exercising the pipeline without live Meta credentials.

### 9.1 Automation-readiness framework (frozen)

`RestaurantAutomationSettings`, per-proposal/per-schedule confidence scores, and an
`AuditLog` were built into the availability/scheduling pipeline as forward-looking
infrastructure — but every "auto" decision hook (`autoApproveAvailability`,
`autoGenerateSchedule`, `autoPublishSchedule`, `autoNotifyEmployees`) is a **no-op today**.
The 6-step manual workflow (AI collects availability → proposals PENDING → manager
approves/rejects → manager clicks Generate Schedule → AI drafts → manager
approves/publishes) is unchanged by any of this scaffolding.

**Frozen as of 2026-07-08** — see [[feedback_automation_freeze]]. No new automation
features, and no flipping a hook from no-op to active, without an explicit user request.
Current focus is user-facing functionality, integrations, AI quality, and polish instead.

---

## 10. Inventory, Menu, Recipe, Order & Purchase-Recommendation system

Built after §0–9 above (which predate this arc and cover workforce/forecast/availability/
communication). This is the second major subsystem: it teaches the AI what the restaurant
*sells and stocks*, the same way §2 teaches it how the restaurant *operates*. Same
four-layer rule (§1) and manager-approval pattern (§7) apply throughout — nothing here
bypasses them.

```
Menu (what's sold)  ──RecipeVersion/RecipeLine──▶  Product (ingredients)  ◀──InvoiceLine── Invoice (what's bought)
        │                                                  │
        ▼                                                  ▼
   Order/OrderLineItem                              InventoryItem.quantityOnHand
   (CSV import, line-item grain)                     (cache — never write directly)
        │                                                  ▲
        └──ConsumptionService, on completion──────▶ StockMovement (append-only ledger)
                                                             │
                                                             ▼
                                            InventoryAgentService (burn rate, Phase 5/6)
                                                             │
                                                             ▼
                                        PurchaseRecommendation (PENDING → manager APPROVED/DISMISSED)
                                                             ▲
                                        Forecast (§4) demand multiplier, Phase 6
```

### 10.1 Menu (Phase 2)

| File | Role |
|------|------|
| `backend/src/modules/menu/menu.service.ts`, `menu.controller.ts`, `menu.module.ts` | `MenuCategory`/`MenuItem` CRUD, status lifecycle (`MenuItemStatus`) |
| `backend/src/modules/menu/menu-extraction.service.ts` | AI photo extraction — OpenAI vision (`OpenAiProvider.completeWithImage()`), image only, PDF not supported |
| `src/app/menu/page.tsx`, `src/hooks/use-menu.ts` | Menu management page, AI-extraction review/edit flow, nav entry |

Extracted items land as drafts (`MenuItemSourceType: AI_EXTRACTED`) for manager review
before becoming live menu items — same proposal/approve shape as §0.2/§5, applied to a new
domain.

### 10.2 Recipe bridge (Phase 3)

| File | Role |
|------|------|
| `backend/src/modules/menu/recipe.service.ts`, `recipe.controller.ts` | `RecipeVersion`/`RecipeLine` — effective-dated, mirrors `EmployeeRoleAssignment`'s pattern |
| `src/app/menu/page.tsx` (`RecipeEditor`) | Ingredient mapping UI, cost/margin calc per menu item |

`RecipeVersion` is the only link between `MenuItem` and `Product`. Effective-dating means a
recipe change (e.g. a supplier substitution) never rewrites history — past orders still
resolve to the recipe that was active when they were placed. No inventory deduction yet at
this phase (deliberately deferred to §10.3).

### 10.3 Orders & Consumption engine (Phase 4)

| File | Role |
|------|------|
| `backend/src/modules/data-center/parsers/orders.parser.ts` | CSV import, line-item grain, groups by `externalOrderId`, idempotent re-import |
| `backend/src/modules/orders/consumption.service.ts` | `consumeForOrder()` / `reverseConsumptionForLine()` — deducts ingredient quantities per `RecipeLine` on order completion |
| `backend/src/modules/orders/order.service.ts`, `order.controller.ts`, `orders.module.ts` | `Order`/`OrderLineItem` CRUD, `OrderStatus`/`OrderLineItemStatus` |

Deduction happens **on completion**, not on order creation, and reverses cleanly on
cancellation. Modifiers are recorded on the line item but not separately consumed (approved
design decision, see [[project_phase4_consumption_design]]). Exact-unit-match only — no
unit-conversion inference. `OrderLineItem.menuItemId` and `RecipeLine`→`Product` links are
nullable throughout: an unmatched product/menu item degrades gracefully (order still
imports, consumption for that line just doesn't fire) rather than failing the whole import.

### 10.4 Inventory core (Phase 0/1)

| File | Role |
|------|------|
| `backend/src/modules/inventory/stock-movement.service.ts` | `recordStockMovement`/`recordStockCount`/`recordWaste` — the only writers of `StockMovement` |
| `backend/src/modules/inventory/inventory.service.ts`, `inventory.controller.ts` | Overview, products, manual counts, waste entry, purchase recommendations |
| `backend/src/modules/invoices/invoice-extraction.service.ts`, `invoice.service.ts`, `invoice.controller.ts` | AI invoice extraction (OpenAI vision, image only), manual review flow (`InvoiceReviewStatus`) |
| `src/app/inventory/page.tsx`, `src/hooks/use-inventory.ts`, `use-invoices.ts` | Inventory Overview, Invoice Review Panel, Quick Action forms |

`StockMovement` is an **append-only ledger** — `InventoryItem.quantityOnHand` is a derived
cache, never written directly by any code path outside the ledger recompute. Every
quantity change (invoice receipt, manual count, waste, sale consumption) is one
`StockMovement` row with a `StockMovementType`, so the full history of *why* stock is what
it is stays queryable, not just the current number.

### 10.5 Purchase recommendations (Phase 5) + Forecast integration (Phase 6)

| File | Role |
|------|------|
| `backend/src/ai/agents/inventory-agent.service.ts` | `computeBurnRateStats()`, `needsReorder()`, `suggestQuantity()`, `computeDemandMultiplier()` (Phase 6), `generatePurchaseRecommendations()` |
| `src/app/inventory/page.tsx` (`PurchaseRecommendationsSection`) | Refresh, reasoning text, confidence badge, Approve/Dismiss |

14-day trailing burn rate from `StockMovement` (`SALE_CONSUMPTION` + `WASTE`) vs.
`Supplier.leadTimeDays` (first real consumer of that Phase-0 field) drives the reorder
trigger; falls back to the static `reorderPoint` when no burn-rate history or known supplier
exists yet. One Decision Engine call per candidate product produces the `reasoning` text
(deterministic math decides quantity; the LLM only explains). `PurchaseRecommendation`
mirrors `AvailabilityProposal`'s PENDING/APPROVED/DISMISSED lifecycle exactly — approving
only records a decision, per [[feedback_automation_freeze]]; nothing here ever places an
order automatically.

Phase 6 adds a `computeDemandMultiplier()` factor — average forecasted revenue (§4,
`ForecastService.getAdjustedSummary()`) vs. average historical `Sale.revenue` over the same
14-day window, clamped to `[0.6, 1.8]` — into both the trigger (`needsReorder`) and the
suggested quantity, closing the `Order → Forecast` relationship edge from the original
design. See [[project_phase6_status]] for the honestly-documented verification gap: the
mechanism is correct and live-tested at the unit level, but no live scenario was observed
crossing the "meaningfully different" (>1.1) threshold that changes actual trigger
behavior — root-caused, not glossed over.

### 10.6 Conventions specific to this subsystem

- **AI extraction never fabricates**: illegible fields land as `null`, not a guessed value;
  an unidentifiable supplier becomes `"Unknown Supplier (needs review)"`, never silently
  dropped or invented.
- **Every quantity mutation goes through the ledger** (§10.4) — no service writes
  `InventoryItem.quantityOnHand` directly.
- **Nullable links degrade gracefully**: `InvoiceLine.productId`, `MenuItem.categoryId`,
  `OrderLineItem.menuItemId`, `RecipeLine.productId` are all nullable so an unmatched
  import row is visible and reviewable rather than rejected outright.
- **PDF upload is not supported** for either invoice or menu photo extraction (gpt-4o-mini
  Chat Completions vision doesn't accept raw PDFs) — an explicit, documented limitation,
  not a silent gap.
- Per [[feedback_dont_modify_completed_modules]]: once a phase here is marked complete, it
  is only touched for a bug or an explicit new request — new work builds forward.

---

## 11. Operations Platform v1 — checkpoint (2026-07-10)

This section is a point-in-time snapshot, requested by the user as a clean checkpoint
before the next milestone. It does not change anything above — §0–10 remain the living
reference; this section indexes and status-checks them.

### 11.1 Completed modules

| Module | Status | Section |
|---|---|---|
| Platform hardening (tenancy, availability model, Conversation/Message, Intent Router, persona-scoped context) | Done | §0 |
| Restaurant Profile / Context | Done | §2 |
| Communication layer (WhatsApp Cloud API, live) | Done | §3, §9 |
| Forecast pipeline (rule-based) | Done | §4 |
| ML Forecast Engine (7 phases: training data → prediction API → retraining signal → multi-restaurant → explainability) | Done | §4a |
| Availability Assistant | Done | §5 |
| Schedule Generation | Done | §6 |
| Automation-readiness framework | Built, then frozen (2026-07-08) — no active automation | §9.1 |
| Menu | Done (Phase 2) | §10.1 |
| Recipe bridge | Done (Phase 3) | §10.2 |
| Orders & Consumption engine | Done (Phase 4) | §10.3 |
| Inventory core (ledger, invoices, overview) | Done (Phase 0/1) | §10.4 |
| Purchase recommendations + forecast integration | Done (Phase 5/6), one verification gap documented | §10.5 |
| Analytics dashboard (KPI tiles, Executive Summary, AI Impact/Workforce, inventory gauge) | Done | frontend `src/app/analytics/page.tsx`, no dedicated backend section above — reads from `dashboard`/`analytics` modules |
| Compliance | Backend module exists (`backend/src/modules/compliance/`: monitoring, certifications, documents, tasks, reports) and has a frontend page (`/compliance`) — not covered by a dedicated architecture section above; predates this document's detailed write-ups |

### 11.2 Database architecture

Single Postgres (Neon) database via Prisma, applied with `prisma db push` (this project has
no `_prisma_migrations` tracking table — migration folders under `prisma/migrations/` are
generated with `prisma migrate diff --script` as documentation only, not the actual apply
mechanism). Current model count: **47 models**, grouped by domain:

- **Identity/tenancy**: `Restaurant`, `User`, `Employee`
- **Workforce**: `EmployeeRoleAssignment`, `EmployeeAvailability`, `AvailabilityOverride`, `AvailabilityProposal`, `EmployeeLeave`, `WeeklySchedule`, `ScheduledShift`, `RoleCoverageRule`, `Shift`
- **Communication**: `Conversation`, `Message`
- **Reservations/Sales**: `Reservation`, `Sale`
- **Menu/Recipe**: `MenuCategory`, `MenuItem`, `RecipeVersion`, `RecipeLine`
- **Orders**: `Order`, `OrderLineItem`
- **Inventory/Purchasing**: `Product`, `InventoryItem`, `Supplier`, `Invoice`, `InvoiceLine`, `PurchaseUnit`, `StockMovement`, `WasteLog`, `PurchaseRecommendation`
- **Finance**: `Expense`
- **Compliance**: `ComplianceEvent`, `EmployeeComplianceProfile`, `ComplianceDocument`, `TrainingRecord`, `EmployeeCertification`, `ComplianceTask`
- **Forecast/ML**: `Forecast`, `WeatherSnapshot`, `ForecastTrainingRow`, `ForecastEvaluation`, `MlGlobalModel`, `MlModel`
- **Platform**: `RestaurantAutomationSettings`, `AuditLog`, `Alert`, `ImportLog`, `IntegrationConfig`

Three structural patterns reused across domains: **append-only ledger** (`StockMovement`),
**effective-dated version tables** (`EmployeeRoleAssignment` → `RecipeVersion`), and
**proposal/approve lifecycle** (`AvailabilityProposal`, `WeeklySchedule DRAFT`,
`PurchaseRecommendation` PENDING/APPROVED/DISMISSED) — the concrete expression of
principle 4 ("AI recommends, managers decide") in the schema itself.

### 11.3 AI architecture

- **Decision Engine** (`DecisionEngineService.evaluate()`) is the only place LLM reasoning
  produces a recommendation — seven original agents (inventory, scheduling, compliance,
  finance, analytics, marketing, supplier) plus the newer per-domain reasoning calls
  (invoice/menu extraction, purchase-recommendation reasoning) all funnel through it or its
  provider abstraction. Every recommendation is Zod-validated; malformed output never
  reaches the database.
- **Two provider types**: text reasoning (`OpenAiProvider`/`AnthropicProvider` behind
  `LlmCompletionRequest`) and vision extraction (`OpenAiProvider.completeWithImage()`,
  OpenAI-only in this environment — `ANTHROPIC_API_KEY` is unset).
- **ML path** (§4a) is a separate, parallel forecasting mechanism (XGBoost/LightGBM/CatBoost
  via the Python `ml-service/`) — not an LLM, doesn't go through the Decision Engine, feeds
  the same `ForecastEvaluation` rows the rule-based path writes for direct comparison.
- **Intent Router + Conversation Engine** (§0.4, §9) classifies inbound messages from any
  channel (WhatsApp live, in-app simulator for testing) and dispatches to a registered
  `IIntentHandler` — currently one handler (`AvailabilityIntentHandler`) registered.
- Convention held everywhere: **never fabricate a fact the model wasn't given** — null over
  guess, explicit "needs review" placeholders, and (Phase 5) an added prompt rule after a
  live-caught bug where the LLM stated a numeric comparison the underlying facts didn't
  support.

### 11.4 Module relationships (current, verified against the original design)

```
Restaurant Profile ──facts──▶ every agent & the Decision Engine
Menu ──RecipeVersion/RecipeLine──▶ Product ◀──InvoiceLine── Invoice ◀── Supplier
Order ──ConsumptionService──▶ StockMovement ──▶ InventoryItem.quantityOnHand
StockMovement ──burn rate──▶ InventoryAgentService ──▶ PurchaseRecommendation
Forecast ──demand multiplier (Phase 6)──▶ InventoryAgentService
Availability/Schedule ◀──resolveAvailability()── EmployeeAvailability + AvailabilityOverride
WhatsApp/Conversation/Message ──Intent Router──▶ AvailabilityIntentHandler ──▶ AvailabilityProposal
```

All relationship edges from the original Section 5 architecture audit are connected
**except live POS webhook ingestion** — orders currently arrive via CSV import
(`data-center` module), not a real-time POS integration. This is the one item genuinely
blocked on the user (vendor choice + credentials), not a build gap.

### 11.5 Frozen modules

- **Automation-readiness framework** — [[feedback_automation_freeze]] (2026-07-08): built
  (settings, confidence scoring, audit log, no-op decision hooks) then frozen; no active
  automation, no new automation features, until the user explicitly asks to resume.
- **Completed Inventory/Menu/Recipe/Consumption modules** —
  [[feedback_dont_modify_completed_modules]] (2026-07-10): touched only for a bug or an
  explicit new request, per standing instruction.

### 11.6 Known technical debt / honest gaps

- **Confirmed reservations don't move the forecast.** Found while investigating Phase 6:
  `reservationsByDate` is computed in `forecast.service.ts` but never passed into
  `adjuster.adjust()` — a pre-existing gap, not introduced during the Inventory/Menu arc.
- **Phase 6 demand multiplier**: correct by code inspection and live-tested at the
  computation level, but never observed live crossing the threshold that changes actual
  trigger/reasoning output. See [[project_phase6_status]].
- **Dev environment**: the Neon dev database has intermittently lost the seed `Restaurant`
  row between operations this session — worked around via upsert-restore each time, not
  root-caused (believed environmental/sandbox-specific, not an application bug).
- **No live POS integration** — CSV import only; needs a user vendor decision.
- **WhatsApp is single-number/global**, by deliberate design (§9) — not a gap, but worth
  noting as a constraint: a future enterprise customer needing a dedicated number requires
  extending `WhatsappConfigService` to resolve per-restaurant, not a schema change today.
- **Compliance module** has no dedicated architecture section in this document (§0–10) —
  it exists, has a frontend page, and backend services (monitoring, certifications,
  documents, tasks, reports), but its AI-workflow depth relative to the other six agents
  hasn't been re-audited as part of this checkpoint.
- **WhatsApp employee-facing scope is intentionally narrow today** (§9): availability
  collection only. Schedule notifications, auto-publishing, and a general assistant
  (shift swaps, leave, hour balance) are designed-for but not built.

### 11.7 Remaining roadmap / suggested priorities for next milestone

In rough priority order, per the roadmap threads already open in memory and this document:

1. **Shift-Swap Requests** (§8) — already designed, deliberately not built, chosen to
   exercise every §0 hardening seam at once; the communication channel it needs (§9) is
   now live, so this is no longer blocked on infrastructure.
2. **Live POS integration** — the one blocked-on-user item; needs vendor + credentials
   before it can even be designed concretely.
3. **Compliance module audit** — bring it to the same documented-architecture standard as
   the other subsystems, confirm its AI workflow depth.
4. **Principle 5 ("Learn Continuously")** — flagged in the principles table (top of this
   document) as "the least built-out principle" from the start of the project;
   `RestaurantFacts.aiNotes` is reserved but not yet populated by any workflow.
5. **Reservations → forecast wiring** (§11.6) — a small, contained fix (pass
   `reservationsByDate` into `adjuster.adjust()`) that would also unblock fuller live
   verification of the Phase 6 demand multiplier.

This section is a snapshot only — no code was modified or redesigned to produce it.
