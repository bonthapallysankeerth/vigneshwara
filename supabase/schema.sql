create extension if not exists pgcrypto;

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null default 'Team Member',
  created_at timestamptz not null default now()
);

create table if not exists public.chandha (
  id uuid primary key default gen_random_uuid(), person_name text not null, mobile text,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Received' check (status in ('Received', 'Pending')),
  date date not null default current_date, note text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), title text not null,
  amount numeric(12,2) not null default 0 check (amount >= 0), category text, note text,
  spent_by uuid references public.team_members(id), date date not null default current_date,
  created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.sponsors (
  id uuid primary key default gen_random_uuid(), name text not null, item text,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  status text not null default 'Received' check (status in ('Received', 'Pending')),
  date date not null default current_date, note text, created_by uuid references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.budget (
  id uuid primary key default gen_random_uuid(), total_budget numeric(12,2) not null default 0 check (total_budget >= 0),
  updated_by uuid references auth.users(id), updated_at timestamptz not null default now()
);

create table if not exists public.festival_programs (
  id uuid primary key default gen_random_uuid(), day_number integer not null, date date, title text not null,
  description text, start_time text, end_time text, location text, status text default 'Planned',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create index if not exists chandha_status_idx on public.chandha(status);
create index if not exists expenses_spent_by_idx on public.expenses(spent_by);
create index if not exists expenses_category_idx on public.expenses(category);
create index if not exists sponsors_status_idx on public.sponsors(status);
create index if not exists festival_programs_day_idx on public.festival_programs(day_number);

insert into public.team_members (name, role)
select name, role from (values
  ('Vijay Kumar', 'President'), ('S Sai Kishore', 'Team Member'), ('Venu Gopal', 'Team Member'), ('Mani', 'Team Member'), ('Revanth', 'Team Member'), ('Nani Anil', 'Team Member'), ('Ibrahim', 'Team Member'), ('Ganesh', 'Team Member'), ('Naveen', 'Team Member'), ('Nithin', 'Team Member'), ('Pranay', 'Team Member'), ('Akshay', 'Team Member'), ('Sankeerth', 'Team Member'), ('Naveen', 'Team Member'), ('Varshith', 'Team Member'), ('Naveen DRC', 'Team Member'), ('Jagadish', 'Team Member'), ('Pavan', 'Team Member'), ('Vikas', 'Team Member'), ('Jithender', 'Team Member'), ('Nagu', 'Team Member'), ('Lalli', 'Team Member')
) as seed(name, role)
where not exists (select 1 from public.team_members);

insert into public.budget (total_budget) select 0 where not exists (select 1 from public.budget);

delete from public.festival_programs
where description = 'Community temple festival program'
  and title in ('Ganesh Idol Installation', 'Vedic Pooja & Prasadam', 'Cultural Program', 'Bhajans & Harathi', 'Children''s Games', 'Traditional Dance', 'Community Annadanam', 'Youth Cultural Night', 'Grand Harathi', 'Ganesh Visarjan');

alter table public.team_members enable row level security;
alter table public.chandha enable row level security;
alter table public.expenses enable row level security;
alter table public.sponsors enable row level security;
alter table public.budget enable row level security;
alter table public.festival_programs enable row level security;

drop policy if exists "authenticated users can manage team members" on public.team_members;
drop policy if exists "authenticated users can manage chandha" on public.chandha;
drop policy if exists "authenticated users can manage expenses" on public.expenses;
drop policy if exists "authenticated users can manage sponsors" on public.sponsors;
drop policy if exists "authenticated users can manage budget" on public.budget;
drop policy if exists "authenticated users can manage festival programs" on public.festival_programs;

create policy "authenticated users can manage team members" on public.team_members for all to authenticated using (true) with check (true);
create policy "authenticated users can manage chandha" on public.chandha for all to authenticated using (true) with check (true);
create policy "authenticated users can manage expenses" on public.expenses for all to authenticated using (true) with check (true);
create policy "authenticated users can manage sponsors" on public.sponsors for all to authenticated using (true) with check (true);
create policy "authenticated users can manage budget" on public.budget for all to authenticated using (true) with check (true);
create policy "authenticated users can manage festival programs" on public.festival_programs for all to authenticated using (true) with check (true);

do $$
declare
  target_table text;
begin
  foreach target_table in array array['chandha', 'expenses', 'sponsors', 'budget', 'festival_programs'] loop
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