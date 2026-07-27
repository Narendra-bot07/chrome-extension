-- Concurrency-safe identity constraints complement API validation.
create unique index if not exists profiles_username_unique_idx
  on public.profiles(lower(username))
  where username is not null and btrim(username) <> '' and deleted_at is null;

alter table public.profiles drop constraint if exists profiles_phone_country_code_format;
alter table public.profiles add constraint profiles_phone_country_code_format
  check (phone_country_code is null or phone_country_code ~ '^\+[1-9][0-9]{0,5}$') not valid;

alter table public.profiles drop constraint if exists profiles_phone_number_format;
alter table public.profiles add constraint profiles_phone_number_format
  check (phone_number is null or phone_number ~ '^[0-9]{6,14}$') not valid;
