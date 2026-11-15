-- Constraints that need existing rows to be compatible first. Applied by
-- `npm run db:migrate` after every items.lender_id has a users row.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'items_lender_id_fkey' and conrelid = 'items'::regclass
  ) then
    alter table items add constraint items_lender_id_fkey
      foreign key (lender_id) references users (clerk_id)
      on update cascade on delete restrict;
  end if;
end $$;
