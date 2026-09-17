-- Getränkekasse – Supabase Schema
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  pin_hash text,
  created_at timestamptz not null default now()
);

create table if not exists drinks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  price numeric(10,2) not null check (price >= 0),
  icon text not null default '🥤',
  active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  drink_id uuid references drinks(id) on delete set null,
  drink_name text not null,
  price numeric(10,2) not null,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

insert into users(name) values ('Julien Ehrlich') on conflict (name) do nothing;
insert into drinks(name,price,icon,sort_order) values
('Alkoholfreies Bier',1.00,'🍺',1),('Budweiser',1.00,'🍺',2),('Dose',0.60,'🥫',3),
('Krombacher',1.00,'🍺',4),('Paulaner Spezi',1.00,'🥤',5),('Porter',1.00,'🍺',6),
('Radeberger',1.00,'🍺',7),('Radler',1.00,'🍺',8),('Wasser',0.50,'💧',9)
on conflict (name) do update set price=excluded.price, icon=excluded.icon, sort_order=excluded.sort_order;

alter table users enable row level security;
alter table drinks enable row level security;
alter table bookings enable row level security;

-- Für diese private Klein-App: Zugriff über den anonymen Supabase-Key.
-- Wer die URL kennt, kann technisch auf die API zugreifen. Für höhere Sicherheit
-- später Supabase Auth / Edge Functions ergänzen.
drop policy if exists "public read users" on users;
create policy "public read users" on users for select using (true);
drop policy if exists "public update users" on users;
create policy "public update users" on users for update using (true) with check (true);
drop policy if exists "public read drinks" on drinks;
create policy "public read drinks" on drinks for select using (true);
drop policy if exists "public read bookings" on bookings;
create policy "public read bookings" on bookings for select using (true);
drop policy if exists "public insert bookings" on bookings;
create policy "public insert bookings" on bookings for insert with check (true);
drop policy if exists "public update bookings" on bookings;
create policy "public update bookings" on bookings for update using (true) with check (true);
