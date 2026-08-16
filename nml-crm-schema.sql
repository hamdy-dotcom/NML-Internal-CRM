-- ============================================================================
-- NML CRM — full schema  (v2)
-- Run once, top to bottom, in the Supabase SQL editor.
-- Safe to re-run: enums guarded, tables IF NOT EXISTS, policies dropped first.
--
-- Changes from v1:
--   · Onboarding template seed is now TWO steps (welcome call, stocks/prices)
--   · merchants.default_margin_pct + pricing_agreed_at  (agreed once per merchant)
--   · products.nml_cost                                  (per-product override)
--   · v_product_margin view computing effective cost and margin
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================================================================
-- 1. ENUMS
-- ============================================================================
do $$ begin create type user_role as enum
  ('admin','acq_manager','acq_specialist','account_manager','catalog_ops','viewer');
exception when duplicate_object then null; end $$;

do $$ begin create type team_type as enum
  ('acquisition','account_management','catalog');
exception when duplicate_object then null; end $$;

do $$ begin create type merchant_stage as enum
  ('new','assigned','contacted','interested','form_sent','cta_completed','onboarding','active','on_hold','lost');
exception when duplicate_object then null; end $$;

do $$ begin create type merchant_priority as enum ('high','medium','low');
exception when duplicate_object then null; end $$;

do $$ begin create type lead_source as enum
  ('salla_export','product_search','manual','referral','inbound');
exception when duplicate_object then null; end $$;

do $$ begin create type activity_type as enum
  ('call','whatsapp','email','meeting','visit','note','system');
exception when duplicate_object then null; end $$;

do $$ begin create type activity_outcome as enum
  ('answered','no_answer','busy','wrong_number','interested','not_interested','callback','deal_agreed');
exception when duplicate_object then null; end $$;

do $$ begin create type product_status as enum
  ('discovered','ready_for_shelf','in_review','shelved','rejected','archived');
exception when duplicate_object then null; end $$;

do $$ begin create type task_status as enum ('open','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type step_status as enum
  ('pending','in_progress','done','skipped','blocked');
exception when duplicate_object then null; end $$;

do $$ begin create type form_link_status as enum
  ('sent','opened','submitted','expired','revoked');
exception when duplicate_object then null; end $$;

do $$ begin create type assignment_role as enum ('acquisition','account_manager');
exception when duplicate_object then null; end $$;

-- ============================================================================
-- 2. CORE TABLES
-- ============================================================================
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        team_type not null,
  manager_id  uuid,
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  email       text,
  phone       text,
  job_title   text,
  role        user_role not null default 'viewer',
  team_id     uuid references public.teams(id) on delete set null,
  is_active   boolean not null default true,
  max_open_merchants int not null default 200,   -- capacity flag in the assign panel
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$ begin
  alter table public.teams
    add constraint teams_manager_fkey
    foreign key (manager_id) references public.profiles(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.lead_batches (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  source          lead_source not null default 'salla_export',
  file_path       text,
  total_rows      int not null default 0,
  imported_rows   int not null default 0,
  duplicate_rows  int not null default 0,
  invalid_rows    int not null default 0,
  column_map      jsonb,
  notes           text,
  uploaded_by     uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now()
);

create sequence if not exists public.merchant_code_seq start 1000;

-- THE central table: a lead and a merchant are the same row
create table if not exists public.merchants (
  id                    uuid primary key default gen_random_uuid(),
  merchant_code         text not null unique
                          default ('NML-' || lpad(nextval('public.merchant_code_seq')::text, 5, '0')),

  store_name            text not null,
  store_name_ar         text,
  store_url             text,
  store_url_key         text,
  salla_store_id        text,

  owner_name            text,
  phone                 text,
  phone_key             text,
  whatsapp              text,
  email                 text,
  city                  text,
  region                text,
  address               text,
  pickup_address        text,

  category              text,
  sub_category          text,
  products_count        int default 0,
  rating                numeric(3,2),
  followers             int,
  monthly_orders_est    int,
  cr_number             text,
  vat_number            text,
  iban                  text,

  -- pricing agreed once, at onboarding step 2
  default_margin_pct    numeric(5,2),
  pricing_agreed_at     timestamptz,
  pricing_notes         text,

  stage                 merchant_stage not null default 'new',
  previous_stage        merchant_stage,
  priority              merchant_priority not null default 'medium',
  score                 int,
  lost_reason           text,
  hold_reason           text,
  tags                  text[] default '{}',
  notes                 text,

  acquisition_owner_id  uuid references public.profiles(id) on delete set null,
  account_manager_id    uuid references public.profiles(id) on delete set null,

  source                lead_source not null default 'salla_export',
  batch_id              uuid references public.lead_batches(id) on delete set null,
  raw                   jsonb,

  assigned_at           timestamptz,
  first_contact_at      timestamptz,
  interested_at         timestamptz,
  form_sent_at          timestamptz,
  cta_completed_at      timestamptz,
  onboarding_started_at timestamptz,
  activated_at          timestamptz,
  lost_at               timestamptz,

  next_action_at        timestamptz,
  last_activity_at      timestamptz,

  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create unique index if not exists merchants_salla_store_id_key
  on public.merchants (salla_store_id) where salla_store_id is not null;
create unique index if not exists merchants_store_url_key_idx
  on public.merchants (store_url_key) where store_url_key is not null;
create index if not exists merchants_phone_key_idx   on public.merchants (phone_key);
create index if not exists merchants_stage_idx       on public.merchants (stage);
create index if not exists merchants_acq_owner_idx   on public.merchants (acquisition_owner_id);
create index if not exists merchants_am_idx          on public.merchants (account_manager_id);
create index if not exists merchants_batch_idx       on public.merchants (batch_id);
create index if not exists merchants_next_action_idx on public.merchants (next_action_at);
create index if not exists merchants_city_idx        on public.merchants (city);
create index if not exists merchants_search_idx
  on public.merchants using gin (to_tsvector('simple',
      coalesce(store_name,'') || ' ' || coalesce(owner_name,'') || ' ' || coalesce(phone,'')));

create table if not exists public.merchant_assignments (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references public.merchants(id) on delete cascade,
  role_type     assignment_role not null,
  from_user_id  uuid references public.profiles(id) on delete set null,
  to_user_id    uuid references public.profiles(id) on delete set null,
  assigned_by   uuid references public.profiles(id) on delete set null,
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists merchant_assignments_merchant_idx
  on public.merchant_assignments (merchant_id, created_at desc);

create table if not exists public.activities (
  id             uuid primary key default gen_random_uuid(),
  merchant_id    uuid not null references public.merchants(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null,
  type           activity_type not null,
  direction      text check (direction in ('inbound','outbound')),
  outcome        activity_outcome,
  body           text,
  duration_sec   int,
  meta           jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists activities_merchant_idx on public.activities (merchant_id, created_at desc);
create index if not exists activities_user_idx     on public.activities (user_id, created_at desc);

create table if not exists public.tasks (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid references public.merchants(id) on delete cascade,
  title         text not null,
  description   text,
  assignee_id   uuid references public.profiles(id) on delete set null,
  due_at        timestamptz,
  status        task_status not null default 'open',
  priority      merchant_priority not null default 'medium',
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id) on delete set null,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists tasks_assignee_idx on public.tasks (assignee_id, status, due_at);
create index if not exists tasks_merchant_idx on public.tasks (merchant_id);

-- ============================================================================
-- 3. FORMS (the call to action)
-- ============================================================================
create table if not exists public.form_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  slug         text not null unique,
  description  text,
  schema       jsonb not null default '[]'::jsonb,
  version      int not null default 1,
  is_active    boolean not null default true,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.form_links (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null references public.merchants(id) on delete cascade,
  template_id   uuid not null references public.form_templates(id) on delete restrict,
  token         text not null unique default encode(gen_random_bytes(24),'hex'),
  status        form_link_status not null default 'sent',
  channel       text,
  sent_by       uuid references public.profiles(id) on delete set null,
  sent_at       timestamptz not null default now(),
  opened_at     timestamptz,
  submitted_at  timestamptz,
  expires_at    timestamptz not null default (now() + interval '30 days'),
  renew_requested_at timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists form_links_merchant_idx on public.form_links (merchant_id, sent_at desc);

create table if not exists public.form_submissions (
  id            uuid primary key default gen_random_uuid(),
  form_link_id  uuid not null references public.form_links(id) on delete cascade,
  merchant_id   uuid not null references public.merchants(id) on delete cascade,
  template_id   uuid not null references public.form_templates(id) on delete restrict,
  data          jsonb not null default '{}'::jsonb,
  files         jsonb not null default '[]'::jsonb,
  submitted_ip  inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index if not exists form_submissions_merchant_idx on public.form_submissions (merchant_id);

-- ============================================================================
-- 4. PRODUCTS
-- ============================================================================
create table if not exists public.products (
  id           uuid primary key default gen_random_uuid(),
  merchant_id  uuid not null references public.merchants(id) on delete cascade,
  external_id  text,
  name         text not null,
  name_ar      text,
  sku          text,
  url          text,
  image_url    text,
  images       text[] default '{}',
  price        numeric(12,2),          -- merchant's own retail price, from Salla
  sale_price   numeric(12,2),
  nml_cost     numeric(12,2),          -- per-product override; null = inherit merchant margin
  currency     text not null default 'SAR',
  stock        int,
  category     text,
  brand        text,
  weight_g     int,
  description  text,
  status       product_status not null default 'discovered',
  source       text not null default 'manual',
  review_notes text,
  reject_reason text,
  reviewed_by  uuid references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  ready_at     timestamptz,
  shelved_at   timestamptz,
  raw          jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create unique index if not exists products_merchant_external_key
  on public.products (merchant_id, external_id) where external_id is not null;
create index if not exists products_merchant_idx on public.products (merchant_id);
create index if not exists products_status_idx   on public.products (status);
create index if not exists products_category_idx on public.products (category);

-- ============================================================================
-- 5. PROSPECTING
-- ============================================================================
create table if not exists public.search_lists (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  query        text,
  filters      jsonb,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists public.search_results (
  id                uuid primary key default gen_random_uuid(),
  list_id           uuid not null references public.search_lists(id) on delete cascade,
  product_name      text,
  product_url       text,
  image_url         text,
  price             numeric(12,2),
  store_name        text,
  store_url         text,
  store_url_key     text,
  salla_store_id    text,
  matched_merchant  uuid references public.merchants(id) on delete set null,
  converted         boolean not null default false,
  raw               jsonb,
  created_at        timestamptz not null default now()
);
create index if not exists search_results_list_idx on public.search_results (list_id);

-- ============================================================================
-- 6. ONBOARDING
-- ============================================================================
create table if not exists public.onboarding_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_default  boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.onboarding_template_steps (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.onboarding_templates(id) on delete cascade,
  order_index  int not null,
  title        text not null,
  description  text,
  owner_role   user_role not null default 'account_manager',
  sla_days     int not null default 3,
  is_required  boolean not null default true
);
create index if not exists onboarding_template_steps_tpl_idx
  on public.onboarding_template_steps (template_id, order_index);

create table if not exists public.merchant_onboarding (
  id            uuid primary key default gen_random_uuid(),
  merchant_id   uuid not null unique references public.merchants(id) on delete cascade,
  template_id   uuid references public.onboarding_templates(id) on delete set null,
  progress      int not null default 0,
  started_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create table if not exists public.merchant_onboarding_steps (
  id             uuid primary key default gen_random_uuid(),
  onboarding_id  uuid not null references public.merchant_onboarding(id) on delete cascade,
  merchant_id    uuid not null references public.merchants(id) on delete cascade,
  order_index    int not null,
  title          text not null,
  description    text,
  is_required    boolean not null default true,
  status         step_status not null default 'pending',
  blocked_reason text,
  owner_id       uuid references public.profiles(id) on delete set null,
  due_at         timestamptz,
  completed_at   timestamptz,
  completed_by   uuid references public.profiles(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  constraint blocked_needs_reason
    check (status <> 'blocked' or coalesce(blocked_reason,'') <> '')
);
create index if not exists merchant_onboarding_steps_ob_idx
  on public.merchant_onboarding_steps (onboarding_id, order_index);
create index if not exists merchant_onboarding_steps_owner_idx
  on public.merchant_onboarding_steps (owner_id, status, due_at);

-- ============================================================================
-- 7. SUPPORT TABLES
-- ============================================================================
create table if not exists public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null,
  entity_id    uuid not null,
  merchant_id  uuid references public.merchants(id) on delete cascade,
  file_path    text not null,
  file_name    text,
  mime_type    text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists attachments_entity_idx on public.attachments (entity_type, entity_id);

create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.profiles(id) on delete set null,
  entity      text not null,
  entity_id   uuid,
  action      text not null,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

create table if not exists public.lookups (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  value       text not null,
  value_ar    text,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  unique (kind, value)
);

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================
create or replace function public.my_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin','acq_manager') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_see_merchant(p_merchant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant
      and ( public.is_manager()
         or m.acquisition_owner_id = auth.uid()
         or m.account_manager_id   = auth.uid()
         or public.my_role() in ('catalog_ops','viewer') )
  );
$$;

create or replace function public.can_edit_merchant(p_merchant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.merchants m
    where m.id = p_merchant
      and ( public.is_manager()
         or m.acquisition_owner_id = auth.uid()
         or m.account_manager_id   = auth.uid() )
  );
$$;

create or replace function public.normalize_phone(p text)
returns text language plpgsql immutable as $$
declare d text;
begin
  if p is null then return null; end if;
  d := regexp_replace(p, '\D', '', 'g');
  if d = '' then return null; end if;
  if left(d,2) = '00' then d := substr(d,3); end if;
  if left(d,1) = '0' and length(d) = 10 then d := '966' || substr(d,2); end if;
  if length(d) = 9 and left(d,1) = '5' then d := '966' || d; end if;
  return d;
end $$;

create or replace function public.normalize_url(p text)
returns text language sql immutable as $$
  select nullif(
    lower(regexp_replace(regexp_replace(coalesce(p,''), '^https?://(www\.)?', ''), '/+$', '')),
  '');
$$;

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text;
begin
  foreach t in array array['profiles','merchants','products','tasks','form_templates'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$I', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.merchants_normalize()
returns trigger language plpgsql as $$
begin
  new.phone_key     := public.normalize_phone(coalesce(new.phone, new.whatsapp));
  new.store_url_key := public.normalize_url(new.store_url);
  return new;
end $$;

drop trigger if exists trg_merchants_normalize on public.merchants;
create trigger trg_merchants_normalize
  before insert or update of phone, whatsapp, store_url on public.merchants
  for each row execute function public.merchants_normalize();

create or replace function public.merchants_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage = old.stage then return new; end if;

  if new.stage = 'cta_completed' and not exists (
       select 1 from public.form_submissions s where s.merchant_id = new.id) then
    raise exception 'Cannot move to CTA done: this merchant has not submitted the form';
  end if;

  if new.stage = 'onboarding' and new.account_manager_id is null then
    raise exception 'Cannot start onboarding: assign an account manager first';
  end if;

  if new.stage = 'active' and exists (
       select 1 from public.merchant_onboarding_steps st
       where st.merchant_id = new.id and st.is_required
         and st.status not in ('done','skipped')) then
    raise exception 'Cannot activate: required onboarding steps are still open';
  end if;

  if new.stage = 'lost'    and coalesce(new.lost_reason,'') = '' then
    raise exception 'A lost reason is required'; end if;
  if new.stage = 'on_hold' and coalesce(new.hold_reason,'') = '' then
    raise exception 'A hold reason is required'; end if;

  if new.stage = 'assigned'      and new.assigned_at is null then new.assigned_at := now(); end if;
  if new.stage = 'contacted'     and new.first_contact_at is null then new.first_contact_at := now(); end if;
  if new.stage = 'interested'    and new.interested_at is null then new.interested_at := now(); end if;
  if new.stage = 'form_sent'     and new.form_sent_at is null then new.form_sent_at := now(); end if;
  if new.stage = 'cta_completed' and new.cta_completed_at is null then new.cta_completed_at := now(); end if;
  if new.stage = 'onboarding'    and new.onboarding_started_at is null then new.onboarding_started_at := now(); end if;
  if new.stage = 'active'        and new.activated_at is null then new.activated_at := now(); end if;
  if new.stage = 'lost'          and new.lost_at is null then new.lost_at := now(); end if;

  if new.stage in ('on_hold','lost') then new.previous_stage := old.stage; end if;

  return new;
end $$;

drop trigger if exists trg_merchants_stage_guard on public.merchants;
create trigger trg_merchants_stage_guard
  before update of stage on public.merchants
  for each row execute function public.merchants_stage_guard();

create or replace function public.merchants_stage_after()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_tpl uuid; v_ob uuid;
begin
  if new.stage = old.stage then return new; end if;

  insert into public.activities (merchant_id, user_id, type, body, meta)
  values (new.id, auth.uid(), 'system',
          format('Stage changed from %s to %s', old.stage, new.stage),
          jsonb_build_object('from', old.stage, 'to', new.stage));

  insert into public.audit_log (actor_id, entity, entity_id, action, before, after)
  values (auth.uid(), 'merchant', new.id, 'stage_change',
          jsonb_build_object('stage', old.stage), jsonb_build_object('stage', new.stage));

  if new.stage = 'cta_completed' and old.stage is distinct from 'cta_completed' then
    update public.products
      set status = 'ready_for_shelf', ready_at = now()
      where merchant_id = new.id and status = 'discovered';

    if not exists (select 1 from public.merchant_onboarding where merchant_id = new.id) then
      select id into v_tpl from public.onboarding_templates
        where is_default and is_active order by created_at limit 1;

      if v_tpl is not null then
        insert into public.merchant_onboarding (merchant_id, template_id)
        values (new.id, v_tpl) returning id into v_ob;

        insert into public.merchant_onboarding_steps
          (onboarding_id, merchant_id, order_index, title, description, is_required, owner_id, due_at)
        select v_ob, new.id, s.order_index, s.title, s.description, s.is_required,
               new.account_manager_id, now() + (s.sla_days || ' days')::interval
        from public.onboarding_template_steps s
        where s.template_id = v_tpl order by s.order_index;
      end if;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_merchants_stage_after on public.merchants;
create trigger trg_merchants_stage_after
  after update of stage on public.merchants
  for each row execute function public.merchants_stage_after();

create or replace function public.merchants_assignment_log()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.acquisition_owner_id is distinct from old.acquisition_owner_id then
    insert into public.merchant_assignments (merchant_id, role_type, from_user_id, to_user_id, assigned_by)
    values (new.id, 'acquisition', old.acquisition_owner_id, new.acquisition_owner_id, auth.uid());

    if new.acquisition_owner_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.acquisition_owner_id, 'assignment', 'New merchant assigned',
              new.store_name, '/merchants/' || new.id);
    end if;
  end if;

  if new.account_manager_id is distinct from old.account_manager_id then
    insert into public.merchant_assignments (merchant_id, role_type, from_user_id, to_user_id, assigned_by)
    values (new.id, 'account_manager', old.account_manager_id, new.account_manager_id, auth.uid());

    if new.account_manager_id is not null then
      insert into public.notifications (user_id, type, title, body, link)
      values (new.account_manager_id, 'assignment', 'New merchant to onboard',
              new.store_name, '/merchants/' || new.id);

      update public.merchant_onboarding_steps
        set owner_id = new.account_manager_id
        where merchant_id = new.id and owner_id is null;
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_merchants_assignment_log on public.merchants;
create trigger trg_merchants_assignment_log
  after update of acquisition_owner_id, account_manager_id on public.merchants
  for each row execute function public.merchants_assignment_log();

create or replace function public.activities_touch_merchant()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.merchants set last_activity_at = new.created_at where id = new.merchant_id;
  return new;
end $$;

drop trigger if exists trg_activities_touch on public.activities;
create trigger trg_activities_touch
  after insert on public.activities
  for each row execute function public.activities_touch_merchant();

create or replace function public.recompute_onboarding_progress()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total int; v_done int;
begin
  v_id := coalesce(new.onboarding_id, old.onboarding_id);

  select count(*) filter (where is_required),
         count(*) filter (where is_required and status in ('done','skipped'))
    into v_total, v_done
  from public.merchant_onboarding_steps where onboarding_id = v_id;

  update public.merchant_onboarding
    set progress = case when v_total = 0 then 0 else round(v_done::numeric * 100 / v_total) end,
        completed_at = case when v_total > 0 and v_done = v_total then now() else null end
  where id = v_id;

  return null;
end $$;

drop trigger if exists trg_onboarding_progress on public.merchant_onboarding_steps;
create trigger trg_onboarding_progress
  after insert or update or delete on public.merchant_onboarding_steps
  for each row execute function public.recompute_onboarding_progress();

create or replace function public.stamp_step_completion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' and old.status is distinct from 'done' then
    new.completed_at := now();
    new.completed_by := auth.uid();
  elsif new.status <> 'done' then
    new.completed_at := null; new.completed_by := null;
  end if;
  if new.status <> 'blocked' then new.blocked_reason := null; end if;
  return new;
end $$;

drop trigger if exists trg_stamp_step on public.merchant_onboarding_steps;
create trigger trg_stamp_step
  before update of status on public.merchant_onboarding_steps
  for each row execute function public.stamp_step_completion();

create or replace function public.stamp_product_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'ready_for_shelf' and new.ready_at is null then new.ready_at := now(); end if;
    if new.status = 'shelved' then new.shelved_at := now(); end if;
    if new.status in ('in_review','shelved','rejected') then
      new.reviewed_by := auth.uid(); new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_stamp_product on public.products;
create trigger trg_stamp_product
  before update of status on public.products
  for each row execute function public.stamp_product_status();

-- ============================================================================
-- 10. VIEWS
-- ============================================================================
create or replace view public.v_merchants_list as
select m.*,
       ao.full_name as acquisition_owner_name,
       am.full_name as account_manager_name,
       b.name       as batch_name,
       (select count(*) from public.products p where p.merchant_id = m.id) as product_total,
       (select count(*) from public.products p where p.merchant_id = m.id and p.status = 'ready_for_shelf') as product_ready,
       ob.progress  as onboarding_progress
from public.merchants m
left join public.profiles ao on ao.id = m.acquisition_owner_id
left join public.profiles am on am.id = m.account_manager_id
left join public.lead_batches b on b.id = m.batch_id
left join public.merchant_onboarding ob on ob.merchant_id = m.id;

-- effective cost = per-product override, else merchant's agreed margin off the retail price
create or replace view public.v_product_margin as
select p.*,
       m.store_name,
       m.merchant_code,
       m.default_margin_pct,
       coalesce(
         p.nml_cost,
         case when m.default_margin_pct is not null and p.price is not null
              then round(p.price * (1 - m.default_margin_pct / 100), 2) end
       ) as effective_cost,
       case when p.price is not null then
         p.price - coalesce(
           p.nml_cost,
           case when m.default_margin_pct is not null
                then round(p.price * (1 - m.default_margin_pct / 100), 2) end)
       end as margin_amount,
       case when p.price is not null and p.price <> 0 then
         round(100 * (p.price - coalesce(
           p.nml_cost,
           case when m.default_margin_pct is not null
                then round(p.price * (1 - m.default_margin_pct / 100), 2) end)) / p.price, 1)
       end as margin_pct,
       (p.nml_cost is not null) as cost_is_override
from public.products p
join public.merchants m on m.id = p.merchant_id;

create or replace view public.v_pipeline_counts as
select stage, count(*) as total from public.merchants group by stage;

create or replace view public.v_specialist_performance as
select p.id as user_id, p.full_name, p.max_open_merchants,
       count(*) filter (where m.stage in ('assigned','contacted','interested','form_sent')) as open_now,
       count(*) filter (where m.assigned_at is not null)      as assigned,
       count(*) filter (where m.first_contact_at is not null) as contacted,
       count(*) filter (where m.form_sent_at is not null)     as forms_sent,
       count(*) filter (where m.cta_completed_at is not null) as cta_done,
       count(*) filter (where m.stage = 'lost')               as lost,
       round(100.0 * count(*) filter (where m.cta_completed_at is not null)
             / nullif(count(*) filter (where m.assigned_at is not null),0), 1) as conversion_pct,
       round(avg(extract(epoch from (m.cta_completed_at - m.assigned_at)) / 86400)::numeric, 1) as avg_days_to_cta,
       round(avg(extract(epoch from (m.first_contact_at - m.assigned_at)) / 86400)::numeric, 1) as avg_days_to_contact
from public.profiles p
left join public.merchants m on m.acquisition_owner_id = p.id
where p.role in ('acq_specialist','acq_manager')
group by p.id, p.full_name, p.max_open_merchants;

create or replace view public.v_shelf_queue as
select pr.*, m.store_name, m.merchant_code, m.city, m.stage as merchant_stage
from public.products pr
join public.merchants m on m.id = pr.merchant_id
where pr.status in ('ready_for_shelf','in_review');

-- ============================================================================
-- 11. ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles                  enable row level security;
alter table public.teams                     enable row level security;
alter table public.lead_batches              enable row level security;
alter table public.merchants                 enable row level security;
alter table public.merchant_assignments      enable row level security;
alter table public.activities                enable row level security;
alter table public.tasks                     enable row level security;
alter table public.form_templates            enable row level security;
alter table public.form_links                enable row level security;
alter table public.form_submissions          enable row level security;
alter table public.products                  enable row level security;
alter table public.search_lists              enable row level security;
alter table public.search_results            enable row level security;
alter table public.onboarding_templates      enable row level security;
alter table public.onboarding_template_steps enable row level security;
alter table public.merchant_onboarding       enable row level security;
alter table public.merchant_onboarding_steps enable row level security;
alter table public.attachments               enable row level security;
alter table public.audit_log                 enable row level security;
alter table public.notifications             enable row level security;
alter table public.lookups                   enable row level security;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (true);
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_admin_all on public.profiles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

do $$ declare t text;
begin
  foreach t in array array['teams','lookups','form_templates','onboarding_templates','onboarding_template_steps'] loop
    execute format('drop policy if exists %1$s_read on public.%1$I', t);
    execute format('create policy %1$s_read on public.%1$I for select to authenticated using (true)', t);
    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (public.is_manager()) with check (public.is_manager())', t);
  end loop;
end $$;

drop policy if exists lead_batches_read on public.lead_batches;
create policy lead_batches_read on public.lead_batches for select to authenticated using (true);
drop policy if exists lead_batches_write on public.lead_batches;
create policy lead_batches_write on public.lead_batches for all to authenticated
  using (public.is_manager()) with check (public.is_manager());

drop policy if exists merchants_select on public.merchants;
create policy merchants_select on public.merchants for select to authenticated
using (
  public.is_manager()
  or acquisition_owner_id = auth.uid()
  or account_manager_id   = auth.uid()
  or public.my_role() = 'viewer'
  or (public.my_role() = 'catalog_ops' and stage in ('cta_completed','onboarding','active'))
);

drop policy if exists merchants_insert on public.merchants;
create policy merchants_insert on public.merchants for insert to authenticated
with check (public.my_role() in ('admin','acq_manager','acq_specialist'));

drop policy if exists merchants_update on public.merchants;
create policy merchants_update on public.merchants for update to authenticated
using (public.is_manager() or acquisition_owner_id = auth.uid() or account_manager_id = auth.uid())
with check (public.is_manager() or acquisition_owner_id = auth.uid() or account_manager_id = auth.uid());

drop policy if exists merchants_delete on public.merchants;
create policy merchants_delete on public.merchants for delete to authenticated
using (public.is_admin());

do $$ declare t text;
begin
  foreach t in array array['merchant_assignments','activities','form_links','form_submissions',
                           'products','merchant_onboarding','merchant_onboarding_steps'] loop
    execute format('drop policy if exists %1$s_select on public.%1$I', t);
    execute format('create policy %1$s_select on public.%1$I for select to authenticated
                    using (public.can_see_merchant(merchant_id))', t);
    execute format('drop policy if exists %1$s_write on public.%1$I', t);
    execute format('create policy %1$s_write on public.%1$I for all to authenticated
                    using (public.can_edit_merchant(merchant_id) or public.my_role() = ''catalog_ops'')
                    with check (public.can_edit_merchant(merchant_id) or public.my_role() = ''catalog_ops'')', t);
  end loop;
end $$;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated
using (public.is_manager() or assignee_id = auth.uid() or created_by = auth.uid());
drop policy if exists tasks_write on public.tasks;
create policy tasks_write on public.tasks for all to authenticated
using (public.is_manager() or assignee_id = auth.uid() or created_by = auth.uid())
with check (public.is_manager() or assignee_id = auth.uid() or created_by = auth.uid());

do $$ declare t text;
begin
  foreach t in array array['search_lists','search_results'] loop
    execute format('drop policy if exists %1$s_all on public.%1$I', t);
    execute format('create policy %1$s_all on public.%1$I for all to authenticated
                    using (public.my_role() <> ''viewer'') with check (public.my_role() <> ''viewer'')', t);
  end loop;
end $$;

drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select to authenticated
using (merchant_id is null or public.can_see_merchant(merchant_id));
drop policy if exists attachments_write on public.attachments;
create policy attachments_write on public.attachments for all to authenticated
using (merchant_id is null or public.can_edit_merchant(merchant_id))
with check (merchant_id is null or public.can_edit_merchant(merchant_id));

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select to authenticated
using (public.is_manager());

drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- NOTE: /f/[token] is served by a Next.js Route Handler using the SERVICE ROLE
-- key. There is deliberately NO anon policy on any table.

-- ============================================================================
-- 12. SEED
-- ============================================================================
insert into public.onboarding_templates (name, is_default)
select 'NML Onboarding', true
where not exists (select 1 from public.onboarding_templates where is_default);

insert into public.onboarding_template_steps (template_id, order_index, title, description, owner_role, sla_days, is_required)
select t.id, v.ord, v.title, v.descr, 'account_manager', v.sla, true
from public.onboarding_templates t,
(values
  (1,'Welcome call','Introduce NML, confirm the partnership and set expectations',1),
  (2,'Stocks and prices received','Stock list and product costs received from the merchant; products can now be reviewed for shelf',5)
) as v(ord,title,descr,sla)
where t.is_default
  and not exists (select 1 from public.onboarding_template_steps s where s.template_id = t.id);

insert into public.form_templates (name, slug, description, schema)
select 'NML Partnership Agreement', 'nml-partnership',
       'Merchant confirmation form sent at the end of the acquisition call',
       '[
         {"key":"store_name","label":"اسم المتجر","label_en":"Store name","type":"text","required":true,"prefill":true},
         {"key":"owner_name","label":"اسم المسؤول","label_en":"Contact person","type":"text","required":true,"prefill":true},
         {"key":"phone","label":"رقم الجوال","label_en":"Mobile number","type":"tel","required":true,"prefill":true},
         {"key":"email","label":"البريد الإلكتروني","label_en":"Email","type":"email","required":false,"prefill":true},
         {"key":"products_ready_count","label":"عدد المنتجات الجاهزة","label_en":"Products ready count","type":"number","required":true},
         {"key":"notes","label":"ملاحظات أو استفسارات","label_en":"Notes or questions","type":"textarea","required":false},
         {"key":"consent","label":"أوافق على الشراكة مع نمل عبر منصة سلة","label_en":"I agree with the partnership with NML through Salla Platform","type":"checkbox","required":true}
       ]'::jsonb
where not exists (select 1 from public.form_templates where slug = 'nml-partnership');

insert into public.lookups (kind, value, value_ar, sort_order) values
  ('city','Riyadh','الرياض',1),('city','Jeddah','جدة',2),('city','Dammam','الدمام',3),
  ('city','Makkah','مكة',4),('city','Madinah','المدينة',5),('city','Khobar','الخبر',6),
  ('city','Taif','الطائف',7),('city','Buraidah','بريدة',8),('city','Tabuk','تبوك',9),
  ('city','Abha','أبها',10),
  ('lost_reason','Not interested','غير مهتم',1),
  ('lost_reason','Already with a competitor','مع منافس',2),
  ('lost_reason','Wrong number','رقم خاطئ',3),
  ('lost_reason','Store closed','المتجر مغلق',4),
  ('lost_reason','Margin not accepted','الهامش غير مقبول',5),
  ('lost_reason','No response after 5 attempts','لا يوجد رد بعد 5 محاولات',6),
  ('reject_reason','Poor image quality','جودة الصور ضعيفة',1),
  ('reject_reason','Price not competitive','السعر غير تنافسي',2),
  ('reject_reason','Restricted category','تصنيف ممنوع',3),
  ('reject_reason','Out of stock','غير متوفر',4),
  ('blocked_reason','Waiting on merchant documents','بانتظار مستندات التاجر',1),
  ('blocked_reason','Waiting on stock list','بانتظار قائمة المخزون',2),
  ('blocked_reason','Pricing not agreed','لم يتم الاتفاق على الأسعار',3)
on conflict (kind, value) do nothing;

-- ============================================================================
-- 13. AFTER RUNNING: make yourself admin
-- ============================================================================
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';
