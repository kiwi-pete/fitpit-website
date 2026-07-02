-- ============================================================
-- Fit Pit analytics — detail migration
-- ------------------------------------------------------------
-- Adds device-detail and city-level geo columns to
-- analytics_sessions so the dashboard can show:
--   • richer device info (OS/browser version, screen resolution,
--     real Android model, best-guess Apple model from screen size)
--   • city-level locations on a world map (from Vercel edge geo
--     headers — IP-based, no visitor permission prompt, no raw IP)
--
-- All columns are nullable and additive, so this is safe to run on
-- the shared database and does NOT affect the Gym Manager app.
-- Existing rows keep NULLs; new visits fill the columns going
-- forward. The site keeps working before AND after this runs
-- (track.js / analytics.js fall back to the base columns).
--
-- How to run: Supabase dashboard → SQL Editor → paste → Run.
-- ============================================================

alter table public.analytics_sessions
  add column if not exists os_version      text,
  add column if not exists browser_version text,
  add column if not exists device_model    text,
  add column if not exists screen_w        integer,
  add column if not exists screen_h        integer,
  add column if not exists dpr             real,
  add column if not exists city            text,
  add column if not exists region          text,
  add column if not exists latitude        real,
  add column if not exists longitude       real,
  -- Admin-device visits (anyone who has logged into /secretadminlink on that
  -- device). Recorded but hidden from analytics totals by default; the
  -- dashboard has an "admin-device" view to confirm the exclusion works.
  add column if not exists excluded        boolean not null default false;
