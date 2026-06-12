'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { BackToAppHarbor } from '@/sdk/client'
import type { ControllerType, GameBundle, GameEvent, TokenId } from '../_types'
import { TOKENS, getSpace } from '../gameData'
import {
  addPlayerSlotAction,
  assignControllerAction,
  createNewGameAction,
  getHostSnapshotAction,
  hostCorrectionAction,
  hostPlayerActionAction,
  removePlayerSlotAction,
  rotateJoinSecretAction,
  setPauseAction,
  startGameAction,
} from '../server/actions'
import { MonopolyBoard } from './MonopolyBoard'
import { QrCode } from './QrCode'
import { TokenPiece } from './TokenPiece'

function money(value: number) {
  return `$${value.toLocaleString('en-US')}`
}

function phaseLabel(phase: string) {
  return (
    {
      lobby: 'ロビー',
      await_roll: 'サイコロ待ち',
      await_purchase: '購入判断',
      auction: '競売',
      manage_debt: '資産整理',
      finished: 'ゲーム終了',
    }[phase] ?? phase
  )
}

const EVENT_ICONS: Record<GameEvent['event_type'], string> = {
  system: 'ℹ️',
  join: '📱',
  assign: '🎮',
  turn: '▶️',
  dice: '🎲',
  move: '🚶',
  purchase: '📜',
  auction: '🔨',
  rent: '💸',
  card: '🃏',
  build: '🏠',
  mortgage: '🏦',
  trade: '🤝',
  correction: '🛠️',
  bankruptcy: '💥',
  finish: '🏆',
}

export function HostGame({
  slug,
  initialBundle,
  role,
}: {
  slug: string
  initialBundle: GameBundle
  role: string | null
}) {
  const [bundle, setBundle] = useState(initialBundle)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joinUrl, setJoinUrl] = useState('')
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('PLAYER')
  const [newType, setNewType] = useState<ControllerType>('smartphone')
  const [newToken, setNewToken] = useState<TokenId>('ship')
  // 駒の表示位置 (実位置に向かって1マスずつ追従させる)
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({})
  // 盤面下部に流すイベントバナー
  const [banner, setBanner] = useState<GameEvent | null>(null)
  const eventQueueRef = useRef<GameEvent[]>([])
  const lastEventIdRef = useRef<string | null>(null)
  const eventsInitializedRef = useRef(false)
  const bannerTimerRef = useRef<number | null>(null)

  const showNextBanner = useCallback(() => {
    const next = eventQueueRef.current.shift() ?? null
    setBanner(next)
    if (next) {
      const delay = eventQueueRef.current.length >= 3 ? 1200 : 2200
      bannerTimerRef.current = window.setTimeout(showNextBanner, delay)
    } else {
      bannerTimerRef.current = null
    }
  }, [])

  const refresh = useCallback(async () => {
    const result = await getHostSnapshotAction(slug, bundle.game.id)
    if (result.ok) {
      // 新規卓へ切替直後に旧卓の応答が遅れて届いた場合は破棄する
      setBundle((current) =>
        current.game.id === result.bundle.game.id ? result.bundle : current,
      )
    }
  }, [bundle.game.id, slug])

  useEffect(() => {
    const timer = window.setInterval(() => void refresh(), 1100)
    return () => window.clearInterval(timer)
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    const buildJoinUrl = (base: string) => {
      const url = new URL(`/org/${slug}/apps/monopoly/join/${bundle.game.join_code}`, base)
      url.searchParams.set('game', bundle.game.id)
      url.searchParams.set('t', bundle.game.join_secret)
      return url.toString()
    }
    // Studio dev 環境では LAN IP を取得してスマホから届く URL を生成する。
    // 本番や API が存在しない環境ではフォールバックとして現在のオリジンを使う。
    fetch('/api/studio-env')
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { localUrl?: string } | null) => {
        if (cancelled) return
        setJoinUrl(buildJoinUrl((j?.localUrl ?? window.location.origin) as string))
      })
      .catch(() => {
        if (!cancelled) setJoinUrl(buildJoinUrl(window.location.origin))
      })
    return () => {
      cancelled = true
    }
  }, [bundle.game.id, bundle.game.join_code, bundle.game.join_secret, slug])

  const currentPlayer = bundle.players.find(
    (player) => player.id === bundle.game.current_player_id,
  )


  // 卓が切り替わったらアニメーションとバナーを初期化
  useEffect(() => {
    eventsInitializedRef.current = false
    eventQueueRef.current = []
    lastEventIdRef.current = null
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current)
      bannerTimerRef.current = null
    }
    setBanner(null)
    setDisplayPositions({})
  }, [bundle.game.id])

  useEffect(
    () => () => {
      if (bannerTimerRef.current !== null) {
        window.clearTimeout(bannerTimerRef.current)
      }
    },
    [],
  )

  // 表示位置を実位置へ1マスずつ追従させる (190ms/歩)
  useEffect(() => {
    const timer = window.setInterval(() => {
      setDisplayPositions((current) => {
        let changed = false
        const next: Record<string, number> = { ...current }
        for (const player of bundle.players) {
          const target = player.position
          const shown = current[player.id]
          if (shown === undefined) {
            // 初回はアニメーションせずに実位置へ
            next[player.id] = target
            changed = true
            continue
          }
          if (shown === target) continue
          const forward = (target - shown + 40) % 40
          const backward = (shown - target + 40) % 40
          // 「3マス戻る」カードだけ後退。遠距離ワープは2マスずつで間延び防止
          const step =
            backward <= 3 ? -1 : Math.min(forward > 12 ? 2 : 1, forward)
          next[player.id] = (shown + step + 40) % 40
          changed = true
        }
        return changed ? next : current
      })
    }, 190)
    return () => window.clearInterval(timer)
  }, [bundle.players])

  // 新着イベントをバナーのキューへ積む
  useEffect(() => {
    const events = bundle.events
    if (!eventsInitializedRef.current) {
      eventsInitializedRef.current = true
      lastEventIdRef.current = events[events.length - 1]?.id ?? null
      return
    }
    const lastId = lastEventIdRef.current
    const lastIndex = lastId
      ? events.findIndex((event) => event.id === lastId)
      : -1
    const fresh = lastIndex >= 0 ? events.slice(lastIndex + 1) : events.slice(-5)
    if (fresh.length === 0) return
    lastEventIdRef.current = events[events.length - 1]?.id ?? lastId
    eventQueueRef.current.push(...fresh)
    if (eventQueueRef.current.length > 8) {
      eventQueueRef.current = eventQueueRef.current.slice(-6)
    }
    if (bannerTimerRef.current === null) showNextBanner()
  }, [bundle.events, showNextBanner])

  const availableTokens = TOKENS.filter(
    (token) => !bundle.players.some((player) => player.token_id === token.id),
  )
  const smartphonePlayers = bundle.players.filter(
    (player) => player.controller_type === 'smartphone',
  )
  const waitingControllers = bundle.controllers.filter(
    (controller) => controller.status === 'waiting',
  )
  const pending = bundle.game.pending_action
  const pendingSpace =
    pending.kind === 'purchase' || pending.kind === 'auction'
      ? getSpace(pending.spaceIndex)
      : null

  async function run(task: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(true)
    setError(null)
    try {
      const result = await task()
      if (!result.ok) setError(result.error ?? '操作に失敗しました')
      await refresh()
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function addPlayer() {
    await run(() =>
      addPlayerSlotAction(slug, bundle.game.id, {
        displayName: newName,
        controllerType: newType,
        tokenId: newToken,
      }),
    )
    const next = availableTokens.find((token) => token.id !== newToken)
    if (next) setNewToken(next.id)
  }

  async function createNewGame() {
    const title = window.prompt('新しいゲーム卓の名前', 'MONOPOLY')
    if (title === null) return
    setBusy(true)
    try {
      const result = await createNewGameAction(slug, title)
      if (result.ok) {
        setBundle(result.bundle)
        setError(null)
      } else {
        setError(result.error)
      }
    } catch {
      setError('通信に失敗しました')
    } finally {
      setBusy(false)
    }
  }

  async function correctCash(playerId: string) {
    const raw = window.prompt('増減額を入力してください（例: -100 / 200）', '0')
    if (raw === null) return
    await run(() =>
      hostCorrectionAction(slug, bundle.game.id, {
        action: 'cash',
        playerId,
        value: Number(raw),
      }),
    )
  }

  async function correctPosition(playerId: string) {
    const raw = window.prompt('移動先のマス番号（0〜39）', '0')
    if (raw === null) return
    await run(() =>
      hostCorrectionAction(slug, bundle.game.id, {
        action: 'position',
        playerId,
        value: Number(raw),
      }),
    )
  }

  const center = (
    <div className="centerConsole">
      <div className="brandPlate">
        <small>ROOM {bundle.game.join_code}</small>
        <span className="logoRow" aria-label="Monopoly">
          <b className="logoMark">M</b>
          <strong className="logoText">MONOPOLY</strong>
        </span>
      </div>
      {bundle.game.status === 'lobby' ? (
        <div className="lobbyCenter">
          {joinUrl ? (
            <QrCode
              value={joinUrl}
              label="スマートフォン接続用QRコード"
              className="boardQr"
            />
          ) : null}
          <div>
            <b>QRを読み込んで接続</b>
            <span>接続後、ホストがプレイヤーへ割り当てます</span>
          </div>
        </div>
      ) : (
        <div className="turnCenter">
          <p>{phaseLabel(bundle.game.phase)}</p>
          <div className="diceDisplay">
            <b>{bundle.game.dice_1 ?? '-'}</b>
            <b>{bundle.game.dice_2 ?? '-'}</b>
          </div>
          <strong style={{ color: currentPlayer?.color }}>
            {currentPlayer?.display_name ?? 'GAME OVER'}
          </strong>
          {pendingSpace ? <span>{pendingSpace.name}</span> : null}
          {banner ? (
            <div
              key={banner.id}
              className="eventBanner"
              style={{
                '--actor-color':
                  bundle.players.find(
                    (player) => player.id === banner.actor_player_id,
                  )?.color ?? '#efbf64',
              } as CSSProperties}
            >
              <span className="bannerIcon">
                {EVENT_ICONS[banner.event_type] ?? 'ℹ️'}
              </span>
              <span className="bannerText">{banner.message}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )

  return (
    <main className="hostShell">
      <BackToAppHarbor label="アプリ一覧へ" />
      <section className="boardColumn">
        <div className="boardStage">
          <MonopolyBoard
            players={bundle.players.map((player) => ({
              ...player,
              position: displayPositions[player.id] ?? player.position,
            }))}
            properties={bundle.properties}
            currentPlayerId={bundle.game.current_player_id}
            center={center}
          />
        </div>
      </section>

      <aside className="hostPanel">
        <header className="hostHeader">
          <div>
            <p>TABLETOP CONTROL</p>
            <h1>{bundle.game.title}</h1>
          </div>
          <button type="button" disabled={busy} onClick={createNewGame}>
            新規卓
          </button>
        </header>

        {error ? <div className="errorBox">{error}</div> : null}

        <section className="statusStrip">
          <div><span>STATUS</span><strong>{bundle.game.status}</strong></div>
          <div><span>TURN</span><strong>{bundle.game.turn_number}</strong></div>
          <div><span>PHASE</span><strong>{phaseLabel(bundle.game.phase)}</strong></div>
        </section>

        {bundle.game.status === 'lobby' ? (
          <>
            <section className="panelCard joinCard">
              <div>
                <span className="sectionLabel">JOIN CODE</span>
                <strong className="joinCode">{bundle.game.join_code}</strong>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => rotateJoinSecretAction(slug, bundle.game.id))
                }
              >
                QR再発行
              </button>
            </section>

            <section className="panelCard">
              <span className="sectionLabel">接続待ちスマートフォン</span>
              {waitingControllers.length === 0 ? (
                <p className="muted">QRを読み込んだ端末がここに表示されます。</p>
              ) : (
                waitingControllers.map((controller) => (
                  <div className="assignmentRow" key={controller.id}>
                    <strong>{controller.label}</strong>
                    <select
                      value={
                        assignments[controller.id] ??
                        smartphonePlayers[0]?.id ??
                        ''
                      }
                      onChange={(event) =>
                        setAssignments((current) => ({
                          ...current,
                          [controller.id]: event.target.value,
                        }))
                      }
                    >
                      {smartphonePlayers.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.display_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={busy || smartphonePlayers.length === 0}
                      onClick={() =>
                        run(() =>
                          assignControllerAction(
                            slug,
                            bundle.game.id,
                            controller.id,
                            assignments[controller.id] ??
                              smartphonePlayers[0]?.id ??
                              '',
                          ),
                        )
                      }
                    >
                      割当
                    </button>
                  </div>
                ))
              )}
            </section>

            <section className="panelCard addPlayerCard">
              <span className="sectionLabel">プレイヤー枠を追加</span>
              <input
                value={newName}
                maxLength={24}
                onChange={(event) => setNewName(event.target.value)}
                aria-label="プレイヤー名"
              />
              <select
                value={newType}
                onChange={(event) =>
                  setNewType(event.target.value as ControllerType)
                }
              >
                <option value="smartphone">スマートフォン</option>
                <option value="cpu">CPU</option>
              </select>
              <select
                value={newToken}
                onChange={(event) =>
                  setNewToken(event.target.value as TokenId)
                }
              >
                {availableTokens.map((token) => (
                  <option key={token.id} value={token.id}>
                    {token.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={
                  busy ||
                  bundle.players.length >= 8 ||
                  availableTokens.length === 0
                }
                onClick={addPlayer}
              >
                追加
              </button>
            </section>
          </>
        ) : null}

        <section className="panelCard playerList">
          <span className="sectionLabel">PLAYERS</span>
          {bundle.players.map((player) => {
            const assigned = bundle.controllers.find(
              (controller) => controller.assigned_player_id === player.id,
            )
            const propertyCount = bundle.properties.filter(
              (property) => property.owner_player_id === player.id,
            ).length
            return (
              <article
                key={player.id}
                className={`playerRow ${
                  player.id === bundle.game.current_player_id
                    ? 'currentPlayer'
                    : ''
                } ${player.bankrupt ? 'bankruptPlayer' : ''}`}
                style={{ '--player-color': player.color } as CSSProperties}
              >
                <TokenPiece tokenId={player.token_id} size={48} />
                <div className="playerIdentity">
                  <strong>{player.display_name}</strong>
                  <span>
                    {player.controller_type.toUpperCase()}
                    {assigned ? ` / ${assigned.label}` : ''}
                  </span>
                  <small>
                    {getSpace(player.position).name} / {propertyCount} deeds
                  </small>
                </div>
                <b className="playerMoney">{money(player.money)}</b>
                {bundle.game.status === 'lobby' ? (
                  <button
                    type="button"
                    className="mini danger"
                    disabled={busy || bundle.players.length <= 2}
                    onClick={() =>
                      run(() =>
                        removePlayerSlotAction(
                          slug,
                          bundle.game.id,
                          player.id,
                        ),
                      )
                    }
                  >
                    削除
                  </button>
                ) : (
                  <div className="correctionButtons">
                    <button
                      type="button"
                      className="mini"
                      onClick={() => correctCash(player.id)}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      className="mini"
                      onClick={() => correctPosition(player.id)}
                    >
                      位置
                    </button>
                  </div>
                )}
              </article>
            )
          })}
        </section>

        <section className="primaryActions">
          {bundle.game.status === 'lobby' ? (
            <button
              type="button"
              className="startButton"
              disabled={busy}
              onClick={() =>
                run(() => startGameAction(slug, bundle.game.id))
              }
            >
              ゲーム開始
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    setPauseAction(
                      slug,
                      bundle.game.id,
                      bundle.game.status === 'playing',
                    ),
                  )
                }
              >
                {bundle.game.status === 'paused' ? '再開' : '一時停止'}
              </button>
              <button
                type="button"
                onClick={() =>
                  run(() =>
                    hostCorrectionAction(slug, bundle.game.id, {
                      action: 'end_turn',
                    }),
                  )
                }
              >
                ターン強制終了
              </button>
            </>
          )}
        </section>

        {currentPlayer?.controller_type === 'pc' &&
        bundle.game.status === 'playing' ? (
          <section className="panelCard">
            <span className="sectionLabel">PC PLAYER CONTROL</span>
            <div className="pcActions">
              {bundle.game.phase === 'await_roll' ? (
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      hostPlayerActionAction(
                        slug,
                        bundle.game.id,
                        currentPlayer.id,
                        'roll',
                      ),
                    )
                  }
                >
                  サイコロを振る
                </button>
              ) : null}
              {bundle.game.phase === 'await_purchase' ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      run(() =>
                        hostPlayerActionAction(
                          slug,
                          bundle.game.id,
                          currentPlayer.id,
                          'buy',
                        ),
                      )
                    }
                  >
                    購入
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      run(() =>
                        hostPlayerActionAction(
                          slug,
                          bundle.game.id,
                          currentPlayer.id,
                          'auction_start',
                        ),
                      )
                    }
                  >
                    競売へ
                  </button>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="panelCard eventLog">
          <span className="sectionLabel">GAME LOG</span>
          {[...bundle.events].reverse().slice(0, 12).map((event) => (
            <div key={event.id}>
              <time>
                {new Date(event.created_at).toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
              <span>{event.message}</span>
            </div>
          ))}
        </section>

        {role === 'admin' ? (
          <a
            className="adminLink"
            href={`/org/${slug}/apps/monopoly/admin`}
          >
            保存ゲーム管理
          </a>
        ) : null}
      </aside>

      <style>{`
        .hostShell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 410px);
          gap: clamp(14px, 2vw, 28px);
          padding: clamp(12px, 2vw, 28px);
          box-sizing: border-box;
          background:
            radial-gradient(circle at 12% 4%, rgba(213,40,47,.2), transparent 30rem),
            radial-gradient(circle at 90% 80%, rgba(36,122,82,.17), transparent 28rem),
            #1a0f14;
          color: #fff8ed;
          font-family: Inter, "Noto Sans JP", system-ui, sans-serif;
        }
        .boardColumn { min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
        .boardStage { position: relative; width: min(100%, 88vh); min-width: 0; }
        .eventBanner {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: 10px 18px;
          border: 2px solid #171717;
          border-left: 10px solid var(--actor-color);
          border-radius: 10px;
          background: rgba(247,240,221,.97);
          box-shadow: 0 10px 26px rgba(0,0,0,.45);
          color: #181413;
          font-size: clamp(13px, 1.4vw, 19px);
          font-weight: 800;
          animation: bannerIn 240ms cubic-bezier(.2, .9, .3, 1.2);
        }
        .bannerIcon { font-size: clamp(16px, 1.8vw, 26px); flex-shrink: 0; }
        .bannerText { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @keyframes bannerIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .centerConsole {
          position: relative;
          z-index: 3;
          width: min(72%, 520px);
          display: grid;
          gap: 16px;
          justify-items: center;
          transform: rotate(-35deg);
        }
        .brandPlate {
          display: grid;
          justify-items: center;
          filter: drop-shadow(.35rem .5rem 0 rgba(0,0,0,.2));
        }
        .brandPlate small {
          margin-bottom: 5px;
          color: #7f1d1d;
          font-size: clamp(7px, .85vw, 12px);
          font-weight: 1000;
          letter-spacing: .25em;
        }
        .logoRow {
          display: flex;
          align-items: center;
          gap: clamp(4px, .8vw, 12px);
        }
        .logoMark {
          display: grid;
          place-items: center;
          width: clamp(24px, 3.2vw, 54px);
          aspect-ratio: .78;
          border: clamp(2px, .3vw, 4px) solid #fff;
          background: #111;
          color: #fff;
          font-family: Georgia, serif;
          font-size: clamp(13px, 1.9vw, 30px);
          font-weight: 900;
        }
        .logoText {
          padding: .08em .22em .12em;
          border: clamp(3px, .55vw, 8px) solid #fff;
          outline: clamp(1px, .18vw, 3px) solid #111;
          background: #d52b2f;
          color: #fff;
          font-size: clamp(22px, 4.8vw, 72px);
          font-weight: 1000;
          line-height: .94;
          letter-spacing: -.075em;
          text-shadow: .05em .06em 0 #111;
          white-space: nowrap;
        }
        .lobbyCenter,
        .turnCenter {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border: 2px solid #171717;
          border-radius: 8px;
          background: rgba(247,240,221,.94);
          color: #181413;
          transform: rotate(35deg);
          box-shadow: 6px 8px 0 rgba(0,0,0,.18);
        }
        .boardQr { width: clamp(160px, 28vw, 360px); height: auto; }
        .lobbyCenter { flex-direction: column; align-items: center; text-align: center; }
        .lobbyCenter div { display: grid; gap: 6px; }
        .lobbyCenter b { font-size: clamp(13px, 1.6vw, 20px); }
        .lobbyCenter span { max-width: 260px; font-size: clamp(9px, 1.1vw, 14px); }
        .turnCenter { min-width: 230px; justify-content: center; flex-wrap: wrap; text-align: center; }
        .turnCenter p { width: 100%; margin: 0; color: #7f1d1d; font-size: 11px; font-weight: 900; letter-spacing: .14em; }
        .turnCenter > strong { width: 100%; font-size: clamp(17px, 2vw, 28px); }
        .turnCenter > span { width: 100%; font-size: 11px; }
        .diceDisplay { display: flex; gap: 7px; }
        .diceDisplay b {
          width: 42px; aspect-ratio: 1; display: grid; place-items: center;
          border-radius: 8px; background: #fff; box-shadow: 0 4px 0 #b9aaa1;
          font-family: Georgia, serif; font-size: 25px;
        }
        .hostPanel {
          min-height: 0;
          max-height: calc(100vh - clamp(24px, 4vw, 56px));
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          padding-right: 3px;
        }
        .hostHeader { display: flex; justify-content: space-between; align-items: end; gap: 12px; }
        .hostHeader p, .sectionLabel { margin: 0; color: #efbf64; font-size: 10px; font-weight: 900; letter-spacing: .18em; }
        .hostHeader h1 { margin: 4px 0 0; font-family: Georgia, serif; font-size: 28px; line-height: 1; }
        button, input, select {
          min-height: 38px; border: 1px solid rgba(255,244,228,.18); border-radius: 7px;
          padding: 0 10px; font: inherit;
        }
        button { cursor: pointer; background: #f7f0dd; color: #181413; font-weight: 900; }
        button:disabled { cursor: not-allowed; opacity: .45; }
        input, select { background: rgba(255,255,255,.07); color: #fff8ed; }
        select option { color: #181413; }
        .panelCard, .statusStrip, .errorBox {
          border: 1px solid rgba(255,244,228,.14);
          border-radius: 9px;
          background: rgba(255,255,255,.045);
          padding: 11px;
        }
        .errorBox { border-color: rgba(248,113,113,.5); color: #fecaca; font-weight: 700; }
        .statusStrip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .statusStrip div { display: grid; gap: 2px; }
        .statusStrip span { color: #a99b9f; font-size: 9px; font-weight: 800; }
        .statusStrip strong { font-size: 12px; text-transform: uppercase; }
        .joinCard { display: flex; justify-content: space-between; align-items: center; }
        .joinCard > div { display: grid; }
        .joinCode { color: #efbf64; font-family: Georgia, serif; font-size: 30px; letter-spacing: .12em; }
        .muted { margin: 8px 0 0; color: #a99b9f; font-size: 12px; }
        .assignmentRow { display: grid; grid-template-columns: 1fr 1fr auto; gap: 7px; align-items: center; margin-top: 8px; }
        .assignmentRow strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .addPlayerCard { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
        .addPlayerCard .sectionLabel { grid-column: 1 / -1; }
        .playerList { display: grid; gap: 7px; }
        .playerRow {
          --player-color: #fff;
          display: grid;
          grid-template-columns: 48px minmax(0, 1fr) auto auto;
          gap: 8px;
          align-items: center;
          min-height: 58px;
          padding: 5px 7px;
          border-left: 4px solid var(--player-color);
          background: rgba(0,0,0,.18);
        }
        .playerRow.currentPlayer { outline: 1px solid #efbf64; background: rgba(239,191,100,.09); }
        .playerRow.bankruptPlayer { opacity: .38; filter: grayscale(1); }
        .playerIdentity { display: grid; min-width: 0; }
        .playerIdentity strong, .playerIdentity span, .playerIdentity small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .playerIdentity span { color: #efbf64; font-size: 9px; font-weight: 900; }
        .playerIdentity small { color: #a99b9f; font-size: 10px; }
        .playerMoney { color: #86efac; font-family: Georgia, serif; font-size: 16px; }
        .mini { min-height: 30px; padding: 0 7px; font-size: 11px; }
        .danger { background: #fecaca; }
        .correctionButtons { display: flex; gap: 4px; }
        .primaryActions, .pcActions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .primaryActions .startButton { grid-column: 1 / -1; min-height: 54px; background: #d5282f; color: #fff; font-size: 17px; }
        .eventLog { display: grid; gap: 5px; max-height: 190px; overflow-y: auto; }
        .eventLog > div { display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,.06); padding-bottom: 4px; }
        .eventLog time { color: #a99b9f; }
        .adminLink { color: #efbf64; text-align: center; font-size: 12px; }
        @media (max-width: 1050px) {
          .hostShell { grid-template-columns: 1fr; }
          .boardStage { width: min(100%, 82vh); }

          .hostPanel { max-height: none; overflow: visible; }
        }
      `}</style>
    </main>
  )
}
