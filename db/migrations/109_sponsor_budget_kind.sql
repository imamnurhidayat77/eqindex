-- 109: a sponsor budget funds either photo discounts or merchandise
-- discounts, never both (Imam, 2026-11-24). Each kind has its own agreed
-- amount, discount and bills. Existing budgets were all photo budgets.
ALTER TABLE sponsor_budgets ADD COLUMN IF NOT EXISTS applies_to TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE sponsor_budgets DROP CONSTRAINT IF EXISTS sponsor_budgets_applies_to_check;
ALTER TABLE sponsor_budgets ADD CONSTRAINT sponsor_budgets_applies_to_check CHECK (applies_to IN ('photo', 'merch'));
