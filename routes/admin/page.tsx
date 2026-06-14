import { requireApp } from '@/sdk'
import { notFound } from 'next/navigation'
import type { SavedGameSummary } from '../_types'
import { listAdminGamesAction } from '../server/actions'
import { DeleteGameButton } from './DeleteGameButton'

function date(value: string) {
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default async function AdminPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ctx = await requireApp(
    slug,
    'monopoly',
    (role) => role === 'admin',
  )
  if (ctx.role !== 'admin') notFound()
  const result = await listAdminGamesAction(slug)

  return (
    <main className="adminShell">
      <header>
        <div>
          <p>MONOPOLY ADMINISTRATION</p>
          <h1>保存ゲーム管理</h1>
        </div>
        <a href={`/org/${slug}/apps/monopoly`}>ゲーム卓へ戻る</a>
      </header>

      {!result.ok ? (
        <section className="adminCard">読み込みに失敗しました: {result.error}</section>
      ) : (
        <section className="gameList">
          {result.games.map((game: SavedGameSummary) => (
            <article key={game.id} className="gameRow">
              <div>
                <span>{game.status}</span>
                <strong>{game.title}</strong>
                <small>
                  ROOM {game.join_code} / {game.player_count} players / 更新{' '}
                  {date(game.updated_at)}
                </small>
              </div>
              <div className="rowActions">
                <a href={`/org/${slug}/apps/monopoly?game=${game.id}`}>
                  開く
                </a>
                <DeleteGameButton
                  slug={slug}
                  gameId={game.id}
                  title={game.title}
                />
              </div>
            </article>
          ))}
          {result.games.length === 0 ? (
            <section className="adminCard">保存ゲームはありません。</section>
          ) : null}
        </section>
      )}

      <style>{`
        .adminShell {
          min-height: 100vh;
          padding: 28px;
          box-sizing: border-box;
          background: #1a0f14;
          color: #fff8ed;
          font-family: Inter, "Noto Sans JP", system-ui, sans-serif;
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: end;
          gap: 18px;
          margin-bottom: 24px;
        }
        header p {
          margin: 0 0 5px;
          color: #efbf64;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .2em;
        }
        h1 { margin: 0; font-family: Georgia, serif; font-size: 34px; }
        header a {
          padding: 10px 13px;
          border-radius: 8px;
          background: #f7f0dd;
          color: #181413;
          text-decoration: none;
          font-weight: 900;
        }
        .gameList { display: grid; gap: 9px; }
        .adminCard, .gameRow {
          border: 1px solid rgba(255,244,228,.14);
          border-radius: 10px;
          padding: 14px;
          background: rgba(255,255,255,.045);
        }
        .gameRow {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px;
          align-items: center;
        }
        .gameRow > div { display: grid; gap: 3px; }
        .gameRow span { color: #efbf64; font-size: 10px; font-weight: 900; text-transform: uppercase; }
        .gameRow strong { font-family: Georgia, serif; font-size: 23px; }
        .gameRow small { color: #a99b9f; }
        .rowActions { display: flex; gap: 8px; }
        .rowActions a {
          display: inline-grid;
          min-height: 42px;
          place-items: center;
          border-radius: 8px;
          padding: 0 14px;
          background: #f7f0dd;
          color: #181413;
          text-decoration: none;
          font-weight: 900;
        }
        button {
          min-height: 42px;
          border: 0;
          border-radius: 8px;
          padding: 0 14px;
          background: #991b1b;
          color: #fff;
          font: inherit;
          font-weight: 900;
          cursor: pointer;
        }
        @media (max-width: 640px) {
          .adminShell { padding: 18px; }
          header, .gameRow { grid-template-columns: 1fr; display: grid; align-items: start; }
          .rowActions, .rowActions a, button { width: 100%; }
        }
      `}</style>
    </main>
  )
}
