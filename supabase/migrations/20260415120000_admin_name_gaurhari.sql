-- Display name: "Mr. Gaurhari Sanghi" -> "Gaurhari Sanghi" (admin_users.name)
-- Idempotent: no-op if already updated.
UPDATE public.admin_users
SET name = 'Gaurhari Sanghi'
WHERE name = 'Mr. Gaurhari Sanghi';
