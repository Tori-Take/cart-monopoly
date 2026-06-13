# 計画書: ゲーム進行スピード調整オプション

## 1. 目的

ホストがゲームの**体感進行スピード**（実況コメントの間・駒の歩行速度・バナー表示時間）を
プリセットから選べるようにする。卓ごとにDB保存し、どのホスト端末から開いても同じ速度になる。

## 2. 設計方針（重要）

### 2.1 「進行スピード」の実体はクライアント演出タイミングである

ゲームロジック（サイコロ・CPU手番・競売）は `routes/server/engine.ts` で**同期的に一瞬で解決**される。
プレイヤーが「速い／遅い」と感じるのは、すべて `routes/components/HostGame.tsx` の演出タイミング定数：

| 定数 / 箇所 | 現在値 | 役割 |
|---|---|---|
| `MOVE_READ_DELAY` | 2200ms | コメントが出てから駒が歩き出すまでの「読む間」 |
| 駒歩行アニメ `setInterval` | 280ms/歩 | 駒が1マス進む速さ |
| バナー表示時間 `showNextBanner` | 2000 / 3400ms | 実況バナーの滞在時間（混雑時は短縮） |

→ **エンジンは一切変更しない。** speed はこれら3つの定数を倍率でスケールするだけ。

### 2.2 保存先：卓ごとにDB保存（`monopoly_games.settings` jsonb）

- `settings` は既に jsonb（`{"startingMoney":1500,"salary":200}`）。**`speed` キーを足すだけで ALTER TABLE 不要。**
- 既存卓（speed キーなし）はコード側で `'normal'` に補完する。
- 新規テーブルは作らないので **`manifest.json` の `tables` 配列は変更不要。**

## 3. スピードプリセット（5段階）

`speed` 値（semantic）と、演出タイミングへ掛ける倍率 `factor`（大きいほど遅い）：

| speed 値 | 表示ラベル | factor | 体感 |
|---|---|---|---|
| `very_slow` | とてもゆっくり | 1.6 | 観戦・解説向け |
| `slow` | ゆっくり | 1.3 | じっくり読む |
| `normal` | ふつう（既定） | 1.0 | 現状と同一 |
| `fast` | はやい | 0.65 | テンポ重視 |
| `very_fast` | とても速い | 0.4 | サクサク消化 |

`factor` を掛ける対象：`MOVE_READ_DELAY`、駒歩行 `setInterval` 間隔、バナー表示時間（2000 / 3400 の両方）。
ポーリング間隔（1100ms）は通信都合なので**対象外**。

実値の確認（破綻しないこと）：
- 駒歩行: `very_fast` → 280×0.4 = 112ms、`very_slow` → 448ms。どちらも問題なし。
- 読む間: `very_fast` → 880ms、`very_slow` → 3520ms。

## 4. 変更ファイル一覧

| ファイル | 変更内容 |
|---|---|
| `routes/_types.ts` | `GameSpeed` 型を追加、`GameSettings` に `speed` を追加 |
| `db/schema.sql` | `settings` のデフォルト literal に `"speed":"normal"` を追記（新規卓用） |
| `routes/server/actions.ts` | `normalizeGame` の settings フォールバックに speed 補完、`setGameSpeedAction` 追加 |
| `routes/components/HostGame.tsx` | speed をタイミングに反映、速度選択 UI を追加 |

> `manifest.json` は変更なし（新テーブル無し・ロール変更無し）。

## 5. 詳細実装

### 5.1 `routes/_types.ts`

```ts
export type GameSpeed = 'very_slow' | 'slow' | 'normal' | 'fast' | 'very_fast'

export interface GameSettings {
  startingMoney: number
  salary: number
  speed: GameSpeed        // ← 追加（既存卓は normalizeGame で 'normal' 補完）
}
```

### 5.2 `db/schema.sql`（23行目）

```sql
settings jsonb not null default '{"startingMoney":1500,"salary":200,"speed":"normal"}'::jsonb,
```

- jsonb なので**マイグレーション（ALTER TABLE）不要**。新規 insert のデフォルトが変わるだけ。
- 本番の既存卓は speed キーを持たないが、後述の `normalizeGame` 補完で `'normal'` 扱いになる。
- 本番反映：スキーマ変更ではなくデフォルト literal の変更のみ。既存卓の挙動は補完でカバーされるため、
  改めて Supabase へ流す必要はない（新規卓のデフォルトを揃えたい場合のみ `alter table ... alter column settings set default ...` を任意で適用）。

### 5.3 `routes/server/actions.ts`

**(a) `normalizeGame` の settings 補完を speed 対応に**（84-88行目）

```ts
settings: {
  startingMoney: 1500,
  salary: 200,
  speed: 'normal' as const,
  ...(row.settings && typeof row.settings === 'object' ? row.settings : {}),
},
```

（既存値を後ろで spread して上書き。speed が無い行は 'normal' が残る。
 不正な speed 文字列が入っても型上は許容されるが、5.4 のクライアント側で未知値は 'normal' にフォールバックさせる）

**(b) 速度更新アクションを追加**（`setPauseAction` と同じ「version ロックなし直接 update」パターン）

```ts
const SPEED_VALUES: GameSpeed[] = ['very_slow', 'slow', 'normal', 'fast', 'very_fast']

export async function setGameSpeedAction(
  slug: string,
  gameId: string,
  speed: string,
) {
  const ctx = await requireHost(slug)
  if (!SPEED_VALUES.includes(speed as GameSpeed)) {
    return { ok: false as const, error: 'invalid_speed' }
  }
  const supabase = getAdminSupabase()
  // settings jsonb を read-merge-write（speed 以外のキーを保持）
  const { data: row } = await supabase
    .from('monopoly_games')
    .select('settings')
    .eq('organization_id', ctx.actor.organizationId)
    .eq('id', gameId)
    .maybeSingle()
  if (!row) return { ok: false as const, error: 'game_not_found' }
  const current =
    row.settings && typeof row.settings === 'object' ? row.settings : {}
  const { error } = await supabase
    .from('monopoly_games')
    .update({ settings: { startingMoney: 1500, salary: 200, ...current, speed } })
    .eq('organization_id', ctx.actor.organizationId)
    .eq('id', gameId)
  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const }
}
```

- `GameSpeed` を `_types` から import に追加する。
- version ロックを使わない理由：`setPauseAction`（status 直接更新）と同じく軽量設定変更。
  エンジン操作の persist と稀に競合し得るが、ホスト操作のみで同時実行はほぼ起きない（既存の status と同じ割り切り）。

### 5.4 `routes/components/HostGame.tsx`

**(a) プリセット定義（モジュールトップ、定数群の近く）**

```ts
const SPEED_FACTORS: Record<GameSpeed, number> = {
  very_slow: 1.6, slow: 1.3, normal: 1.0, fast: 0.65, very_fast: 0.4,
}
const SPEED_OPTIONS: { value: GameSpeed; label: string }[] = [
  { value: 'very_slow', label: 'とてもゆっくり' },
  { value: 'slow',      label: 'ゆっくり' },
  { value: 'normal',    label: 'ふつう' },
  { value: 'fast',      label: 'はやい' },
  { value: 'very_fast', label: 'とても速い' },
]
const MOVE_READ_DELAY = 2200          // 既存。基準値（factor=1.0 のとき）
```

**(b) 現在の speed と factor を導出**

```ts
const speed: GameSpeed =
  (SPEED_FACTORS[bundle.game.settings.speed as GameSpeed] !== undefined
    ? bundle.game.settings.speed
    : 'normal') as GameSpeed
const speedFactor = SPEED_FACTORS[speed]
```

最新 factor を `setInterval` コールバックから参照するため ref に同期：

```ts
const speedFactorRef = useRef(speedFactor)
useEffect(() => { speedFactorRef.current = speedFactor }, [speedFactor])
```

**(c) 3箇所のタイミングに factor を適用**

1. 駒歩行 `setInterval`（206-236行目）：固定 `280` → `Math.round(280 * speedFactorRef.current)`。
   ⚠ `setInterval` の間隔は生成時に固定されるため、**interval 内で「次の発火までの経過」を可変にするのは不可**。
   対応：interval は短い固定周期（例 80ms）で回し、前回ステップからの経過が `280*factor` を超えたら1歩進める方式に変更する。
   （または `speedFactor` を useEffect 依存に追加し、変わるたび interval を貼り直す。実装が単純なのは後者。**後者を採用**：
   依存配列に `speedFactor` を加え、`window.setInterval(..., Math.round(280 * speedFactor))` とする）

2. `MOVE_READ_DELAY`（254行目）：`moveGateRef.current = Date.now() + MOVE_READ_DELAY * speedFactorRef.current`。

3. バナー表示時間（132行目）：`const delay = (eventQueueRef.current.length >= 3 ? 2000 : 3400) * speedFactorRef.current`。
   `showNextBanner` は `useCallback([])` なので `speedFactorRef`（ref）経由で読む。

**(d) 速度選択 UI**

`primaryActions` セクション（803行目付近、開始/一時停止ボタンの並び）の下に、ロビー・対局中いずれでも操作可能な
小さな select を1つ追加：

```tsx
<section className="panelCard speedCard">
  <span className="sectionLabel">進行スピード</span>
  <select
    value={speed}
    disabled={busy}
    onChange={(event) => {
      const next = event.target.value as GameSpeed
      // 楽観更新：即座に体感へ反映し、サーバー保存は裏で実行
      setBundle((current) => ({
        ...current,
        game: { ...current.game, settings: { ...current.game.settings, speed: next } },
      }))
      void setGameSpeedAction(slug, bundle.game.id, next)
    }}
  >
    {SPEED_OPTIONS.map((opt) => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
</section>
```

- `setGameSpeedAction` を import に追加。
- 楽観更新後、次回ポーリング（1100ms）で確定値が返るので整合する。

## 6. 影響範囲外（変更しないもの）

- `routes/server/engine.ts`：ゲームロジックは速度と無関係。変更なし。
- `routes/components/MobileController.tsx`：スマホ操作は演出を持たない。変更なし。
- `manifest.json`：新テーブル・新ロール無し。変更なし。
- 楽観ロック（`version`）：speed 更新では使わない（status と同じ軽量更新扱い）。

## 7. テスト確認項目

- [ ] Studio で新規卓を作成 → settings に `speed: "normal"` が入る
- [ ] 5段階すべてを選択 → 駒歩行・読む間・バナー時間が体感で変わる
- [ ] 速度変更が DB（`monopoly_games.settings.speed`）に保存される
- [ ] 別のホスト端末／リロードで選択が保持される
- [ ] speed キーを持たない既存卓を開いても 'normal' で正常動作（補完確認）
- [ ] 対局中・ロビー両方で速度変更できる
- [ ] 速度変更後も startingMoney / salary が壊れない（settings マージ確認）
- [ ] Studio「規約チェック」が緑

## 8. 想定作業量

低モデルで実装可能。4ファイル、新規テーブル・マイグレーション無し。
最も注意が要るのは 5.4(c)-1 の駒歩行 interval（依存配列に `speedFactor` を追加して貼り直す方式を採用）。
