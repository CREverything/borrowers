-- Direct profile conversations share the existing message history/security infrastructure.
-- Existing listing conversations retain their original listing IDs and unique constraint.
alter table conversations alter column original_item_id drop not null;
create unique index if not exists conversations_direct_pair_idx
  on conversations (least(borrower_id, lender_id), greatest(borrower_id, lender_id))
  where original_item_id is null;
