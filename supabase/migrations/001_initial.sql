-- Dấu Ấn Kết Nối — Supabase/PostgreSQL 15
create extension if not exists vector with schema extensions;
create type public.user_role as enum ('admin','editor');
create type public.event_status as enum ('draft','processing','ready','active','inactive','failed');
create type public.event_visibility as enum ('unlisted','public');

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, display_name text, role public.user_role not null default 'editor',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete cascade,
 slug text not null unique check(slug~'^[a-z0-9]+(?:-[a-z0-9]+)*$'), title text not null check(length(title)<=160),
 partner_name text not null default '', event_date date not null, description text not null default '',
 status public.event_status not null default 'draft', visibility public.event_visibility not null default 'unlisted',
 reference_image_path text, thumbnail_path text, video_path text, target_path text,
 image_width integer, image_height integer, video_duration real, video_width integer, video_height integer,
 embedding extensions.vector(384), embedding_model text, embedding_version text, embedding_dimension integer,
 preprocessing jsonb not null default '{}', local_descriptors jsonb,
 best_video_frame_time real, registration_similarity real, feature_match_count integer, inlier_count integer, inlier_ratio real,
 processing_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), activated_at timestamptz,
 constraint active_requires_assets check(status<>'active' or(reference_image_path is not null and video_path is not null and target_path is not null and embedding is not null))
);
create table public.event_processing_jobs(id uuid primary key default gen_random_uuid(),event_id uuid not null references public.events(id) on delete cascade,stage text not null,status text not null check(status in('queued','running','succeeded','failed')),progress smallint default 0 check(progress between 0 and 100),detail jsonb default '{}',error text,created_at timestamptz default now(),updated_at timestamptz default now());
create index events_owner_idx on public.events(owner_id);create index events_active_idx on public.events(status) where status='active';create index events_embedding_hnsw on public.events using hnsw(embedding extensions.vector_cosine_ops);

create function public.is_system_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and role='admin')$$;
create function public.touch_updated_at() returns trigger language plpgsql as $$begin new.updated_at=now();if new.status='active' and old.status is distinct from 'active' then new.activated_at=now();end if;return new;end$$;
create trigger events_touch before update on public.events for each row execute function public.touch_updated_at();
create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path=public as $$begin insert into profiles(id,email,display_name) values(new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',split_part(new.email,'@',1)));return new;end$$;
create trigger auth_user_created after insert on auth.users for each row execute function public.on_auth_user_created();

create view public.public_events with(security_invoker=true) as select id,slug,title,partner_name,event_date,description,status,visibility,reference_image_path,thumbnail_path,video_path,target_path,image_width,image_height,video_duration,video_width,video_height,created_at,updated_at from public.events where status='active';
create function public.match_active_events(query_embedding extensions.vector(384),match_count integer default 3)
returns table(id uuid,slug text,score real,thumbnail_path text,target_path text) language sql stable security definer set search_path=public,extensions as $$select e.id,e.slug,(1-(e.embedding<=>query_embedding))::real,e.thumbnail_path,e.target_path from events e where e.status='active' and e.embedding is not null order by e.embedding<=>query_embedding limit least(greatest(match_count,1),5)$$;
revoke all on function public.match_active_events(extensions.vector,integer) from public;grant execute on function public.match_active_events(extensions.vector,integer) to anon,authenticated;

alter table profiles enable row level security;alter table events enable row level security;alter table event_processing_jobs enable row level security;
create policy "profile self read" on profiles for select to authenticated using(id=auth.uid() or is_system_admin());
create policy "profile self update" on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy "active events public read" on events for select to anon using(status='active');
create policy "owners read" on events for select to authenticated using(owner_id=auth.uid() or is_system_admin());
create policy "owners insert" on events for insert to authenticated with check(owner_id=auth.uid() or is_system_admin());
create policy "owners update" on events for update to authenticated using(owner_id=auth.uid() or is_system_admin()) with check(owner_id=auth.uid() or is_system_admin());
create policy "owners delete" on events for delete to authenticated using(owner_id=auth.uid() or is_system_admin());
create policy "owners jobs" on event_processing_jobs for all to authenticated using(exists(select 1 from events e where e.id=event_id and(e.owner_id=auth.uid() or is_system_admin()))) with check(exists(select 1 from events e where e.id=event_id and(e.owner_id=auth.uid() or is_system_admin())));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('reference-images','reference-images',false,12582912,array['image/jpeg','image/png','image/webp']),
('thumbnails','thumbnails',false,5242880,array['image/jpeg','image/webp']),
('videos','videos',false,157286400,array['video/mp4']),
('ar-targets','ar-targets',false,20971520,array['application/octet-stream']),
('qr-codes','qr-codes',false,5242880,array['image/png','image/svg+xml']),
('print-assets','print-assets',false,52428800,array['image/png','image/svg+xml','application/pdf']) on conflict(id) do nothing;
create policy "owner upload assets" on storage.objects for insert to authenticated with check(bucket_id in('reference-images','thumbnails','videos','ar-targets','qr-codes','print-assets') and (storage.foldername(name))[1]=auth.uid()::text);
create policy "owner manage assets" on storage.objects for all to authenticated using((storage.foldername(name))[1]=auth.uid()::text or is_system_admin()) with check((storage.foldername(name))[1]=auth.uid()::text or is_system_admin());
create policy "public active assets" on storage.objects for select to anon using(exists(select 1 from events e where e.status='active' and(name=e.reference_image_path or name=e.thumbnail_path or name=e.video_path or name=e.target_path)));
