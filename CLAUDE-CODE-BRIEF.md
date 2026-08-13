# Claude Code — NML CRM build brief

Put these four files in the repo root before starting:

- `NML-CRM-PLAN.md` — product spec, roles, state machine, page-by-page scope
- `nml-crm-schema.sql` — the database, already applied to Supabase
- `NML-CRM-DESIGN-SYSTEM.html` — tokens, components and ten built screens
- `NML-CRM-DESIGN-INVENTORY.md` — the full list of screens, panels and buttons

Then paste everything below as the first message in a fresh session.

---

Build the NML CRM. Read all four files in the repo root before writing any code.

**Stack:** Next.js App Router + TypeScript, Tailwind, shadcn/ui, TanStack Table v8, Supabase JS v2, Vercel.

## Where the truth lives

- **Database:** `nml-crm-schema.sql` is already applied. It is the source of truth for the data model. Do not change it without telling me first.
- **Visual design:** `NML-CRM-DESIGN-SYSTEM.html` is the source of truth for every colour, radius, blur, font and component. Open it and read the `<style>` block — the tokens and component classes are real CSS, not a description of CSS. Port them into `app/globals.css` and the Tailwind theme. Do not invent styling, do not substitute shadcn defaults, do not approximate the glass values.
- **Scope and behaviour:** `NML-CRM-PLAN.md` and `NML-CRM-DESIGN-INVENTORY.md`.

If the plan and the design system disagree on a visual detail, the design system wins. If the plan and the schema disagree on data, the schema wins.

## The visual language in one paragraph

A gradient wallpaper sits behind everything. The whole app floats on it as one translucent blurred pane (`--g-win`, `backdrop-filter: var(--blur)`). Panels nest inside at `--g-panel`, rows and cards inside those at `--g-card`. Depth comes from how much white each layer holds — never shadows, never grey borders. Every control is a fully rounded pill. Table rows are floating cards separated by gaps, not lines. NML red appears only in the logo mark and the active nav icon; primary buttons are ink (`--ink`). Colour appears only where state changed or attention is needed.

Only two things carry real `backdrop-filter`: the app window and any drawer or modal. Everything inside uses flat `rgba(255,255,255,x)` — blurring fifty table rows costs GPU for nothing.

## Non-negotiable rules

1. Three Supabase clients, strictly separated: `lib/supabase/client.ts` (browser, anon), `lib/supabase/server.ts` (RSC + route handlers, anon + cookies), `lib/supabase/admin.ts` (service role, `import 'server-only'` on line one). The admin client is used by exactly two things: the lead import handler and the public form handler. Nothing else.
2. Generate types with `supabase gen types typescript` into `lib/database.types.ts`. No `any`.
3. Every list is server-side paginated and server-side filtered. The merchants table must stay usable at 50k rows. No `select('*')` without a range.
4. Mutations are Server Actions with Zod validation. Optimistic UI with a rollback toast.
5. **The stage machine is enforced by database triggers.** When a trigger raises an exception, surface its message verbatim in the toast. Do not swallow it. Do not duplicate the check client-side — the DB message is the user-facing copy.
6. `/f/[token]` imports no authenticated client and renders no app chrome. Arabic RTL by default with an English toggle. Rate-limited by token and IP.
7. All layout uses logical properties (`ms-`, `me-`, `ps-`, `pe-`) so the RTL flip costs nothing.
8. Every table, board and list needs a real empty state naming the next action, and skeleton rows — never spinners.
9. Sentence case everywhere. Buttons carry their count: "Import 1,842 leads", not "Submit".

## Behaviour that is easy to get wrong

- **Nothing can be dragged into CTA done** on the pipeline board. That stage is reached only by the merchant submitting the public form. Cards already there aren't draggable either — they carry an "Assign AM" action.
- **Forward drags advance one stage at a time.** Backward drags are unrestricted.
- **Prospecting results for merchants already in the pipeline have disabled checkboxes.** Lost merchants show the date and reason and get a "revive" action that reopens the existing record — never a new one.
- **Import "fill in blanks only" never overwrites an existing value.** Dedupe matches in order: Salla ID, then normalized store URL, then normalized phone, and the UI names which one matched.
- **The product review drawer pages up and down through the queue with the keyboard and auto-advances after a decision.** There are thousands of products; clicking tiles one at a time is a full day of work.
- **Merchant fields that the public form fills read "Awaiting form" until submission**, never blank.
- **The onboarding tab on a merchant record is visibly locked before CTA**, not hidden.
- **A blocked onboarding step requires a reason** — the DB has a check constraint, so surface the failure properly.

## Onboarding is two steps

Welcome call (SLA 1 day) and Stocks and prices received (SLA 5 days). The stock list and the product costs are the same step — do not split them.

Because there are only two steps, progress is 0 / 50 / 100. **Build the step queue view, not the board view.** A progress-ring board across three buckets is pretending to track detail that doesn't exist. Keep the ring on the merchant record only.

## Pricing and margin

Cost is agreed once per merchant during onboarding step 2 and stored as `merchants.default_margin_pct`. Every product inherits it. `products.nml_cost` is an optional per-product override. Use the `v_product_margin` view for anything showing cost or margin — it handles the fallback and returns `cost_is_override` so the UI can show when a product was priced individually.

Margin is the shelving criterion, so it appears next to the Shelve button in the product drawer.

## Build order

Complete and self-check each step before moving on. Run `npm run build` and fix every type error at each checkpoint.

1. Scaffold, Tailwind, shadcn, Supabase clients, generated types, design tokens from the HTML file.
2. Auth (magic link), profile bootstrap, role-gated middleware, app shell: role-filtered nav, top bar, ⌘K search, notifications.
3. `/merchants` table and `/merchants/[id]` with all seven tabs and the stage rail. **This is the core — get it right before anything else.**
4. `/leads` pool, the four-step import wizard, the bulk assign panel (manual, round-robin, by city, with per-specialist open counts and the `max_open_merchants` capacity flag).
5. Form templates, send-form action, `/f/[token]`, submission route handler. Verify the whole cascade fires: stage → `cta_completed`, products → `ready_for_shelf`, onboarding instantiated, notifications sent.
6. `/products` with five status tabs, the review drawer with keyboard paging, bulk actions, CSV export.
7. `/onboarding` step queue and the activate flow.
8. `/pipeline` kanban, `/tasks`, notifications.
9. `/prospecting`, with the data source isolated behind `lib/sources/salla.ts`.
10. `/reports` — funnel with drop-off, specialist performance, shelf throughput. All CSV-exportable.
11. `/settings` — users and roles, teams, form template builder, onboarding template editor, lookups.

Write `scripts/seed.ts` generating 200 merchants across every stage with activities, products and onboarding state before step 10, so reports have something real to render.

## Screens not yet designed

Modals, form builder, reports, settings, tasks, auth states, and the account manager and catalog ops dashboards have no mockup. Build them from the components in the design system HTML — do not invent a second visual language for them.

## Working style

Collect any genuine ambiguities and ask them all at once at the start. After that, don't ask me to confirm between steps — give me a one-line status per completed step and keep going.
