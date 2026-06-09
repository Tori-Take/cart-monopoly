/**
 * @appharbor/sdk@0.4.0 の関数シグネチャスナップショット
 *
 * このファイルは Studio がカートリッジ作成時に node_modules から
 * コピーしたものです。実際の build には使用されません (参照専用)。
 */

// ========== サーバーサイド ('@appharbor/sdk') ==========

/**
 * @appharbor/sdk — サーバーサイド SDK
 *
 * このパッケージは「契約 (interface)」を定義します。
 * 実際の実装はホスト環境（AppHarbor Studio / AppHarbor 本番）が
 * webpack alias 等で提供します。
 *
 * カートリッジは以下のように使用:
 *
 *   import { requireApp, getAdminSupabase } from '@appharbor/sdk'
 *
 *   export default async function Page({ params }) {
 *     const { slug } = await params
 *     const ctx = await requireApp(slug, 'my-cartridge')
 *     const supabase = getAdminSupabase()
 *     // ...
 *   }
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Actor,
  AppContext,
  GetAppRoleArgs,
  NotifyInput,
  NotifyResult,
  OrgRole,
  RequireActorResult,
  RequirePlatformAdminResult,
} from './types'

export type {
  Actor,
  AppContext,
  CartridgeManifest,
  CartridgeNavItem,
  CartridgePermission,
  DepartmentRow,
  GetAppRoleArgs,
  NotificationRow,
  NotifyInput,
  NotifyResult,
  NotifyScope,
  OrganizationRow,
  OrgRole,
  AppRow,
  PlatformActor,
  PlatformRole,
  ProfileRow,
  RequireActorResult,
  RequirePlatformAdminResult,
} from './types'

// ============================================================
// 認証 / アクセス制御
// ============================================================

/**
 * カートリッジページで認証 + アプリロールチェックを行う。
 *
 * 第 3 引数 gate が指定された場合、role を受け取って boolean を返す
 * ガード関数として動作する。false なら 403 リダイレクト。
 *
 * @example
 * const ctx = await requireApp(slug, 'my-cartridge')
 * const ctx = await requireApp(slug, 'my-cartridge', (role) => role === 'admin')
 */
export async function requireApp(
  _slug: string,
  _appId: string,
  _gate?: (role: string | null) => boolean,
): Promise<AppContext> {
  throw new Error(
    '[@appharbor/sdk] requireApp() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

/**
 * 組織メンバーであることだけを検証（アプリロールは確認しない）。
 * 主に API ルートで使用。
 *
 * @example
 * const guard = await requireActor(slug, 'member')
 * if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })
 */
export async function requireActor(
  _slug: string,
  _minRole?: OrgRole,
): Promise<RequireActorResult> {
  throw new Error(
    '[@appharbor/sdk] requireActor() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

/**
 * 特定ユーザーのアプリ内ロール（'viewer' / 'admin' 等）を取得。
 *
 * @example
 * const role = await getAppRole({
 *   organizationId: ctx.actor.organizationId,
 *   userId:         someUserId,
 *   departmentId:   null,
 *   appId:          'my-cartridge',
 * })
 */
export async function getAppRole(_args: GetAppRoleArgs): Promise<string | null> {
  throw new Error(
    '[@appharbor/sdk] getAppRole() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

/**
 * Platform Admin 権限を要求する。
 * 組織に所属しないグローバル管理者の認証チェック。
 * /platform/** 配下の Server Action / layout で呼ぶ想定。
 *
 * @example
 * const guard = await requirePlatformAdmin()
 * if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: 403 })
 */
export async function requirePlatformAdmin(): Promise<RequirePlatformAdminResult> {
  throw new Error(
    '[@appharbor/sdk] requirePlatformAdmin() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

// ============================================================
// Supabase クライアント
// ============================================================

/**
 * サーバーサイドで使う Supabase クライアント (service_role 相当)。
 * RLS をバイパスする想定。サーバーコンポーネント / Server Action /
 * API ルートでのみ使用。
 *
 * @example
 * const supabase = getAdminSupabase()
 * const { data } = await supabase
 *   .from('my_items')
 *   .select('*')
 *   .eq('organization_id', ctx.actor.organizationId)
 */
export function getAdminSupabase(): SupabaseClient {
  throw new Error(
    '[@appharbor/sdk] getAdminSupabase() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

/**
 * サーバーサイドで使う Supabase クライアント (ユーザー認証セッション付き)。
 * RLS が適用される。Server Component / Server Action / API ルートで使用。
 *
 * AppHarbor 本番では Cookie ベースの認証セッションを引き継ぐ。
 * Studio では Cookie のモックユーザーに対応する supabase クライアントを返す。
 *
 * @example
 * const supabase = await createServerSupabase()
 * const { data: { user } } = await supabase.auth.getUser()
 */
export async function createServerSupabase(): Promise<SupabaseClient> {
  throw new Error(
    '[@appharbor/sdk] createServerSupabase() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

// ============================================================
// 通知（インフォ）
// ============================================================

/**
 * AppHarbor プラットフォームの「お知らせ」へ通知を発火する。
 *
 * カートリッジ起点で組織メンバー / 特定部署 / 特定ユーザーへ通知を送る。
 * AppHarbor 本番では `announcements` テーブルへ INSERT され、AppHarbor のヘッダー
 * ベルや組織ダッシュボードに表示される。Studio では PGlite の `notifications`
 * テーブルへ INSERT され、Studio chrome のベル UI に表示される。
 *
 * `source_app_id` / `organization_id` / `created_by` はホスト環境がリクエスト
 * コンテキストから自動補完するので、呼び出し側は title / body / scope / target
 * を渡すだけでよい。
 *
 * @example
 * // 組織全員へ
 * await notify({ title: '月次レポートが公開されました' })
 *
 * @example
 * // 特定部署へ
 * await notify({
 *   title: '営業本部 全員へ',
 *   scope: 'dept',
 *   targetDeptId: deptId,
 * })
 *
 * @example
 * // 特定ユーザーへ（承認依頼など）
 * await notify({
 *   title: '巡回点検の承認待ちがあります',
 *   body:  '田中さんが点検を提出しました',
 *   scope: 'user',
 *   targetUserId: approverId,
 *   link:  `/org/${slug}/apps/patrol-navi/admin/approvals`,
 * })
 */
export async function notify(_input: NotifyInput): Promise<NotifyResult> {
  throw new Error(
    '[@appharbor/sdk] notify() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

// ========== ブラウザサイド ('@appharbor/sdk/client') ==========

/**
 * @appharbor/sdk/client — ブラウザサイド SDK
 *
 * 'use client' のあるカートリッジコンポーネントから使用。
 *
 * @example
 * 'use client'
 * import { createBrowserSupabase } from '@appharbor/sdk/client'
 *
 * export function MyClientComponent() {
 *   const supabase = createBrowserSupabase()
 *   // ...
 * }
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ReactElement } from 'react'

/**
 * ブラウザサイド Supabase クライアントを返す。
 *
 * 認証ユーザーの権限で動作する（RLS が有効になる）。
 * Studio では service_role でバイパスされるため、本番との挙動差に注意。
 */
export function createBrowserSupabase(): SupabaseClient {
  throw new Error(
    '[@appharbor/sdk/client] createBrowserSupabase() スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}

/** `<BackToAppHarbor />` の props。 */
export interface BackToAppHarborProps {
  /** ボタンの文言（既定: 'AppHarbor に戻る'） */
  label?: string
  /** 独自スタイルを当てる場合の className（指定時は既定の固定スタイルを無効化） */
  className?: string
}

/**
 * 全画面カートリッジ（manifest の `fullscreen: true`）で「本体に戻る」導線を出すボタン。
 *
 * 全画面では本体のヘッダー / サイドバー / ボトムナビが隠れて戻る手段が無くなるため、
 * `fullscreen: true` のカートリッジはこれを最低 1 箇所置くこと
 * （Studio の規約チェックで必須）。押すと本体のアプリ一覧 `/org/<slug>/apps` に戻る。
 *
 * @example
 * 'use client'
 * import { BackToAppHarbor } from '@appharbor/sdk/client'
 *
 * export default function Page() {
 *   return (
 *     <main>
 *       <BackToAppHarbor />
 *       {/* ゲーム本体など *\/}
 *     </main>
 *   )
 * }
 */
export function BackToAppHarbor(_props: BackToAppHarborProps): ReactElement {
  throw new Error(
    '[@appharbor/sdk/client] BackToAppHarbor スタブが呼ばれました。' +
    'ホスト環境 (Studio / AppHarbor) で実装に差し替えてください。',
  )
}
