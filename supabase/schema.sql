create extension if not exists pgcrypto;

create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  youth_name text not null,
  role text not null check (role in ('admin', 'youth')),
  association_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists association_id uuid;
alter table public.user_profiles add column if not exists admin_email text;
alter table public.user_profiles add column if not exists youth_email text;

alter table public.user_profiles enable row level security;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, youth_name, role, association_id, admin_email, youth_email)
  values (new.id, coalesce(new.raw_user_meta_data->>'youth_name', 'Youth Association'), coalesce(new.raw_user_meta_data->>'role', 'youth'), coalesce((new.raw_user_meta_data->>'association_id')::uuid, new.id), new.raw_user_meta_data->>'admin_email', new.raw_user_meta_data->>'youth_email')
  on conflict (id) do update set youth_name = excluded.youth_name, role = excluded.role, association_id = excluded.association_id, admin_email = excluded.admin_email, youth_email = excluded.youth_email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_user_profile();

insert into public.user_profiles (id, youth_name, role, association_id, admin_email, youth_email)
select id, coalesce(raw_user_meta_data->>'youth_name', 'Youth Association'), coalesce(raw_user_meta_data->>'role', 'admin'), coalesce((raw_user_meta_data->>'association_id')::uuid, id), raw_user_meta_data->>'admin_email', raw_user_meta_data->>'youth_email'
from auth.users
where not exists (select 1 from public.user_profiles where user_profiles.id = auth.users.id);

update public.user_profiles profile
set admin_email = users.raw_user_meta_data->>'admin_email', youth_email = users.raw_user_meta_data->>'youth_email'
from auth.users users
where profile.id = users.id and (profile.admin_email is null or profile.youth_email is null);

update public.user_profiles set association_id = id where association_id is null;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_profiles where id = auth.uid() and role = 'admin'); $$;

create or replace function public.current_association_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select coalesce(association_id, id) from public.user_profiles where id = auth.uid(); $$;

drop policy if exists "users can view own profile" on public.user_profiles;
drop policy if exists "users can view association profiles" on public.user_profiles;
create policy "users can view association profiles" on public.user_profiles for select to authenticated using (association_id = public.current_association_id());

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Team Member',
  team_name text,
  photo_url text,
  photo_position text not null default 'center',
  created_by uuid references auth.users(id),
  owner_id uuid,
  created_at timestamptz not null default now()
);
alter table public.team_members add column if not exists photo_url text;
alter table public.team_members add column if not exists team_name text;
alter table public.team_members add column if not exists photo_position text not null default 'center';
alter table public.team_members add column if not exists owner_id uuid;
alter table public.team_members add column if not exists created_by uuid references auth.users(id);

create table if not exists public.chandha (
  id uuid primary key default gen_random_uuid(), person_name text not null, mobile text,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Received' check (status in ('Received', 'Pending')),
  date date not null default current_date, note text, created_by uuid references auth.users(id), owner_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), title text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0), category text, note text,
  spent_by uuid references public.team_members(id), date date not null default current_date,
  created_by uuid references auth.users(id), owner_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(), name text not null, item text,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Received' check (status in ('Received', 'Pending')),
  date date not null default current_date, note text, created_by uuid references auth.users(id), owner_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.budget (
  id uuid primary key default gen_random_uuid(), total_budget numeric(12,2) not null default 0 check (total_budget >= 0), owner_id uuid,
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);

create table if not exists public.festival_programs (
  id uuid primary key default gen_random_uuid(), day_number integer not null, date date, title text not null,
  description text, start_time text, end_time text, location text, status text default 'Planned',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), owner_id uuid
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  person_name text not null,
  purpose_name text not null,
  mobile text,
  full_payment numeric(12,2) not null default 0 check (full_payment >= 0),
  advance_paid numeric(12,2) not null default 0 check (advance_paid >= 0),
  balance_amount numeric(12,2) generated always as (full_payment - advance_paid) stored,
  created_by uuid references auth.users(id), owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chandha add column if not exists owner_id uuid;
alter table public.expenses add column if not exists owner_id uuid;
alter table public.sponsors add column if not exists owner_id uuid;
alter table public.budget add column if not exists owner_id uuid;
alter table public.festival_programs add column if not exists owner_id uuid;
alter table public.bookings add column if not exists owner_id uuid;

do $$
declare
  legacy_owner uuid;
begin
  select id into legacy_owner from auth.users order by created_at limit 1;
  if legacy_owner is not null then
    update public.team_members set owner_id = legacy_owner where owner_id is null;
    update public.chandha set owner_id = coalesce(owner_id, created_by, legacy_owner) where owner_id is null;
    update public.expenses set owner_id = coalesce(owner_id, created_by, legacy_owner) where owner_id is null;
    update public.sponsors set owner_id = coalesce(owner_id, created_by, legacy_owner) where owner_id is null;
    update public.budget set owner_id = coalesce(owner_id, updated_by, legacy_owner) where owner_id is null;
    update public.festival_programs set owner_id = legacy_owner where owner_id is null;
    update public.bookings set owner_id = coalesce(owner_id, created_by, legacy_owner) where owner_id is null;
  end if;
end $$;

update public.expenses
set spent_by = null
where spent_by in (select id from public.team_members where name in ('Vijay Kumar', 'S Sai Kishore', 'Venu Gopal', 'Mani', 'Revanth', 'Nani Anil', 'Ibrahim', 'Ganesh', 'Naveen', 'Nithin', 'Pranay', 'Akshay', 'Sankeerth', 'Varshith', 'Naveen DRC', 'Jagadish', 'Pavan', 'Vikas', 'Jithender', 'Nagu', 'Lalli'));
delete from public.team_members
where name in ('Vijay Kumar', 'S Sai Kishore', 'Venu Gopal', 'Mani', 'Revanth', 'Nani Anil', 'Ibrahim', 'Ganesh', 'Naveen', 'Nithin', 'Pranay', 'Akshay', 'Sankeerth', 'Varshith', 'Naveen DRC', 'Jagadish', 'Pavan', 'Vikas', 'Jithender', 'Nagu', 'Lalli');

create index if not exists chandha_status_idx on public.chandha(status);
create index if not exists expenses_spent_by_idx on public.expenses(spent_by);
create index if not exists expenses_category_idx on public.expenses(category);
create index if not exists sponsors_status_idx on public.sponsors(status);
create index if not exists festival_programs_day_idx on public.festival_programs(day_number);

insert into public.budget (total_budget, owner_id)
select 0, id from auth.users
where not exists (select 1 from public.budget)
order by created_at limit 1;

delete from public.festival_programs
where description = 'Community temple festival program'
  and title in ('Ganesh Idol Installation', 'Vedic Pooja & Prasadam', 'Cultural Program', 'Bhajans & Harathi', 'Children''s Games', 'Traditional Dance', 'Community Annadanam', 'Youth Cultural Night', 'Grand Harathi', 'Ganesh Visarjan');

alter table public.team_members enable row level security;
alter table public.chandha enable row level security;
alter table public.expenses enable row level security;
alter table public.sponsors enable row level security;
alter table public.budget enable row level security;
alter table public.festival_programs enable row level security;
alter table public.bookings enable row level security;

drop policy if exists "authenticated users can manage team members" on public.team_members;
drop policy if exists "authenticated users can manage chandha" on public.chandha;
drop policy if exists "authenticated users can manage expenses" on public.expenses;
drop policy if exists "authenticated users can manage sponsors" on public.sponsors;
drop policy if exists "authenticated users can manage budget" on public.budget;
drop policy if exists "authenticated users can manage festival programs" on public.festival_programs;
drop policy if exists "authenticated users can manage bookings" on public.bookings;
drop policy if exists "authenticated users can read team members" on public.team_members;
drop policy if exists "admins can manage team members" on public.team_members;
drop policy if exists "authenticated users can read chandha" on public.chandha;
drop policy if exists "admins can manage chandha" on public.chandha;
drop policy if exists "authenticated users can read expenses" on public.expenses;
drop policy if exists "admins can manage expenses" on public.expenses;
drop policy if exists "authenticated users can read sponsors" on public.sponsors;
drop policy if exists "admins can manage sponsors" on public.sponsors;
drop policy if exists "authenticated users can read budget" on public.budget;
drop policy if exists "admins can manage budget" on public.budget;
drop policy if exists "authenticated users can read festival programs" on public.festival_programs;
drop policy if exists "admins can manage festival programs" on public.festival_programs;
drop policy if exists "authenticated users can read bookings" on public.bookings;
drop policy if exists "admins can manage bookings" on public.bookings;

create policy "authenticated users can read team members" on public.team_members for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage team members" on public.team_members for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());
create policy "authenticated users can read chandha" on public.chandha for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage chandha" on public.chandha for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());
create policy "authenticated users can read expenses" on public.expenses for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage expenses" on public.expenses for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());
create policy "authenticated users can read sponsors" on public.sponsors for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage sponsors" on public.sponsors for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());
create policy "authenticated users can read budget" on public.budget for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage budget" on public.budget for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());
create policy "authenticated users can read festival programs" on public.festival_programs for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage festival programs" on public.festival_programs for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());
create policy "authenticated users can read bookings" on public.bookings for select to authenticated using (owner_id = public.current_association_id());
create policy "admins can manage bookings" on public.bookings for all to authenticated using (owner_id = public.current_association_id() and public.is_admin()) with check (owner_id = public.current_association_id() and public.is_admin());

do $$
declare
  target_table text;
begin
  foreach target_table in array array['chandha', 'expenses', 'sponsors', 'budget', 'festival_programs', 'bookings'] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and pg_publication_tables.tablename = target_table
    ) then
      execute format('alter publication supabase_realtime add table %I.%I', 'public', target_table);
    end if;
  end loop;
end $$;