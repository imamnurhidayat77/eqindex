-- 070: photographer staff role — sees the media side of the admin console
-- (library, upload, reel orders, transactions + read-only master lists for
-- tagging). Assigned by admins via Users; never self-registerable
-- (register whitelist stays PUBLIC/RIDER/COACH). Additive only.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('PUBLIC','RIDER','COACH','OWNER','BREEDER','PHOTOGRAPHER','ADMIN'));
