-- Excel lines like "PF & ESIC MAY-26 ₹500" are a monthly fee collected late, not a one-off job.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.extra_charges'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%service_type%'
  loop
    execute format('alter table public.extra_charges drop constraint %I', c);
  end loop;
end $$;

alter table public.extra_charges add constraint extra_charges_service_type check (service_type in
  ('pf_claim', 'registration', 'appointment_letter', 'pf_password', 'pf_card', 'challan', 'monthly_fee', 'other'));
