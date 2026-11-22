-- Default business configuration. Contact details (phone, address, map link)
-- are entered in Settings, not committed to the repository.

insert into public.partners (code, name, full_name) values
  ('A', 'Alok', 'Alok'),
  ('R', 'Rajeev', 'Rajeev Kumar Mishra')
on conflict (code) do nothing;

insert into public.split_rules (effective_from, partner_id, percent)
select date '2025-04-01', id, 50 from public.partners where code in ('A', 'R')
on conflict do nothing;

insert into public.settings (id, business_name_en, business_name_hi)
values (1, 'Rajeev Kumar Mishra', 'राजीव कुमार मिश्रा')
on conflict (id) do nothing;

insert into public.message_templates (key, language, body) values
('dues_we_pay', 'hi', E'नमस्ते {owner_name} जी,\n{firm_name} का {month} का PF/ESIC विवरण:\nPF: ₹{pf}\nESIC: ₹{esic}\nसेवा शुल्क: ₹{charge}\nकुल देय राशि: ₹{total_due}\nकृपया {pay_by} तक भुगतान करें ताकि चालान समय पर जमा हो सके।\nधन्यवाद\n{business_name}'),
('dues_we_pay', 'en', E'Namaste {owner_name} ji,\nPF/ESIC details for {firm_name}, {month}:\nPF: ₹{pf}\nESIC: ₹{esic}\nService charge: ₹{charge}\nTotal payable: ₹{total_due}\nPlease pay by {pay_by} so the challan can be filed on time.\nThank you\n{business_name}'),
('challan_ready_client_pays', 'hi', E'नमस्ते {owner_name} जी,\n{firm_name} का {month} का चालान तैयार है।\nPF: ₹{pf}   ESIC: ₹{esic}\nकृपया {due_date} से पहले चालान जमा करें और रसीद हमें भेज दें।\nहमारा सेवा शुल्क: ₹{charge}\nधन्यवाद\n{business_name}'),
('challan_ready_client_pays', 'en', E'Namaste {owner_name} ji,\nThe {month} challan for {firm_name} is ready.\nPF: ₹{pf}   ESIC: ₹{esic}\nPlease pay the challan before {due_date} and send us the receipt.\nOur service charge: ₹{charge}\nThank you\n{business_name}'),
('payment_received', 'hi', E'नमस्ते {owner_name} जी,\n{firm_name} से ₹{amount} प्राप्त हुए, {date}, {mode}। रसीद संलग्न है। धन्यवाद।\n{business_name}'),
('payment_received', 'en', E'Namaste {owner_name} ji,\nReceived ₹{amount} from {firm_name} on {date} by {mode}. The receipt is attached. Thank you.\n{business_name}'),
('challan_filed', 'hi', E'नमस्ते {owner_name} जी,\n{firm_name} का {month} का PF/ESIC चालान {paid_on} को जमा हो गया है।\nPF TRRN: {pf_trrn}\nESIC चालान नं.: {esic_challan_no}\nधन्यवाद\n{business_name}'),
('challan_filed', 'en', E'Namaste {owner_name} ji,\nThe {month} PF/ESIC challan for {firm_name} was filed on {paid_on}.\nPF TRRN: {pf_trrn}\nESIC challan no.: {esic_challan_no}\nThank you\n{business_name}'),
('overdue', 'hi', E'नमस्ते {owner_name} जी,\n{firm_name} की ₹{balance} राशि अभी बकाया है ({months})।\nदेर से चालान जमा करने पर सरकार ब्याज और जुर्माना लगाती है, इसलिए कृपया जल्द भुगतान करें।\nधन्यवाद\n{business_name}'),
('overdue', 'en', E'Namaste {owner_name} ji,\n₹{balance} is still outstanding for {firm_name} ({months}).\nLate filing brings government interest and penalty, so please pay at your earliest.\nThank you\n{business_name}')
on conflict (key, language) do nothing;
