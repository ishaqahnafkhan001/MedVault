-- Run once in the Supabase SQL editor. The API and worker use the server-only
-- service role; the browser never accesses Storage directly.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'medical-documents',
  'medical-documents',
  false,
  15728640,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Defense in depth: no direct authenticated-browser object access. The API
-- performs ownership checks and issues short-lived signed URLs.
drop policy if exists "medical documents direct select" on storage.objects;
drop policy if exists "medical documents direct insert" on storage.objects;
drop policy if exists "medical documents direct update" on storage.objects;
drop policy if exists "medical documents direct delete" on storage.objects;
