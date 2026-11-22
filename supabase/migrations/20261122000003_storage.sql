-- Private storage buckets. Files are reached only through signed URLs by app users.
insert into storage.buckets (id, name, public)
values ('challans', 'challans', false), ('receipts', 'receipts', false), ('branding', 'branding', false)
on conflict (id) do nothing;

create policy "app users read app buckets" on storage.objects for select to authenticated
  using (bucket_id in ('challans', 'receipts', 'branding') and public.is_app_user());
create policy "app users upload to app buckets" on storage.objects for insert to authenticated
  with check (bucket_id in ('challans', 'receipts', 'branding') and public.is_app_user());
-- Branding (logo/signature) may be replaced; challans and receipts may not.
create policy "app users replace branding" on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_app_user());
