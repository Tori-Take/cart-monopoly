# 実装計画: リッチなカードグラフィック

## 目的

提示された「Card Library」HTML の体裁を React 化し、ゲーム内のカード表示を改善する。
**データは既存の `routes/gameData.ts`（`BOARD` / `CHANCE_CARDS` / `CHEST_CARDS`）をそのまま使う。**
提示HTMLのテキスト・金額は流用しない（ゲーム挙動 `CardEffect` と一致させるため）。

## 全体方針

- 採るのは提示HTMLの **CSS とマークアップ構造のみ**。
- 共有プレゼンテーション用コンポーネント `RichCard` を新規作成し、PC・スマホ双方から使い回す。
- 演出は「静止のきれいな1枚」。めくりアニメ・一覧/検索/シャッフルUIは作らない。

## スタイル記法の前提（重要）

このプロジェクトは **styled-jsx ではなく、各クライアントコンポーネント内の
`<style>{` ... `}</style>` グローバル文字列**でCSSを書いている
（例: `HostGame.tsx` 1033〜1286行）。クラス名はグローバルなので衝突に注意。

- `RichCard` のCSSは **`export const RICH_CARD_CSS = \`...\``** という文字列定数として公開する。
- `RichCard` コンポーネント本体は **マークアップのみ**を返す（`<style>` は内包しない）。
- `HostGame.tsx` / `MobileController.tsx` の既存 `<style>{` ... `}</style>` ブロックの末尾に
  `${RICH_CARD_CSS}` を1回だけ差し込む（多重レンダー時のstyleタグ重複を避ける）。
- クラス名は **`rcard` プレフィックス**で統一（既存 `.deedCard` 等と衝突させない）。

---

## ステップ1: `routes/components/RichCard.tsx` を新規作成

`'use client'` を付ける。`../_types` から `BoardSpace`, `GameCard` を import（型は再宣言しない）。

### Props

```tsx
export function RichCard(props: { space?: BoardSpace; card?: GameCard }): JSX.Element | null
```

- `card` が渡されたら → イベントカード（チャンス/共同基金）を描画
- `space` が渡されて type が `street` / `railroad` / `utility` のいずれか → 権利書カードを描画
- それ以外（税金/GO等、または両方未指定）→ `null` を返す

### 権利書カード（property face）

提示HTMLの `.property-band` / `.property-body` / `.price` / `.rent-list` / `.property-note` を踏襲。
クラス名は `rcard`, `rcard__band`, `rcard__rents` 等にリネーム。

データソース別の描画:

| 種別 | カラーバンド | ラベル | 賃料行 | 注記 |
|---|---|---|---|---|
| `street` | `space.color` | `TITLE DEED` | `space.rents[0..5]` を `['賃料','家1軒','家2軒','家3軒','家4軒','ホテル']` で | `家の価格 ${houseCost} / 抵当 ${mortgage}` ＋ `同色を揃えると未建設時の賃料は2倍` |
| `railroad` | `#202020` | `RAILROAD DEED` | `space.rents[0..3]` を `['1社を所有'..'4社を所有']` で | `抵当 ${mortgage}` ＋ `鉄道を集めるほど賃料が上昇` |
| `utility` | `#cfc9b4`（中立色） | `UTILITY DEED` | 固定2行: `1社を所有 → 出目×4` / `2社を所有 → 出目×10` | `抵当 ${mortgage}` ＋ `移動に使ったサイコロの出目で計算` |

- 価格表示: `購入価格 ${money(space.price)}`（`money = v => '$'+v.toLocaleString('en-US')`）。
- 文字色: バンドが暗い `dark-blue` と `railroad` のときのみ白文字、それ以外は `#181413`
  （提示HTMLの判定に準拠）。`space.group` で判定。
- `space.rents` / `space.houseCost` / `space.mortgage` は optional 型なので、
  `?? []` や `?? 0` でガードする（型エラー回避）。

### イベントカード（event face）

提示HTMLの `.event` / `.event-kicker` / `.event-icon` / `h2` / `.event-detail` を踏襲。
クラス名は `rcard--event`, `rcard__kicker` 等。

| deck | kicker | アイコン | テーマ色 |
|---|---|---|---|
| `chance` | `CHANCE` | `?` | `#ef8c35` |
| `chest` | `COMMUNITY CHEST` | `★` | `#79b9c8` |

- タイトル = `card.title`、本文 = `card.detail`。
- 番号バッジ（提示HTMLの `01 / 16`）は **作らない**（`GameCard` に index が無いため。後追い可）。

### CSS（`RICH_CARD_CSS`）

- 提示HTMLの該当CSSをコピーし、クラス名を `rcard` 系へ全置換。
- 紙テクスチャ・二重ボーダー（`::after`）・カラーバンド・賃料テーブルは踏襲。
- カード自体は `aspect-ratio: 2.5 / 3.5; width: 100%`。サイズは親側のラッパーで制御する
  （`RichCard` は幅100%で素直に伸びる作りにする）。
- 色はCSS変数ではなくこのカード用にハードコードしてよい（提示HTMLの `--ink` 等の値を直書き）。
  ただし本体テーマ（暗背景）の上に置くため、カード背景は明色（`#f7f0dd`）で固定。

---

## ステップ2: PC画面（`routes/components/HostGame.tsx`）に組み込み

### 2-1. import 追加

```tsx
import { RichCard, RICH_CARD_CSS } from './RichCard'
```

### 2-2. 引いたカード表示をリッチ化（455〜463行の `.drawnCard` ブロックを置換）

```tsx
{lastCard ? (
  <div className="rcardSlot rcardSlot--center">
    <RichCard card={lastCard} />
  </div>
) : null}
```

`.drawnCard` 系の旧CSS（1153〜1166行）は削除してよい（他で未使用なら）。

### 2-3. 物件カードを表示（471行 `{pendingSpace ? <span>...</span> : null}` を置換）

`pendingSpace` は購入判断(`purchase`)・競売(`auction`)いずれでも対象マス＝必ず物件。

```tsx
{pendingSpace ? (
  <div className="rcardSlot rcardSlot--center">
    <RichCard space={pendingSpace} />
  </div>
) : null}
```

- これで「マスに止まった購入判断」「競売中」の両方で権利書カードが出る。
- 競売の `auctionStatus`（最高額表示）は**残す**（カードの下に従来どおり表示）。

### 2-4. サイズ用ラッパーCSS ＋ `RICH_CARD_CSS` を `<style>` ブロックに追加

`HostGame.tsx` の `<style>{` ... `}</style>`（1033〜1286行）末尾（`` ` ``の直前）に追記:

```css
.rcardSlot { width: 100%; display: flex; justify-content: center; }
.rcardSlot--center { max-width: 240px; margin: 4px auto; }
```

最後に同ブロック内へ `${RICH_CARD_CSS}` を1回挿入。

---

## ステップ3: スマホ画面（`routes/components/MobileController.tsx`）に組み込み

**既存グラフィックは据え置き。カードをタップするとリッチカードをモーダル表示。**

### 3-1. import ＋ state 追加

```tsx
import { RichCard, RICH_CARD_CSS } from './RichCard'
import { getSpace } from '../gameData' // 既存
// ...
const [richView, setRichView] = useState<BoardSpace | null>(null)
```

`BoardSpace` を `../_types` から型 import（無ければ追加）。

### 3-2. 所有権利書（`deedGrid`, 579行付近）をタップ可能に

各 `.deedCard` に `onClick={() => setRichView(space)}` を付ける
（`space = getSpace(property.space_index)` は既に算出済み）。
`cursor: pointer` を `.deedCard` CSS に追加。

### 3-3. 購入判断パネル（427〜429行 名前/価格表示）もタップで拡大

`decisionPanel` 内の名前表示に `onClick={() => setRichView(getSpace(pending.spaceIndex))}` を付与
（任意だが、止まった物件をその場で確認できると親切）。

### 3-4. モーダルオーバーレイを描画（ルート直下に追加）

```tsx
{richView ? (
  <div className="rcardModal" role="dialog" aria-modal="true"
       onClick={() => setRichView(null)}>
    <div className="rcardModal__inner" onClick={(e) => e.stopPropagation()}>
      <RichCard space={richView} />
      <button type="button" className="rcardModal__close"
              onClick={() => setRichView(null)}>閉じる</button>
    </div>
  </div>
) : null}
```

Escape キーで閉じる `useEffect` も追加（既存の `qrZoom` 実装パターンを踏襲）。

### 3-5. モーダルCSS ＋ `RICH_CARD_CSS` をスマホ側 `<style>` ブロックに追加

```css
.rcardModal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center;
  padding: 24px; background: rgba(10,6,8,.72); }
.rcardModal__inner { width: min(86vw, 300px); display: grid; gap: 12px; }
.rcardModal__close { min-height: 44px; border: 0; border-radius: 8px;
  background: #d5282f; color: #fff; font-weight: 800; }
```

末尾に `${RICH_CARD_CSS}` を1回挿入。

---

## ステップ4: 型・ビルド確認

- `RichCard.tsx` で `interface` を再宣言しない（`../_types` から import のみ）。
- optional 列（`rents?`, `color?`, `houseCost?`, `mortgage?`, `price?`）は必ずガード。
- Studio の「規約チェック」が緑であること。
- 動作確認: 物件マス停止 → 権利書／競売中 → 権利書＋最高額／チャンス引き → イベントカード／
  スマホで所有権利書タップ → モーダル。

## 変更ファイル一覧

| ファイル | 変更 |
|---|---|
| `routes/components/RichCard.tsx` | 新規。共有カード ＋ `RICH_CARD_CSS` |
| `routes/components/HostGame.tsx` | 引いたカード／物件カードをリッチ化、CSS追記 |
| `routes/components/MobileController.tsx` | タップでモーダル表示、CSS追記 |

DB変更・manifest変更・schema変更は**なし**（表示のみの改修）。
