-- Salla product extraction schema.
-- Run once in the Supabase SQL editor, in order.

-- ── 1. Merchants: store URL ───────────────────────────────────────────────────

ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS store_url text;

-- ── 2. Products: Salla-specific fields ───────────────────────────────────────

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS salla_product_id text,
  ADD COLUMN IF NOT EXISTS external_url     text,
  ADD COLUMN IF NOT EXISTS fetched_at       timestamptz;

-- Unique constraint for upsert logic (one Salla product per merchant).
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_merchant_salla_unique;
ALTER TABLE public.products
  ADD  CONSTRAINT products_merchant_salla_unique
  UNIQUE (merchant_id, salla_product_id);

-- ── 3. Fetch jobs table ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.salla_fetch_jobs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id      uuid        NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  status           text        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','running','done','error')),
  store_url        text        NOT NULL,
  store_id         text,
  progress         jsonb       NOT NULL DEFAULT '{
    "phase":               "idle",
    "products_found":      0,
    "images_found":        0,
    "request_count":       0,
    "categories_crawled":  [],
    "brands_crawled":      []
  }'::jsonb,
  fetched_products jsonb,      -- written once, at completion
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Auto-stamp updated_at (reuse existing function if present).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_salla_jobs_updated_at ON public.salla_fetch_jobs;
CREATE TRIGGER trg_salla_jobs_updated_at
  BEFORE UPDATE ON public.salla_fetch_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ── 4. Realtime ───────────────────────────────────────────────────────────────

-- REPLICA IDENTITY FULL ensures UPDATE events carry the full new row in the
-- WAL, so Supabase Realtime delivers status+progress to the browser popup.
ALTER TABLE public.salla_fetch_jobs REPLICA IDENTITY FULL;

-- The popup subscribes to this table. Run only if not already added.
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salla_fetch_jobs;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- One active (pending or running) job per merchant. Prevents race-condition
-- duplicates when two requests arrive before either insert completes.
CREATE UNIQUE INDEX IF NOT EXISTS salla_jobs_one_active_per_merchant
  ON public.salla_fetch_jobs (merchant_id)
  WHERE (status = 'pending' OR status = 'running');

-- ── 5. RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE public.salla_fetch_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "salla_jobs_select" ON public.salla_fetch_jobs;
CREATE POLICY "salla_jobs_select" ON public.salla_fetch_jobs
  FOR SELECT USING (can_edit_merchant(merchant_id));

DROP POLICY IF EXISTS "salla_jobs_insert" ON public.salla_fetch_jobs;
CREATE POLICY "salla_jobs_insert" ON public.salla_fetch_jobs
  FOR INSERT WITH CHECK (can_edit_merchant(merchant_id));

-- Worker updates rows using the service key, which bypasses RLS — no UPDATE
-- policy needed for the browser client.
