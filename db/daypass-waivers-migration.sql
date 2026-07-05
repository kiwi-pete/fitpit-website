-- ============================================================
-- Day Pass Visitor Waivers
-- ------------------------------------------------------------
-- Stores liability waivers signed by day-pass (non-member) visitors via the
-- non-public website page /daypass-waiver (reached by scanning a QR code at
-- reception). Isolated, additive table — it does not touch any existing
-- Gym Manager data.
--
-- Already applied to the shared "Gym Manager" Supabase project
-- (lnxzqiydnpshaooflebs). Kept here for the record / to re-create elsewhere.
--
-- Retention: signed waivers are kept for 12 months, then purged nightly by a
-- pg_cron job (see bottom of this file).
-- ============================================================

create table if not exists public.daypass_waivers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  contact_number text not null,
  emergency_contact_name text,
  emergency_contact_number text,        -- optional
  email text,
  visit_date date,
  health_declaration boolean not null default false,
  consent boolean not null default false,
  signature_type text not null check (signature_type in ('draw','type')),
  signature_data text not null,          -- typed name, or a PNG data URL for drawn signatures
  selfie_data text,                      -- low-res JPEG selfie (data URL); PII, kept in-table (not public storage)
  waiver_version text not null default 'daypass-v1',
  signed_at timestamptz not null default now(),
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);

-- Match the rest of the Gym Manager tables: RLS on, no permissive policies,
-- so only the service-role key (used by the website API) can read/write.
alter table public.daypass_waivers enable row level security;

create index if not exists daypass_waivers_signed_at_idx
  on public.daypass_waivers (signed_at desc);

-- 12-month retention: purge signed waivers older than a year, daily at 03:17 UTC.
-- Requires the pg_cron extension (already installed on this project).
select cron.schedule(
  'purge-daypass-waivers',
  '17 3 * * *',
  $$delete from public.daypass_waivers where signed_at < now() - interval '12 months'$$
);
