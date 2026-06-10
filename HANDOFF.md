# モノポリー AppHarbor カートリッジ 引き継ぎ資料

更新日: 2026-06-10

## 1. プロジェクト概要

PCを共有盤面として表示し、各プレイヤーが同じ部屋内のスマートフォンから操作するモノポリーゲームです。

- カートリッジID: `monopoly`
- 作業ディレクトリ: `C:\Users\torit\Desktop\Projects\cart-monopoly`
- 参照アプリ: `C:\Users\torit\Documents\大画面テストアプリ`
- AppHarbor全画面カートリッジ
- ゲーム状態はDBへ保存し、中断・再開可能
- PCとの接続はQRコードを使用
- オンライン対戦は現時点で対象外

## 2. 最重要ルール

作業を始める前に、この順番で必ず確認してください。

1. `AGENTS.md`
2. `.appharbor/PLATFORM.md`
3. `.appharbor/SDK-TYPES.ts`
4. `.appharbor/SDK-API.ts`
5. `.appharbor/RULES.md`

編集してよいのは、この `cart-monopoly` フォルダ内だけです。親のAppHarbor本体や他カートリッジは編集しないでください。

主な規約:

- DBテーブル名は必ず `monopoly_` で開始
- 全テーブルに `organization_id`
- 全クエリを `organization_id` で絞り込む
- 全テーブルでRLSを有効化
- `current_setting('app.*')` をRLSに使用しない
- DB変更時は、先に `db/schema.sql`、次に `routes/_types.ts`
- 共有型は `routes/_types.ts` に集約
- 全画面のため `<BackToAppHarbor />` が必須
- importは `@/sdk`、`@/sdk/client`、React、Next.js、相対import、Node標準のみ

## 3. 合意済み仕様

### プレイヤー

- 2～8席
- 最初の一人用テストプレイは「人間1人 + CPU1人」で成立
- CPUは最大7人まで設定可能
- コントローラー種別:
  - `smartphone`
  - `cpu`
  - `pc`
- ゲーム開始後の途中参加は不可
- 接続済みスマートフォンを、ホストが任意のプレイヤー席へ割り当てる
- 切断後の再接続は可能
- 将来的に一部プレイヤーをPCへ担当させる構成にも対応

### ロール

- `player`（default）: プレイヤー
- `host`: 卓作成、端末割当、ゲーム進行、訂正操作
- `admin`: 保存ゲーム管理を含む全操作

### ルール

以下を実装済みです。

- サイコロ、ゾロ目、3連続ゾロ目
- GO通過時の給与
- 土地、鉄道、公共会社の購入と賃料
- 同色独占時の賃料
- 競売
- 家・ホテルの建設と売却
- 均等建設・均等売却
- 抵当と抵当解除
- 留置所、釈放料、釈放カード
- Chance / Community Chest
- プレイヤー間交換
- 債務整理と破産
- 勝者判定
- 一時停止と再開
- ホストによる現金・位置訂正、強制ターン終了

盤面は英語版Atlantic Cityの土地名とドル価格です。カード文言は権利面を考慮し、公式効果に近い独自日本語表現にしています。

### 駒

以下の8種類です。

- 帽子
- 自動車
- 船
- 犬
- ブーツ
- 猫
- 飛行機
- カメラ

画像生成機能で作成したオリジナルの金属風スプライトを使用しています。

ファイル: `routes/assets/token-sprite.png`

## 4. 画面構成

| URL | 対象 | 内容 |
|---|---|---|
| `/` | `host` / `admin` | PC共有盤面、ロビー、QR、端末割当、ゲーム進行 |
| `/join/[code]` | QR参加者 | スマートフォン接続・操作画面 |
| `/admin` | `admin` | 保存ゲーム一覧と削除 |

`manifest.json` は `fullscreen: true` です。PC画面の `HostGame.tsx` に `<BackToAppHarbor />` を配置済みです。

## 5. 主要ファイル

| ファイル | 役割 |
|---|---|
| `manifest.json` | カートリッジ情報、ロール、画面、DBテーブル宣言 |
| `db/schema.sql` | 5テーブル、インデックス、更新トリガー、RLS |
| `routes/_types.ts` | DB行とゲーム状態の共有型 |
| `routes/gameData.ts` | 40マス、土地価格、賃料、カード、駒定義 |
| `routes/server/engine.ts` | DB非依存のゲームルールエンジン |
| `routes/server/actions.ts` | 認証、組織分離、DB永続化、端末API |
| `routes/components/HostGame.tsx` | PCホスト画面 |
| `routes/components/MobileController.tsx` | スマートフォン画面 |
| `routes/components/MonopolyBoard.tsx` | 40マスのレスポンシブ盤面 |
| `routes/components/TokenPiece.tsx` | 駒スプライト表示 |
| `routes/components/QrCode.tsx` | QR表示 |
| `routes/page.tsx` | ホスト画面の入口 |
| `routes/join/[code]/page.tsx` | QR参加画面の入口 |
| `routes/admin/page.tsx` | 管理画面 |

## 6. DB構成

作成するテーブル:

- `monopoly_games`
- `monopoly_players`
- `monopoly_controllers`
- `monopoly_properties`
- `monopoly_events`

全テーブル:

- `organization_id` あり
- RLS有効
- select / insert / update / delete ポリシーあり
- `manifest.json` の `tables` と一致

ゲーム更新は `monopoly_games.version` を使った楽観ロックです。複数端末の操作が重なった場合は `state_conflict` を返します。

本番利用前に、AppHarbor管理画面の「DBセットアップ」から `db/schema.sql` をSupabaseへ適用してください。

## 7. 直近で修正した重要箇所

`routes/server/engine.ts` で以下を修正済みです。

- CPUだけの競売が途中で停止する問題
- CPU最高入札者が自分自身へ再入札する問題
- 債務解消後にゾロ目の追加ターンが失われる問題
- 破産時に債権者が未回収額まで受け取ってしまう問題
- 破産時の建物換金、土地、釈放カードの移管
- 売却・抵当可能な資産が残る状態での早すぎる破産宣言を防止

スマートフォン側には `assets_available` の日本語エラー表示を追加済みです。

## 8. 検証済み内容

### AppHarbor規約検証

実行コマンド:

```powershell
cd C:\Users\torit\Desktop\Projects
.\AppHarbor\node_modules\.bin\tsx.cmd .\AppHarbor\scripts\cartridge-validate.ts cart-monopoly
```

結果: `検証 OK`

残る警告は推奨項目のみです。

- `README.md` がない
- `icon.svg` がない
- `.appharbor/` が未知のディレクトリ扱い
- `.git/` が未知のディレクトリ扱い

### 型・ゲームデータ

- ゲームエンジンのTypeScript検査合格
- 盤面40マス
- 購入可能物件28件
- Chance 16枚
- Community Chest 16枚
- 駒8種類

### シナリオテスト

一時テストを作成して以下を確認し、テストファイルは削除済みです。

- CPU同士の競売が終了する
- 落札後に次フェーズへ進む
- 破産時の債権者現金が実回収額になる
- 土地と釈放カードが債権者へ移る
- 債務解消後、ゾロ目なら同じプレイヤーが再度振れる

### ブラウザ表示

一時Next.jsプレビューで実コンポーネントを表示して確認済みです。

- PC: 1280 x 720
- 盤面: 約634 x 634
- 40マス表示
- 駒スプライト読み込み成功
- スマートフォン: 390 x 844
- 横方向のはみ出しなし

一時プレビューとポート3217のサーバーは削除・停止済みです。

## 9. 未実施・次に行うこと

最優先はAppHarbor Studio上での実DB・実端末テストです。

1. DBセットアップを実行
2. `host` ユーザーで卓を作成
3. PC画面のQRをスマートフォンで読み取る
4. ホストが待機端末をスマートフォン席へ割り当てる
5. 人間1人 + CPU1人で開始
6. 購入、競売、カード、留置所、抵当、破産を通して確認
7. ページ再読み込み後の保存・再開を確認
8. `admin` で保存ゲーム一覧と削除を確認
9. `player` / `host` / `admin` の権限制御を確認

実DBを利用したPC・スマートフォン間の完全E2Eは、まだ実施していません。

## 10. 既知の注意点・改善候補

- 「各プレイヤーへ支払う」「各プレイヤーから受け取る」カードで、支払う側が不足した場合の複数債権者処理は簡略化されています。
- CPU戦略は初期版です。購入、競売、建設、交換の判断を今後高度化できます。
- 家・ホテルの銀行在庫数は管理していません。
- 公式ルールの細部を完全再現したものではないため、テストプレイ中にルール差分を記録してください。
- ホスト画面は約1.1秒、スマートフォン画面は約0.85秒間隔のポーリングです。
- QR参加URLにはゲームIDと参加用secretが入ります。開始後は新規接続不可です。
- `routes/server/actions.ts` のDBアクセスでは、組織分離を崩さないでください。

## 11. Git状態

この時点ではコミット・ステージングしていません。

既存の未コミット実装が多数あります。引き継ぎ先は最初に必ず以下を実行してください。

```powershell
git status --short
git diff --check
```

`AGENTS.md` は作業前から未追跡として存在していました。削除や変更をしないでください。

他人の変更を `git reset --hard` や `git checkout --` で戻さないでください。

## 12. 次担当への推奨開始手順

```powershell
cd C:\Users\torit\Desktop\Projects\cart-monopoly
git status --short
Get-Content -Encoding utf8 AGENTS.md
Get-Content -Encoding utf8 .appharbor\PLATFORM.md
Get-Content -Encoding utf8 .appharbor\SDK-TYPES.ts
Get-Content -Encoding utf8 .appharbor\SDK-API.ts
Get-Content -Encoding utf8 .appharbor\RULES.md
```

その後、`routes/server/engine.ts`、`routes/server/actions.ts`、`routes/components/HostGame.tsx`、`routes/components/MobileController.tsx` の順に読むと、全体を把握しやすいです。
