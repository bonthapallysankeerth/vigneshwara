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

insert into public.festival_programs (day_number, date, title, description, start_time, end_time, location)
select day_number, date '2026-09-14' + (day_number - 1), title, 'Community temple festival program', '6:00 PM', '9:00 PM', 'Community temple grounds'
from (values (1, 'Ganesh Idol Installation'), (2, 'Vedic Pooja & Prasadam'), (3, 'Cultural Program'), (4, 'Bhajans & Harathi'), (5, 'Children''s Games'), (6, 'Traditional Dance'), (7, 'Community Annadanam'), (8, 'Youth Cultural Night'), (9, 'Grand Harathi'), (10, 'Ganesh Visarjan')) as programs(day_number, title)
where not exists (select 1 from public.festival_programs);

alter table public.team_members enable row level security;
alter table public.chandha enable row level security;
alter table public.expenses enable row level security;
alter table public.sponsors enable row level security;
alter table public.budget enable row level security;
alter table public.festival_programs enable row level security;

create policy "authenticated users can manage team members" on public.team_members for all to authenticated using (true) with check (true);
create policy "authenticated users can manage chandha" on public.chandha for all to authenticated using (true) with check (true);
create policy "authenticated users can manage expenses" on public.expenses for all to authenticated using (true) with check (true);
create policy "authenticated users can manage sponsors" on public.sponsors for all to authenticated using (true) with check (true);
create policy "authenticated users can manage budget" on public.budget for all to authenticated using (true) with check (true);
create policy "authenticated users can manage festival programs" on public.festival_programs for all to authenticated using (true) with check (true);

alter publication supabase_realtime add table public.chandha, public.expenses, public.sponsors, public.budget, public.festival_programs;