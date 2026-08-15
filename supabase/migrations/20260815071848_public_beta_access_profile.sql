-- Keep the registration cohort separate from the user's current access tier.
-- Public beta users currently receive the complete beta feature set. Payment,
-- orders, balances, expirations and paid entitlements are intentionally absent.

alter table public.app_users
  add column if not exists registration_cohort text not null default 'public_beta',
  add column if not exists access_tier text not null default 'beta_full',
  add column if not exists registration_source_scene integer,
  add column if not exists registration_source_campaign text,
  add column if not exists registration_referrer_app_id text,
  add column if not exists registration_release_channel text;

alter table public.app_users
  drop constraint if exists app_users_registration_cohort_check,
  add constraint app_users_registration_cohort_check
    check (registration_cohort in ('public_beta')),
  drop constraint if exists app_users_access_tier_check,
  add constraint app_users_access_tier_check
    check (access_tier in ('beta_full', 'free', 'member')),
  drop constraint if exists app_users_registration_source_scene_check,
  add constraint app_users_registration_source_scene_check
    check (
      registration_source_scene is null
      or registration_source_scene between 0 and 99999
    ),
  drop constraint if exists app_users_registration_source_campaign_check,
  add constraint app_users_registration_source_campaign_check
    check (
      registration_source_campaign is null
      or (
        char_length(registration_source_campaign) between 1 and 64
        and registration_source_campaign ~ '^[A-Za-z0-9_-]+$'
      )
    ),
  drop constraint if exists app_users_registration_referrer_app_id_check,
  add constraint app_users_registration_referrer_app_id_check
    check (
      registration_referrer_app_id is null
      or (
        char_length(registration_referrer_app_id) between 3 and 64
        and registration_referrer_app_id ~ '^[A-Za-z0-9_-]+$'
      )
    ),
  drop constraint if exists app_users_registration_release_channel_check,
  add constraint app_users_registration_release_channel_check
    check (
      registration_release_channel is null
      or registration_release_channel in ('develop', 'trial', 'release')
    );

comment on column public.app_users.registration_cohort is
  'Lifecycle cohort assigned when the account first registers; not a paid plan.';
comment on column public.app_users.access_tier is
  'Internal access tier resolved centrally by the server; not a public membership label.';
comment on column public.app_users.registration_source_scene is
  'Sanitized WeChat launch scene captured only on first registration.';
comment on column public.app_users.registration_source_campaign is
  'Sanitized campaign code captured only on first registration.';
comment on column public.app_users.registration_referrer_app_id is
  'Sanitized referrer mini-program app id captured only on first registration.';
comment on column public.app_users.registration_release_channel is
  'Mini-program release channel captured only on first registration.';
