-- PACE | Banco de Erros do Sequor
-- Execute este script no SQL Editor do seu projeto Supabase.

create table if not exists public.erros_pace (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null,
  image_path text,
  cause text,
  resolution text,
  status text not null default 'Em investigação'
    check (status in ('Em investigação', 'Pendente', 'Solucionado')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.erros_pace enable row level security;

drop policy if exists "Usuário consulta os próprios erros" on public.erros_pace;
create policy "Usuário consulta os próprios erros"
  on public.erros_pace for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Usuário cadastra os próprios erros" on public.erros_pace;
create policy "Usuário cadastra os próprios erros"
  on public.erros_pace for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Usuário altera os próprios erros" on public.erros_pace;
create policy "Usuário altera os próprios erros"
  on public.erros_pace for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Usuário exclui os próprios erros" on public.erros_pace;
create policy "Usuário exclui os próprios erros"
  on public.erros_pace for delete to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('pace-anexos', 'pace-anexos', false)
on conflict (id) do nothing;

drop policy if exists "Usuário visualiza seus anexos PACE" on storage.objects;
create policy "Usuário visualiza seus anexos PACE"
  on storage.objects for select to authenticated
  using (bucket_id = 'pace-anexos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Usuário envia seus anexos PACE" on storage.objects;
create policy "Usuário envia seus anexos PACE"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pace-anexos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Usuário altera seus anexos PACE" on storage.objects;
create policy "Usuário altera seus anexos PACE"
  on storage.objects for update to authenticated
  using (bucket_id = 'pace-anexos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'pace-anexos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Usuário exclui seus anexos PACE" on storage.objects;
create policy "Usuário exclui seus anexos PACE"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pace-anexos' and (storage.foldername(name))[1] = auth.uid()::text);
