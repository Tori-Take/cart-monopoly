# AppHarbor マルチテナント設計の鉄則

AppHarbor は B2B マルチテナント SaaS プラットフォームです。
**カートリッジを書く前に必ず読んでください**。

## 必須ルール

### 1. 全テーブルに `organization_id` カラム

```sql
create table if not exists <prefix>_items (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- ... その他のカラム
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
```

### 2. RLS (Row Level Security) ポリシーを必ず有効化

```sql
alter table <prefix>_items enable row level security;

create policy <prefix>_items_select on <prefix>_items
  for select using (
    organization_id in (select organization_id from profiles where id = auth.uid())
  );
```

⚠ **`current_setting('app.*')` 系の独自セッション変数 RLS は使わない**。
AppHarbor 本番では permission denied になる (Studio では気づかない)。

### 3. 全クエリで `organization_id` を絞り込む

```ts
const ctx = await requireApp(slug, '<cartridge-id>')
const supabase = getAdminSupabase()

// ✅ 正しい
await supabase.from('<prefix>_items')
  .select('*')
  .eq('organization_id', ctx.actor.organizationId)

// ❌ ダメ — テナント越境
await supabase.from('<prefix>_items').select('*')
```

### 4. `manifest.json` の `tables` 配列に作成したテーブル名を全部書く

これを忘れると AppHarbor 本番の「DB セットアップ」が機能しない。

### 5. `updated_at` の自動更新トリガを付ける

```sql
create trigger <prefix>_items_updated_at
  before update on <prefix>_items
  for each row execute function update_updated_at();
```

## 共通テーブル (定義しない)

以下のテーブルは AppHarbor が提供する。カートリッジで再定義してはいけない:

- `organizations` — 組織
- `profiles` — ユーザープロフィール (auth.users への外部キー)
- `departments` — 部署ツリー
- `apps` — インストール済みアプリ
- `auth.users` — Supabase 認証ユーザー
- `storage.objects` — ファイル保存

## アクター情報

`requireApp` の戻り値で取れる:

```ts
const ctx = await requireApp(slug, '<cartridge-id>')
ctx.actor.id              // profiles.id
ctx.actor.organizationId  // 所属組織 ID
ctx.actor.departmentId    // 所属部署 ID (任意)
ctx.actor.actorName       // 表示名
ctx.actor.email           // メール
ctx.role                  // アプリ内ロール ('viewer' / 'admin' 等)
```
