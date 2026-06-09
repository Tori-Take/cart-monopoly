import { requireApp } from '@/sdk'

export default async function HomePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await requireApp(slug, 'monopoly')
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24, color: '#e2e8f0' }}>
      <h1 style={{ fontSize: 28 }}>モノポリー</h1>
      <p style={{ color: '#94a3b8' }}>こんにちは、{ctx.actor.actorName} さん（role: {ctx.role}）</p>
    </main>
  )
}
