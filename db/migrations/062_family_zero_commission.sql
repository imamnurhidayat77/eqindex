-- 062: family operation — zero platform commission.
-- Charles (platform) is the photographer's father: taking a cut moves money
-- between family pockets and only complicates bookkeeping. The commission
-- mechanism (photographers.commission_rate + settlement math) is RETAINED for
-- future external photographers — this migration only zeroes the rate for the
-- current family photographers. Idempotent.

UPDATE photographers SET commission_rate = 0 WHERE is_active AND commission_rate IS DISTINCT FROM 0;
