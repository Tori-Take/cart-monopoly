import { requireApp } from '@/sdk'
import { HostGame } from './components/HostGame'
import {
  getOrCreateHostGameAction,
  listHostGamesAction,
} from './server/actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ game?: string | string[] }>
}) {
  const { slug } = await params
  const query = await searchParams
  const requestedGameId =
    typeof query.game === 'string' ? query.game : undefined
  const ctx = await requireApp(
    slug,
    'monopoly',
    (role) => role === 'host' || role === 'admin',
  )
  const [result, savedGamesResult] = await Promise.all([
    getOrCreateHostGameAction(slug, requestedGameId),
    listHostGamesAction(slug),
  ])

  if (!result.ok) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#1a0f14',
          color: '#fff8ed',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        ゲーム卓を作成できませんでした: {result.error}
      </main>
    )
  }

  const savedGames = savedGamesResult.ok ? savedGamesResult.games : []
  if (!savedGames.some((game) => game.id === result.bundle.game.id)) {
    savedGames.unshift({
      id: result.bundle.game.id,
      title: result.bundle.game.title,
      status: result.bundle.game.status,
      join_code: result.bundle.game.join_code,
      player_count: result.bundle.players.length,
      updated_at: result.bundle.game.updated_at,
    })
  }

  return (
    <HostGame
      slug={slug}
      initialBundle={result.bundle}
      initialSavedGames={savedGames}
      role={ctx.role}
    />
  )
}
