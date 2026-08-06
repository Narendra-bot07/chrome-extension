-- Remove development/test identities accidentally created in production.
-- The predicates intentionally require unmistakable synthetic identifiers;
-- ordinary users are never selected solely because of their display name.
BEGIN;

CREATE TEMP TABLE synthetic_user_ids (id UUID PRIMARY KEY) ON COMMIT DROP;

INSERT INTO synthetic_user_ids (id)
SELECT id
FROM public.users
WHERE id = '00000000-0000-0000-0000-000000000000'::uuid
   OR lower(email) = 'local.developer@example.com'
   OR lower(email) LIKE 'migration-test-%'
   OR (
        lower(coalesce(full_name, '')) = 'test user'
        AND (
          lower(email) ~ '^bot[0-9]+_[a-z0-9-]+$'
          OR lower(coalesce(provider, '')) IN ('test', 'local')
          OR lower(email) LIKE '%@example.com'
        )
      )
ON CONFLICT (id) DO NOTHING;

-- public.users owns subscriptions, sessions, billing and application data;
-- their foreign keys are configured to cascade or null audit references.
DELETE FROM public.users
WHERE id IN (SELECT id FROM synthetic_user_ids);

-- Older resume tables reference profiles/auth.users instead of public.users.
DELETE FROM public.profiles
WHERE id IN (SELECT id FROM synthetic_user_ids);

DELETE FROM auth.users
WHERE id IN (SELECT id FROM synthetic_user_ids);

COMMIT;
