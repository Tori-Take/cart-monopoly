/**
 * @appharbor/sdk@0.4.0 の型定義スナップショット
 *
 * このファイルは Studio がカートリッジ作成時に node_modules から
 * コピーしたものです。実際の build には使用されません (参照専用)。
 * SDK の更新を反映するには .appharbor/ を再生成してください。
 */

/**
 * AppHarbor SDK 型定義
 *
 * 3 環境（Studio ローカル / Studio Deploy / AppHarbor 本番）で共有される型。
 * カートリッジコードはこれらの型を使ってビジネスロジックを書く。
 */

// ─── 認証主体 ─────────────────────────────────────────────

/**
 * カートリッジを操作している「ユーザー」。
 * organizationId はマルチテナント境界の基準なので必須。
 */
export interface Actor {
  /** プロフィール ID（profiles.id） */
  id: string
  /** 所属組織 ID。全クエリでこの値を `.eq('organization_id', ...)` する */
  organizationId: string
  /** 所属部署 ID（任意） */
  departmentId: string | null
}

/** 組織レベルのロール */
export type OrgRole = 'member' | 'dept-admin' | 'org-admin'

/** プラットフォーム全体の管理者か */
export type PlatformRole = 'platform-admin' | null

/**
 * Platform Admin の認証主体。組織に所属しないので organizationId を持たない。
 * 実装側 (AppHarbor / Studio) は追加プロパティを足してよいが、最低限ここを満たす。
 */
export interface PlatformActor {
  id:    string
  email: string
}

// ─── アプリコンテキスト ───────────────────────────────────

/**
 * `requireApp()` の戻り値。
 * アプリ内のロールが解決された状態。
 */
export interface AppContext {
  actor: Actor
  /** アプリ内ロール（manifest.permissions の id）。例: 'viewer' / 'admin' */
  role: string | null
}

// ─── ガード関数の戻り値 ───────────────────────────────────

/** `requireActor()` の戻り値 */
export type RequireActorResult =
  | { ok: true;  actor: Actor }
  | { ok: false; error: string }

/** `requirePlatformAdmin()` の戻り値 */
export type RequirePlatformAdminResult =
  | { ok: true;  actor: PlatformActor }
  | { ok: false; error: string }

// ─── アプリロール解決 ─────────────────────────────────────

export interface GetAppRoleArgs {
  organizationId: string
  userId:         string
  departmentId:   string | null
  appId:          string
}

// ─── プラットフォーム共通テーブル（参照用） ──────────────

export interface OrganizationRow {
  id:         string
  slug:       string
  name:       string
  status:     'active' | 'suspended' | 'archived'
  deleted_at: string | null
}

export interface ProfileRow {
  id:              string
  organization_id: string
  department_id:   string | null
  org_role:        OrgRole
  display_name:    string | null
  status:          'active' | 'invited' | 'suspended' | 'removed'
}

export interface DepartmentRow {
  id:              string
  organization_id: string
  parent_id:       string | null
  name:            string
  display_order:   number
  deleted_at:      string | null
}

export interface AppRow {
  id:                 string
  app_id:             string
  display_name:       string
  description:        string | null
  version:            string
  icon:               string | null
  permissions:        string[]
  default_permission: string | null
  status:             'active' | 'archived'
}

// ─── manifest.json の型 ───────────────────────────────────

export interface CartridgePermission {
  id:      string
  label:   string
  default?: boolean
}

export interface CartridgeNavItem {
  label: string
  path:  string
}

export interface CartridgeManifest {
  $schema?:        string
  spec_version?:   string
  id:              string
  version:         string
  name:            string
  description?:    string
  icon?:           string
  category?:       string
  author?: {
    name?: string
    url?:  string
    email?: string
  }
  permissions:     CartridgePermission[]
  navigation?:     CartridgeNavItem[]
  studioCompatible?: boolean
  /**
   * true のとき本体 chrome（ヘッダー / サイドバー / ボトムナビ）を隠して全画面表示する（既定 false）。
   * 全画面アプリは本体メニューが出ないため、`@appharbor/sdk/client` の `<BackToAppHarbor />` を
   * 最低 1 箇所置くこと（戻る導線が必須。Studio の規約チェックで強制される）。
   */
  fullscreen?:     boolean
}

// ─── 通知（インフォ） ────────────────────────────────────

/** 通知の配信スコープ */
export type NotifyScope = 'org' | 'dept' | 'user'

/**
 * `notify()` の入力ペイロード。
 * カートリッジから AppHarbor プラットフォームの「お知らせ」へ通知を発火する。
 *
 * 自動補完される（呼び出し側で渡す必要なし）:
 *   - source_app_id   : ホスト環境がリクエストヘッダー (x-cartridge-id) から解決
 *   - organization_id : ホスト環境が現在の組織から解決
 *   - created_by      : ホスト環境が現在のユーザーから解決
 *
 * @example
 * await notify({
 *   title: '巡回点検の承認待ちがあります',
 *   body:  '田中さんが提出しました',
 *   scope: 'user',
 *   targetUserId: '...',
 *   link:  '/org/<slug>/apps/patrol-navi/admin/approvals',
 * })
 */
export interface NotifyInput {
  /** 通知のタイトル（必須） */
  title:         string
  /** 通知の本文 */
  body?:         string
  /** クリック時に遷移する URL（相対パス推奨） */
  link?:         string
  /** 配信スコープ。デフォルト 'org' */
  scope?:        NotifyScope
  /** scope='dept' のとき必須。対象部署 ID */
  targetDeptId?: string | null
  /** scope='user' のとき必須。対象ユーザー ID */
  targetUserId?: string | null
  /**
   * 発信元カートリッジ ID。
   * 通常は middleware が x-cartridge-id ヘッダーから自動解決するので渡さなくてよい。
   * カートリッジルート外 (cron job, 外部 webhook) から発火する時のみ明示指定。
   */
  sourceAppId?:  string
}

/** `notify()` の戻り値 */
export interface NotifyResult {
  /** 作成された通知の ID */
  id: string
}

/**
 * 通知行（Studio / AppHarbor 本体の UI が表示用に取得する shape）。
 * カートリッジ作者が直接これを構築することはない。Studio chrome の Bell UI 等が使う。
 */
export interface NotificationRow {
  id:              string
  sourceAppId:     string
  organizationId:  string
  scope:           NotifyScope
  targetDeptId:    string | null
  targetUserId:    string | null
  title:           string
  body:            string
  link:            string | null
  createdBy:       string | null
  createdAt:       string
  /** 現在のユーザーから見た既読時刻（未読なら null） */
  readAt:          string | null
}
