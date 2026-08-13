# NML CRM — Design Inventory

Every screen, sub-view, panel, modal, drawer, state and button. Tick as we design each one.

Counts: **15 route groups · 47 views/panels · 38 modals & drawers · 28 shared components**

---

## A. Shell — built once, appears everywhere

### A1. Left navigation
- [ ] Expanded (240px) / collapsed (64px) states
- [ ] NML logo → links to `/`
- [ ] Items: Dashboard · Leads · Merchants · Pipeline · Onboarding · Products · Prospecting · Tasks · Reports · Settings
- [ ] Badge counters on Leads (unassigned), Tasks (overdue), Products (ready for shelf)
- [ ] Items hidden per role (specialist sees no Settings, catalog_ops sees no Leads)
- [ ] Active item indicator
- **Buttons:** collapse/expand toggle · each nav item

### A2. Top bar
- [ ] Breadcrumb / page title
- **Buttons:** global search field (⌘K) · notification bell (with unread dot) · help `?` · user avatar menu

### A3. User avatar menu (dropdown)
- **Buttons:** My profile · Preferences (density, default view) · Sign out

### A4. Command palette (⌘K)
- [ ] Search input, grouped results (Merchants / Products / Tasks / Pages), keyboard nav, recent items, empty state
- **Buttons:** each result row · quick actions (New merchant · Import leads · New task)

### A5. Notification panel (dropdown/sheet)
- [ ] Unread + read list, relative timestamps, type icons, empty state
- **Buttons:** each notification (navigates + marks read) · Mark all read · See all

### A6. Global primitives
- [ ] Toast: success · error · warning · with Undo action
- [ ] Confirm dialog: title, body, danger variant
- [ ] Page-level error boundary
- [ ] Permission-denied inline block ("You don't have access to this merchant")

---

## B. Auth & system pages

### B1. `/login`
- [ ] Logo, email field, error text
- [ ] "Check your email" success state with the address shown
- **Buttons:** Send magic link · Use a different email

### B2. Account states
- [ ] Pending approval (profile exists, role = viewer, not yet assigned)
- [ ] Deactivated account
- **Buttons:** Sign out · Contact admin (mailto)

### B3. `/404`, `/403`
- **Buttons:** Back to dashboard

---

## C. `/` Dashboard — 4 role variants

### C1. Acquisition Specialist
- [ ] 4 stat tiles: My merchants · Due today · Forms awaiting submission · Converted this month
- [ ] "Due now" list — merchant row with store name, phone, days overdue
- [ ] My funnel bar (assigned → cta_completed)
- **Buttons per row:** Log call (inline popover) · Open merchant · Snooze to tomorrow

### C2. Acquisition Manager / Admin
- [ ] Team funnel bar with drop-off % between stages
- [ ] Specialist leaderboard table
- [ ] Unassigned leads card
- [ ] Stale merchants list (no activity > 7 days)
- **Buttons:** Assign leads → `/leads` · Nudge specialist (notification) · Open merchant · Export leaderboard

### C3. Account Manager
- [ ] Merchants in onboarding, progress rings
- [ ] Overdue steps list
- [ ] Activated this month tile
- **Buttons:** Mark step done · Open merchant · Open step queue

### C4. Catalog Ops
- [ ] Ready-for-shelf count grouped by merchant
- [ ] In-review tile · Shelved this week tile
- **Buttons:** Review products → `/products` · Open merchant

### C5. Shared
- [ ] Date-range selector (This week / This month / Last 30 days / Custom)
- [ ] Loading skeletons · empty states for each card

---

## D. `/leads` — unassigned pool

### D1. List view
- [ ] Header with live count
- [ ] Filter bar: batch · city · region · category · products-count range · source · search
- [ ] Table: checkbox · store name (+ external link icon) · owner · phone · city · category · products · batch · uploaded at
- [ ] Select-all-on-page vs select-all-matching-filter
- [ ] Empty state ("The pool is empty. Import leads to get started.")
- **Buttons:** Import leads (primary) · Clear filters · Save this view · column visibility · density toggle · pagination (prev/next/page size) · row click

### D2. Bulk action bar (appears on selection)
- **Buttons:** Assign · Add tag · Set priority · Export CSV · Delete (admin only) · Clear selection

### D3. Assign panel (slide-over)
- [ ] Mode tabs: Manual · Round-robin · By city
- [ ] Manual: specialist picker
- [ ] Round-robin: multi-select specialists + even-split preview
- [ ] By city: city → specialist mapping rows
- [ ] Preview list "X to Ahmed, Y to Sara"
- **Buttons:** Add mapping row · Remove row · Cancel · Assign N merchants

---

## E. `/leads/import` — 4-step wizard

- [ ] Stepper header showing 1–4, current + completed states

### E1. Step 1 — Upload
- [ ] Drop zone (CSV/XLSX), file chip with size, batch name field, source selector
- **Buttons:** Browse files · Remove file · Cancel · Next

### E2. Step 2 — Map columns
- [ ] Two-column mapper: file header → CRM field, auto-guessed
- [ ] Sample value preview per row
- [ ] Unmapped columns list ("kept in raw data")
- **Buttons:** Reset to auto-guess · Ignore this column · Back · Next

### E3. Step 3 — Clean & dedupe
- [ ] Summary cards: N new · N duplicates · N invalid
- [ ] Duplicate table with match reason (salla id / url / phone) and the existing merchant link
- [ ] Invalid table with reason per row
- [ ] Duplicate handling radio: Skip · Enrich empty fields only
- **Buttons:** Download invalid rows · Back · Import N leads

### E4. Step 4 — Result
- [ ] Progress bar during import, then result summary
- [ ] "Assign now?" prompt
- **Buttons:** Assign these leads (opens D3) · Undo this batch · View in pool · Import another file

---

## F. `/merchants` — master table

### F1. View tabs
- [ ] All · My merchants · Needs action · Form sent, not submitted · In onboarding · Active · On hold · Lost · [custom saved views]
- **Buttons:** each tab · Save current filters as view · Rename view · Delete view

### F2. Filter bar
- [ ] stage (multi) · acquisition owner · account manager · city · region · category · priority · source · batch · tags · date range on any stage timestamp · "no activity in X days" · search
- **Buttons:** each filter chip (opens popover) · Clear all · Save view

### F3. Table
- [ ] Columns: code · store name · owner · phone (tel + WhatsApp icon) · city · stage badge · priority · acquisition owner · account manager · products · last activity · next action (red if overdue)
- [ ] Sticky first column, sortable headers, row hover actions
- [ ] Loading skeleton rows · empty state · error state
- **Buttons:** New merchant · Export CSV · column visibility · density · pagination · sort per header · row hover: Log activity, Open

### F4. Bulk bar
- **Buttons:** Reassign acquisition owner · Assign account manager · Set priority · Add tag · Export · Clear selection

### F5. New merchant modal
- [ ] Fields: store name, store URL, owner name, phone, whatsapp, email, city, region, category, source, assign to
- [ ] Live duplicate warning while typing phone/URL
- **Buttons:** Cancel · Create · Create and add another

---

## G. `/merchants/[id]` — the record

### G1. Header block
- [ ] Store name, merchant code (mono, click to copy), store URL link, stage badge, priority selector, owner avatars (acquisition + account manager)
- **Buttons:** Log activity · Send form · Set next action · Change stage · Call (tel:) · WhatsApp (wa.me) · Copy code · overflow menu → Reassign, Put on hold, Resume, Mark lost, Delete

### G2. Stage rail (signature element)
- [ ] 8 segments, date entered + days in stage per segment, current segment highlighted, on-hold hatch overlay, lost/dead-end state
- [ ] Tooltip per segment with who moved it
- **Buttons:** segment click → filters activity timeline to that period

### G3. Tab: Overview
- [ ] Contact card, inline-editable: owner name, phone, whatsapp, email, city, region, address
- [ ] Store stats: salla store id, products count, rating, followers, category, sub-category
- [ ] Commercial: CR number, VAT number, IBAN (masked, reveal on click)
- [ ] Source + batch + created by + created at
- [ ] Tags input
- [ ] Right column: next action card, last 3 activities, open tasks, key dates
- **Buttons:** Edit / Save / Cancel per card · Add tag · Remove tag · Reveal IBAN · Copy phone · Set next action · See all activity

### G4. Tab: Activity
- [ ] Composer: type selector (call/whatsapp/email/meeting/visit/note), outcome selector (calls only), body textarea, next-action date-time
- [ ] Timeline: user activities (editable by author) vs system events (muted, not editable)
- [ ] Filter by type, load more
- **Buttons:** each type chip · Save activity · Clear · Edit own activity · Delete own activity · Filter · Load more

### G5. Tab: Products
- [ ] Table: image · name · sku · price · stock · category · status chip · added at
- [ ] Status counts strip
- **Buttons:** Import products (modal) · Add product manually · bulk: Mark ready for shelf, Move to review, Shelve, Reject · row: open drawer, edit, delete

### G6. Tab: Form
- [ ] Sent links table: template · channel · sent by · sent at · opened at · submitted at · status
- [ ] Submitted answers rendered read-only, grouped, with file thumbnails
- [ ] "No form sent yet" empty state
- **Buttons:** Send form · Copy link · Resend via WhatsApp · Revoke link · Download submission PDF · Download attachment

### G7. Tab: Onboarding
- [ ] Locked state before `cta_completed` with explanation
- [ ] Progress bar + X of Y required steps
- [ ] Step rows: title, owner, due date, status dropdown, notes, attachments, completed-by stamp
- **Buttons:** status dropdown per step · Add note · Attach file · Add custom step · Skip step (reason) · Reassign step owner · Mark merchant active (disabled + tooltip listing blockers) · Change template

### G8. Tab: Tasks
- [ ] List of tasks on this merchant, open/done grouping
- **Buttons:** New task · Complete · Edit · Delete

### G9. Tab: Files
- [ ] Upload zone, file grid with type icons, uploader + date
- **Buttons:** Upload · Download · Rename · Delete

### G10. Right rail — audit log
- [ ] Collapsed by default, chronological, field-level before/after
- **Buttons:** Expand/collapse · Load more

### G11. Modals from this page
- [ ] Change stage — target stage selector, validation errors from DB shown verbatim, reason field when required
- [ ] Mark lost — reason dropdown (from lookups) + note, warning that it exits the pipeline
- [ ] Put on hold — reason + optional resume date
- [ ] Reassign — role tabs (acquisition / account manager), user picker, reason, "notify them" checkbox
- [ ] Send form — template selector, channel selector, link preview, expiry selector, message preview for WhatsApp
- [ ] Set next action — date-time picker + quick chips (Tomorrow 10am, In 3 days, Next week)
- [ ] Import products — source tabs (CSV · Salla URL · paste), column map, dedupe preview
- [ ] New task — title, description, assignee, due, priority
- **Buttons per modal:** Cancel · primary confirm · (destructive variants in danger color)

---

## H. `/pipeline` — kanban

- [ ] 5 columns: assigned · contacted · interested · form_sent · cta_completed
- [ ] Column headers with count + WIP total
- [ ] Card: store name, city, products count, days-in-stage chip (amber >3, red >7), next action, owner avatar
- [ ] Drag and drop with server validation; illegal drop snaps back + toast with the DB reason
- [ ] My pipeline / Team pipeline toggle, specialist filter (managers)
- [ ] Empty column state
- **Buttons:** view toggle · specialist filter · card click → detail · card quick menu (Log activity, Send form, Set next action) · Collapse column

---

## I. `/onboarding`

### I1. Board view
- [ ] Progress buckets 0–25 / 26–50 / 51–75 / 76–99 / Done
- [ ] Card: store name, progress ring, account manager, days since CTA, next open step
- **Buttons:** view toggle (Board / Step queue) · account manager filter · card click · Activate (on 100% cards)

### I2. Step queue view
- [ ] Flat table of open steps across all merchants: merchant · step · owner · due · status · days open
- [ ] Filters: owner, overdue only, template step
- **Buttons:** status dropdown inline · Open merchant · Reassign owner · Bulk mark done

### I3. Step detail drawer
- [ ] Title, description, owner, due, notes, attachments, history
- **Buttons:** Mark in progress · Mark done · Mark blocked (reason) · Skip (reason) · Attach file · Save notes · Close

### I4. Activate merchant modal
- [ ] Checklist recap, confirmation copy
- **Buttons:** Cancel · Activate merchant

---

## J. `/products`

### J1. Tabs & list
- [ ] Tabs: Ready for shelf · In review · Shelved · Rejected · All (with counts)
- [ ] Grid / table toggle
- [ ] Filters: merchant · category · brand · price range · has image · date added
- [ ] Table columns: checkbox · image · name · sku · merchant (link) · category · price · sale price · stock · status · added at
- [ ] Grid card: image, name, price, merchant, status chip
- [ ] Empty state per tab
- **Buttons:** grid/table toggle · Export CSV · Clear filters · column visibility · pagination · row/card click

### J2. Bulk bar
- **Buttons:** Move to review · Shelve · Reject · Archive · Assign category · Export selected · Clear selection

### J3. Product drawer
- [ ] Image carousel, name (ar/en), sku, price/sale price, stock, category, brand, weight, description, source, raw payload viewer (collapsed), review notes, status history
- **Buttons:** prev/next image · Edit · Save · Move to review · Shelve · Reject · Archive · Open on Salla · Copy SKU · Previous / Next product · Close

### J4. Reject modal
- [ ] Reason dropdown (lookups) + note
- **Buttons:** Cancel · Reject N products

---

## K. `/prospecting`

### K1. Lists index
- [ ] Table: name · query · results · merchants found · leads created · created by · date
- [ ] Empty state
- **Buttons:** New search · Open list · Duplicate list · Delete list

### K2. New search panel
- [ ] Keyword field, category, price range, city, result limit
- **Buttons:** Cancel · Run search (with running/progress state) · Stop

### K3. `/prospecting/[listId]` results
- [ ] Table: checkbox · product image · product name · price · store name · store URL · status badge (`New` / `Existing — stage X` with link)
- [ ] Filter: new only / existing only
- **Buttons:** Select all new · Create leads from selected · Export CSV · Re-run search · Open merchant · Open store

### K4. Create leads modal
- [ ] Count summary, dedupe note, "attach matched products" checkbox, optional assign step
- **Buttons:** Cancel · Create N leads · Create and assign

---

## L. `/tasks`

- [ ] Tabs: My open · Overdue · Done · Team (managers)
- [ ] Table/list: title · merchant · assignee · due · priority · status
- [ ] Filters: assignee, due range, priority, merchant
- [ ] Empty state
- **Buttons:** New task · complete checkbox per row · Edit · Delete · Snooze · Open merchant · Export

---

## M. `/reports`

Shared: date range picker, segment filters (batch, city, specialist, category), Export CSV per report, print-friendly layout.

- [ ] M1. Funnel — stage counts + drop-off %, clickable segment → filtered merchants list
- [ ] M2. Specialist performance — table + conversion bars
- [ ] M3. Source & batch performance — conversion by source, by batch
- [ ] M4. Onboarding — avg days CTA→active, step-level bottleneck bars
- [ ] M5. Shelf throughput — ready vs shelved per week, avg days ready→shelved, top merchants by shelved SKUs
- [ ] M6. Activity volume — calls/whatsapp per specialist per day
- **Buttons per report:** date range · segment filters · Export CSV · Print · drill-through on any bar/segment

---

## N. `/settings`

### N1. Users
- [ ] Table: name · email · role · team · title · status · last active
- **Buttons:** Invite user · Edit · Change role · Deactivate · Reactivate · Resend invite

### N2. Teams
- [ ] Table: name · type · manager · members count
- **Buttons:** New team · Edit · Add member · Remove member · Delete

### N3. Form templates
- [ ] Template list with version + active flag
- [ ] **Builder**: field list (drag to reorder), per-field editor (key, label AR, label EN, type, required, options, help text, default), field type picker (text, tel, email, textarea, number, date, select, multiselect, file, checkbox, signature)
- [ ] Live preview pane, RTL toggle in preview
- **Buttons:** New template · Duplicate · Add field · Delete field · Reorder handles · Add option / Remove option · Preview · Save draft · Publish version · Set active · Archive

### N4. Onboarding templates
- [ ] Template list, default flag
- [ ] Step editor: order, title, description, owner role, SLA days, required toggle
- **Buttons:** New template · Add step · Delete step · Reorder · Set as default · Save · Duplicate

### N5. Lookups
- [ ] Tabs: Cities · Regions · Categories · Lost reasons · Reject reasons
- [ ] Rows: value EN, value AR, sort order, active toggle
- **Buttons:** Add value · Edit · Deactivate · Reorder · Save

### N6. Message templates (WhatsApp)
- [ ] Template list with variable chips (`{{store_name}}`, `{{form_link}}`, `{{agent_name}}`)
- [ ] Preview with a sample merchant
- **Buttons:** New template · Insert variable · Preview · Save · Delete

---

## O. `/f/[token]` — public merchant form

- [ ] Arabic RTL default, EN toggle, mobile-first, NML header only
- [ ] Prefilled fields from the merchant record
- [ ] Sectioned layout, per-field validation in Arabic, file upload with progress
- [ ] Consent checkbox + typed signature
- [ ] Success screen: confirmation, what happens next, rep's name and number
- [ ] Invalid / expired / revoked / already-submitted screens (each distinct)
- [ ] Offline or submit-failed state that preserves entered data
- **Buttons:** AR/EN toggle · Upload file · Remove file · Submit · Try again · Call your rep (tel:)

---

## P. Shared components — design once, reuse everywhere

- [ ] P1. Data table (sort, resize, sticky column, column visibility, density, row selection, pagination, skeleton, empty, error)
- [ ] P2. Filter bar + filter popovers (multi-select, date range, number range, search)
- [ ] P3. Saved-view tabs
- [ ] P4. Bulk action bar
- [ ] P5. Stage badge (10 stages)
- [ ] P6. Product status chip (6 statuses)
- [ ] P7. Priority pill (3)
- [ ] P8. Stage rail
- [ ] P9. Progress ring + progress bar
- [ ] P10. Avatar + avatar stack
- [ ] P11. User picker (searchable, role-filtered)
- [ ] P12. Merchant picker
- [ ] P13. Tag input
- [ ] P14. Date-time picker + quick chips
- [ ] P15. Phone cell (tel + WhatsApp icon + copy)
- [ ] P16. File uploader (drag, progress, error, preview)
- [ ] P17. File chip / thumbnail
- [ ] P18. Activity timeline item (user vs system variants)
- [ ] P19. Composer
- [ ] P20. Kanban card + column
- [ ] P21. Slide-over drawer
- [ ] P22. Modal shell (default + danger)
- [ ] P23. Confirm dialog
- [ ] P24. Empty state (icon, message, action)
- [ ] P25. Skeleton set (table row, card, chart)
- [ ] P26. Stat tile
- [ ] P27. Funnel bar chart
- [ ] P28. Inline-editable field

---

## Q. Cross-cutting states to design for every screen

- [ ] Loading (skeleton, never spinner)
- [ ] Empty (with the next action named)
- [ ] Error (what failed + how to retry)
- [ ] Permission-denied
- [ ] Mobile / narrow (which columns collapse, which actions move to overflow)
- [ ] RTL sanity

---

## Suggested order to work through this

1. **P — shared components** (everything else assembles from these)
2. **G — merchant detail** (the hardest screen; settles half the interaction language)
3. **F — merchants table** (settles the table/filter/bulk pattern for D, J, L)
4. **D + E — leads pool + import**
5. **N3 + O — form builder + public form** (the conversion moment)
6. **J — products**
7. **I — onboarding**
8. **C — dashboards** (design last: you only know what matters after the rest exists)
9. **H, K, L, M, N — pipeline, prospecting, tasks, reports, settings**
