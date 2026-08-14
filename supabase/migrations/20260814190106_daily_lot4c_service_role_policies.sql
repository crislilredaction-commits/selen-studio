create policy "Service role manages Daily communications"
on public.daily_communications
for all
to service_role
using (true)
with check (true);

create policy "Service role manages Daily communication documents"
on public.daily_communication_documents
for all
to service_role
using (true)
with check (true);
