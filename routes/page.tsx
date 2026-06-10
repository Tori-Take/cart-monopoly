import { requireApp } from '@/sdk'
import { HostGame } from './components/HostGame'
import { getOrCreateHostGameAction } from './server/actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function HomePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ctx = await requireApp(
    slug,
    'monopoly',
    (role) => role === 'host' || role === 'admin',
  )
  const result = await getOrCreateHostGameAction(slug)

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

  return (
    <HostGame slug={slug} initialBundle={result.bundle} role={ctx.role} />
  )
}
