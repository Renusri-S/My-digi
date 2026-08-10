-- ============================================================
-- Studium Labs — Supabase Postgres schema
-- Run this file inside Supabase Dashboard → SQL Editor → New query
-- Safe to run multiple times (uses IF NOT EXISTS / ON CONFLICT).
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- Enums ----------
do $$ begin
  create type public.user_role as enum ('student','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_status as enum ('pending','paid','failed','refunded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.project_status as enum ('draft','published','archived');
exception when duplicate_object then null; end $$;

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  mobile text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  description text,
  icon text,
  created_at timestamptz not null default now()
);

-- ---------- projects ----------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  short_description text not null,
  description text,
  category text not null,
  complexity text not null,
  suitable_years text[] not null default '{}',
  technologies text[] not null default '{}',
  features text[] not null default '{}',
  deliverables text[] not null default '{}',
  learning_outcomes text[] not null default '{}',
  price integer not null check (price >= 0),
  discount_price integer check (discount_price is null or discount_price >= 0),
  accent text default '#244B74',
  thumbnail_path text,
  preview_video_path text,
  source_zip_path text,
  status public.project_status not null default 'published',
  featured boolean not null default false,
  popular boolean not null default false,
  seo_title text,
  seo_description text,
  views_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists projects_status_idx on public.projects(status);
create index if not exists projects_category_idx on public.projects(category);

-- ---------- orders ----------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  amount_paise integer not null check (amount_paise >= 0),
  currency text not null default 'INR',
  status public.order_status not null default 'pending',
  razorpay_order_id text,
  razorpay_payment_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_buyer_idx on public.orders(buyer_id);

-- ---------- order_items ----------
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  price_paise integer not null check (price_paise >= 0)
);

-- ---------- purchases (entitlements) ----------
create table if not exists public.purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (buyer_id, project_id)
);
create index if not exists purchases_buyer_idx on public.purchases(buyer_id);

-- ---------- analytics events ----------
create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  project_id uuid references public.projects(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- ---------- site settings ----------
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Trigger: create profile row automatically on new auth user
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, mobile)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.raw_user_meta_data->>'mobile'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.projects           enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.purchases          enable row level security;
alter table public.analytics_events   enable row level security;
alter table public.site_settings      enable row level security;

-- Helper: is the current auth.uid() an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- profiles ------------------------------------------------
drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- categories ----------------------------------------------
drop policy if exists categories_public_read on public.categories;
create policy categories_public_read on public.categories
  for select to anon, authenticated using (true);

drop policy if exists categories_admin_write on public.categories;
create policy categories_admin_write on public.categories
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- projects ------------------------------------------------
drop policy if exists projects_public_read on public.projects;
create policy projects_public_read on public.projects
  for select to anon, authenticated
  using (status = 'published' or public.is_admin());

drop policy if exists projects_admin_write on public.projects;
create policy projects_admin_write on public.projects
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- orders --------------------------------------------------
drop policy if exists orders_buyer_read on public.orders;
create policy orders_buyer_read on public.orders
  for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin());

drop policy if exists orders_buyer_insert on public.orders;
create policy orders_buyer_insert on public.orders
  for insert to authenticated with check (buyer_id = auth.uid());

drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- order_items ---------------------------------------------
drop policy if exists order_items_read on public.order_items;
create policy order_items_read on public.order_items
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or public.is_admin()))
  );

drop policy if exists order_items_buyer_insert on public.order_items;
create policy order_items_buyer_insert on public.order_items
  for insert to authenticated
  with check (
    exists (select 1 from public.orders o where o.id = order_id and o.buyer_id = auth.uid())
  );

-- purchases -----------------------------------------------
drop policy if exists purchases_buyer_read on public.purchases;
create policy purchases_buyer_read on public.purchases
  for select to authenticated
  using (buyer_id = auth.uid() or public.is_admin());

drop policy if exists purchases_admin_write on public.purchases;
create policy purchases_admin_write on public.purchases
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- analytics_events ----------------------------------------
drop policy if exists analytics_insert on public.analytics_events;
create policy analytics_insert on public.analytics_events
  for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists analytics_admin_read on public.analytics_events;
create policy analytics_admin_read on public.analytics_events
  for select to authenticated
  using (public.is_admin());

-- site_settings -------------------------------------------
drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read on public.site_settings
  for select to anon, authenticated using (true);

drop policy if exists site_settings_admin_write on public.site_settings;
create policy site_settings_admin_write on public.site_settings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- Storage buckets
-- ============================================================
insert into storage.buckets (id, name, public)
values ('thumbnails','thumbnails',true), ('source-zips','source-zips',false)
on conflict (id) do update set public = excluded.public;

-- Public read for thumbnails bucket (already public, kept for clarity).
-- Source zips require a backend-issued signed URL.

-- ============================================================
-- Seed categories
-- ============================================================
insert into public.categories (name, slug) values
  ('AI / ML','ai-ml'),
  ('Generative AI','generative-ai'),
  ('Computer Vision','computer-vision'),
  ('Full Stack','full-stack'),
  ('Data Science','data-science'),
  ('NLP','nlp')
on conflict (slug) do nothing;

-- ============================================================
-- Seed sample projects (idempotent by slug)
-- ============================================================
insert into public.projects (slug,title,short_description,description,category,complexity,suitable_years,technologies,features,deliverables,learning_outcomes,price,discount_price,accent,featured,popular,status)
values
('neural-notes','Neural Notes',
 'A production-minded study assistant that turns lecture notes into searchable knowledge.',
 'Build a focused retrieval system for students: index notes, ask grounded questions, and understand the evaluation loop behind useful AI.',
 'AI / ML','Intermediate',ARRAY['3rd Year','Final Year'],ARRAY['Python','FastAPI','LangChain'],
 ARRAY['Document ingestion pipeline','Semantic search with citations','FastAPI service layer','Evaluation checklist'],
 ARRAY['Source code','Setup guide','Project report','Video walkthrough','Viva questions'],
 ARRAY['Design an AI retrieval workflow','Ship a clean API','Explain model limitations'],
 1499,999,'#244B74',true,true,'published'),
('vision-counter','Vision Counter',
 'Count objects in live video with an explainable OpenCV pipeline.',
 'A camera-first computer vision project for understanding detection, tracking and the trade-offs behind real-time inference.',
 'Computer Vision','Advanced',ARRAY['Final Year','MCA'],ARRAY['Python','OpenCV','YOLO'],
 ARRAY['Live camera inference','Object tracking','Exportable results','Performance controls'],
 ARRAY['Source code','Architecture diagram','Project report','Presentation deck','Video walkthrough'],
 ARRAY['Understand CV pipelines','Tune inference speed','Present measurable results'],
 1899,1299,'#E4572E',true,true,'published'),
('campus-pulse','Campus Pulse',
 'A complete campus services platform with role-based workflows and analytics.',
 'Design and ship a multi-role campus platform where students, staff and coordinators move work forward with clarity.',
 'Full Stack','Intermediate',ARRAY['2nd Year','3rd Year'],ARRAY['React','FastAPI','MongoDB'],
 ARRAY['Role-based workspaces','Searchable requests','Analytics overview','Responsive UI'],
 ARRAY['Source code','Documentation','Setup guide','Presentation deck'],
 ARRAY['Model product workflows','Build reusable React UI','Connect frontend and backend'],
 1299,899,'#2F6B4F',true,false,'published'),
('genai-studio','GenAI Studio',
 'A prompt lab for comparing outputs, evaluating quality and building reusable workflows.',
 'Explore practical generative AI patterns through a polished workspace for prompt experiments and evaluation notes.',
 'Generative AI','Beginner',ARRAY['2nd Year','General Academic'],ARRAY['React','Python','LLM APIs'],
 ARRAY['Prompt versioning','Side-by-side comparison','Evaluation rubric','Exportable experiments'],
 ARRAY['Source code','Setup guide','Learning notes','Video walkthrough'],
 ARRAY['Write better prompts','Evaluate model outputs','Document experiments'],
 999,699,'#A66A16',false,true,'published'),
('insight-board','Insight Board',
 'Turn messy CSVs into a decision-ready analytics board with clear narratives.',
 'A practical data science project that takes a raw dataset from cleaning through visual analysis and presentation.',
 'Data Science','Beginner',ARRAY['1st Year','2nd Year'],ARRAY['Python','Pandas','Plotly'],
 ARRAY['Data cleaning workflow','Interactive charts','Insight summaries','Exportable report'],
 ARRAY['Notebook','Project report','Presentation deck','Dataset guide'],
 ARRAY['Clean real datasets','Choose useful charts','Tell a data story'],
 799,599,'#65717A',false,false,'published'),
('voice-command-nlp','Voice Command NLP',
 'Classify voice commands and turn them into an accessible assistant prototype.',
 'Learn the full path from speech transcription to intent classification with a compact, demonstrable NLP project.',
 'NLP','Intermediate',ARRAY['3rd Year','MCA'],ARRAY['Python','NLP','Whisper'],
 ARRAY['Intent classification','Confidence states','Command history','Accessible feedback'],
 ARRAY['Source code','Setup guide','Project report','Viva questions'],
 ARRAY['Prepare language data','Evaluate intent models','Design voice-first feedback'],
 1199,849,'#244B74',false,false,'published')
on conflict (slug) do nothing;

-- ============================================================
-- Bootstrap admin: renusrisiva@gmail.com
-- Run this AFTER the admin has signed up once through the app.
-- Safe to re-run.
-- ============================================================
update public.profiles p
   set role = 'admin', updated_at = now()
  from auth.users u
 where p.id = u.id
   and lower(u.email) = lower('renusrisiva@gmail.com');

-- Verify (optional):
-- select id, email, role from public.profiles where role = 'admin';
