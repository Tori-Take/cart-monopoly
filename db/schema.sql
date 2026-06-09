-- monopoly スキーマ
-- Studio 起動時に自動適用される
-- 規約: 全テーブルに organization_id を含めること / RLS を必ず有効化

-- create table if not exists monopoly_items (
--   id              uuid primary key default gen_random_uuid(),
--   organization_id uuid not null references organizations(id) on delete cascade,
--   created_at      timestamptz not null default now()
-- );
