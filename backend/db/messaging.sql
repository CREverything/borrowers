-- Additive, repeatable messaging migration. Uses the existing marketplace users/items.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  item_id integer references items(id) on delete set null,
  original_item_id integer not null,
  item_snapshot jsonb not null,
  borrower_id text not null references users(clerk_id),
  lender_id text not null references users(clerk_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (original_item_id, borrower_id),
  check (borrower_id <> lender_id)
);
create index if not exists conversations_borrower_idx on conversations(borrower_id, updated_at desc, id);
create index if not exists conversations_lender_idx on conversations(lender_id, updated_at desc, id);

create table if not exists messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id),
  sender_id text not null references users(clerk_id),
  client_nonce uuid not null,
  content text not null check (length(btrim(content)) between 1 and 4000),
  created_at timestamptz not null default clock_timestamp(),
  read_at timestamptz,
  unique (sender_id, client_nonce)
);
create index if not exists messages_history_idx on messages(conversation_id, id desc);
create index if not exists messages_unread_idx on messages(conversation_id, sender_id, id) where read_at is null;
create index if not exists messages_rate_idx on messages(sender_id, created_at desc);

create table if not exists messaging_blocks (
  blocker_id text not null references users(clerk_id),
  blocked_id text not null references users(clerk_id),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create table if not exists conversation_reports (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id),
  reporter_id text not null references users(clerk_id),
  reason text not null check (length(btrim(reason)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists conversation_reports_reporter_idx on conversation_reports(reporter_id, created_at desc);
