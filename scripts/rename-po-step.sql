-- Rename onboarding step 2 title to "First PO Agreement".
-- Run once in the Supabase SQL editor.

-- 1. Update the default template step
UPDATE public.onboarding_template_steps
SET title = 'First PO Agreement'
WHERE title IN ('Stocks and prices received', 'Stocks and prices', 'Stocks & prices')
  AND template_id = (
    SELECT id FROM public.onboarding_templates
    WHERE is_default AND is_active
    ORDER BY created_at LIMIT 1
  );

-- 2. Update all live merchant onboarding steps that still carry the old title
UPDATE public.merchant_onboarding_steps
SET title = 'First PO Agreement'
WHERE title IN ('Stocks and prices received', 'Stocks and prices', 'Stocks & prices');

-- 3. Update source on any existing products imported as merchant_file from the
--    onboarding upload so they are consistent with new source = 'po'.
--    Remove this block if you want to keep historic rows tagged differently.
UPDATE public.products
SET source = 'po'
WHERE source = 'merchant_file';
