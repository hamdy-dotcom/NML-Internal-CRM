-- Fix 1: set due_at = cta_completed_at for all existing onboarding steps
-- (previously set to now() + sla_days, now should equal the CTA date)
update public.merchant_onboarding_steps s
set due_at = m.cta_completed_at
from public.merchants m
where s.merchant_id = m.id
  and m.cta_completed_at is not null
  and s.status != 'done';   -- leave completed steps untouched

-- Fix 2: update the trigger function to use cta_completed_at instead of now() + sla_days
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
               new.account_manager_id, new.cta_completed_at
        from public.onboarding_template_steps s
        where s.template_id = v_tpl order by s.order_index;
      end if;
    end if;
  end if;

  return new;
end $$;
