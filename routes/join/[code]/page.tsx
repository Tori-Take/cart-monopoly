import { MobileController } from '../../components/MobileController'
import { getJoinPreviewAction } from '../../server/actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; code: string }>
  searchParams: Promise<{ game?: string; t?: string }>
}) {
  const { slug, code } = await params
  const { game: gameId, t: joinSecret } = await searchParams
  const preview = await getJoinPreviewAction(
    slug,
    code,
    gameId,
    joinSecret,
  )

  return (
    <MobileController
      slug={slug}
      code={code.toUpperCase()}
      initialGameId={gameId}
      initialJoinSecret={joinSecret}
      preview={preview}
    />
  )
}
