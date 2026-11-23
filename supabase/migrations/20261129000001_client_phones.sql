-- Fast phone entry: set a client's phone and WhatsApp number without touching anything else.
-- Safe to run twice (paste-once SQL for the live database).
create or replace function public.set_client_phones(p_client_id uuid, p_phone text, p_whatsapp text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.require_app_user();
  update public.clients set phone = p_phone, whatsapp_phone = p_whatsapp where id = p_client_id;
  if not found then raise exception 'Client not found' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.set_client_phones(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_client_phones(uuid, text, text) to authenticated;
