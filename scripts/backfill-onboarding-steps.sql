-- Backfill merchant_onboarding + merchant_onboarding_steps for every merchant
-- at cta_completed / onboarding / active that has no onboarding record yet.
--
-- due_at = merchant.cta_completed_at (matches the fixed trigger logic).
-- owner_id = merchant.account_manager_id (null if not yet assigned).
-- Run once against your Supabase project via the SQL editor.

do $$
declare
  v_tpl  uuid;
  v_ob   uuid;
  rec    record;
begin
  -- Resolve the default active template once
  select id into v_tpl
  from public.onboarding_templates
  where is_default and is_active
  order by created_at
  limit 1;

  if v_tpl is null then
    raise exception 'No default onboarding template found';
  end if;

  for rec in
    select m.id, m.account_manager_id, m.cta_completed_at
    from   public.merchants m
    where  m.stage in ('cta_completed', 'onboarding', 'active')
      and  not exists (
             select 1 from public.merchant_onboarding ob
             where ob.merchant_id = m.id
           )
  loop
    -- Create onboarding header
    insert into public.merchant_onboarding (merchant_id, template_id)
    values (rec.id, v_tpl)
    returning id into v_ob;

    -- Create steps from template; due_at = cta_completed_at
    insert into public.merchant_onboarding_steps
      (onboarding_id, merchant_id, order_index, title, description, is_required, owner_id, due_at)
    select
      v_ob,
      rec.id,
      s.order_index,
      s.title,
      s.description,
      s.is_required,
      rec.account_manager_id,
      rec.cta_completed_at
    from public.onboarding_template_steps s
    where s.template_id = v_tpl
    order by s.order_index;
  end loop;
end $$;
