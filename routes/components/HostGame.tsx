'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { BackToAppHarbor } from '@/sdk/client'
import type {
  Controller,
  ControllerType,
  GameBundle,
  GameCard,
  GameEvent,
  GameSpeed,
  SavedGameSummary,
  TokenId,
  TokenSize,
} from '../_types'
import { TOKENS, getCard, getSpace } from '../gameData'
import { RichCard, RICH_CARD_CSS } from './RichCard'
import {
  addPlayerSlotAction,
  advanceCpuAction,
  assignControllerAction,
  completeTurnPresentationAction,
  convertPlayerToCpuAction,
  createNewGameAction,
  getHostSnapshotAction,
  hostCorrectionAction,
  hostPlayerActionAction,
  removePlayerSlotAction,
  rotateJoinSecretAction,
  setGameSpeedAction,
  setGameTokenSizeAction,
  setPauseAction,
  startGameAction,
} from '../server/actions'
import { MonopolyBoard } from './MonopolyBoard'
import { QrCode } from './QrCode'
import { TokenPiece } from './TokenPiece'

function money(value: number) {
  return `$${value.toLocaleString('en-US')}`
}

// スマホが last_seen_at を更新しなくなってから「オフライン」と判定するまでの猶予。
// スマホは約850msごとにポーリングするため、6秒あれば取りこぼしは起きない。
const PRESENCE_TIMEOUT_MS = 6000

function assignedController(controllers: Controller[], playerId: string) {
  return controllers.find(
    (controller) =>
      controller.assigned_player_id === playerId &&
      controller.status === 'assigned',
  )
}

function isControllerOnline(controller: Controller | undefined): boolean {
  if (!controller?.last_seen_at) return false
  return (
    Date.now() - new Date(controller.last_seen_at).getTime() <
    PRESENCE_TIMEOUT_MS
  )
}

function phaseLabel(phase: string) {
  return (
    {
      lobby: 'ロビー',
      await_roll: 'サイコロ待ち',
      await_card_move: 'カード移動',
      await_purchase: '購入判断',
      auction: '競売',
      manage_debt: '資産整理',
      presenting: '演出中',
      finished: 'ゲーム終了',
    }[phase] ?? phase
  )
}

function cardFromEvent(event: GameEvent): GameCard | null {
  if (event.event_type !== 'card') return null
  const cardId =
    typeof event.payload.cardId === 'string' ? event.payload.cardId : ''
  const payloadDeck = event.payload.deck
  const deck =
    payloadDeck === 'chance' || payloadDeck === 'chest'
      ? payloadDeck
      : cardId.startsWith('cc-')
        ? 'chest'
        : cardId.startsWith('ch-')
          ? 'chance'
          : null
  return deck && cardId ? getCard(deck, cardId) : null
}

function latestCardEventInTurn(events: GameEvent[]): GameEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event.event_type === 'turn') break
    if (event.event_type === 'card' && cardFromEvent(event)) return event
  }
  return null
}

// サイコロ等のコメントが出てから駒が歩き出すまでの待ち時間 (ms)。
// この間にプレイヤーがコメントを読めるようにする。
const MOVE_READ_DELAY = 2200

const SPEED_FACTORS: Record<GameSpeed, number> = {
  very_slow: 1.6, slow: 1.3, normal: 1.0, fast: 0.65, very_fast: 0.4,
}
const SPEED_OPTIONS: { value: GameSpeed; label: string }[] = [
  { value: 'very_slow', label: 'とてもゆっくり' },
  { value: 'slow',      label: 'ゆっくり' },
  { value: 'normal',    label: 'ふつう' },
  { value: 'fast',      label: 'はやい' },
  { value: 'very_fast', label: 'とても速い' },
]
const TOKEN_SIZE_SCALES: Record<TokenSize, number> = {
  small: 0.65, normal: 1.0, large: 1.45, xlarge: 2.0,
}
const TOKEN_SIZE_OPTIONS: { value: TokenSize; label: string }[] = [
  { value: 'small',  label: '小さい' },
  { value: 'normal', label: 'ふつう' },
  { value: 'large',  label: '大きい' },
  { value: 'xlarge', label: '特大' },
]

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
  initialSavedGames,
  role,
}: {
  slug: string
  initialBundle: GameBundle
  initialSavedGames: SavedGameSummary[]
  role: string | null
}) {
  const [bundle, setBundle] = useState(initialBundle)
  const [savedGames, setSavedGames] = useState(initialSavedGames)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [joinUrl, setJoinUrl] = useState('')
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [newName, setNewName] = useState('PLAYER')
  const [newType, setNewType] = useState<ControllerType>('smartphone')
  const [newToken, setNewToken] = useState<TokenId>('ship')
  // 駒の表示位置 (実位置に向かって1マスずつ追従させる)
  const [displayPositions, setDisplayPositions] = useState<Record<string, number>>({})
  // サイドバーのQRをクリックした際に中央へ大きく表示するオーバーレイ
  const [qrZoom, setQrZoom] = useState(false)
  // 操作パネルを隠し、共有画面では盤面を最大化する
  const [boardFocus, setBoardFocus] = useState(false)
  // 盤面下部に流すイベントバナー
  const [banner, setBanner] = useState<GameEvent | null>(null)
  const [activeCard, setActiveCard] = useState<{
    eventId: string
    playerId: string | null
    card: GameCard
    announced: boolean
  } | null>(null)
  const eventQueueRef = useRef<GameEvent[]>([])
  const lastEventIdRef = useRef<string | null>(null)
  const eventsInitializedRef = useRef(false)
  const bannerTimerRef = useRef<number | null>(null)
  const turnFlowBusyRef = useRef(false)
  // 新着イベント（サイコロ等のコメント）が出てから駒が動き出すまでの「読む間」。
  // この時刻まで駒の歩行を止め、先にコメントを読ませる。
  const moveGateRef = useRef(0)

  const speed: GameSpeed =
    SPEED_FACTORS[bundle.game.settings.speed as GameSpeed] !== undefined
      ? (bundle.game.settings.speed as GameSpeed)
      : 'normal'
  const speedFactor = SPEED_FACTORS[speed]
  const speedFactorRef = useRef(speedFactor)
  useEffect(() => { speedFactorRef.current = speedFactor }, [speedFactor])

  const tokenSizeKey: TokenSize =
    TOKEN_SIZE_SCALES[bundle.game.settings.tokenSize as TokenSize] !== undefined
      ? (bundle.game.settings.tokenSize as TokenSize)
      : 'normal'
  const tokenScale = TOKEN_SIZE_SCALES[tokenSizeKey]

  const showNextBanner = useCallback(() => {
    const next = eventQueueRef.current.shift() ?? null
    setBanner(next)
    if (next) {
      const delay = Math.round(3000 * speedFactorRef.current)
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
  const displayedSavedGames = savedGames.map((game) =>
    game.id === bundle.game.id
      ? {
          ...game,
          title: bundle.game.title,
          status: bundle.game.status,
          join_code: bundle.game.join_code,
          player_count: bundle.players.length,
          updated_at: bundle.game.updated_at,
        }
      : game,
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
    setActiveCard(null)
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

  // 表示位置を実位置へ1マスずつ追従させる (280ms/歩 × speedFactor)
  useEffect(() => {
    const interval = Math.round(280 * speedFactor)
    const timer = window.setInterval(() => {
      // コメントの「読む間」が明けるまでは駒を動かさない（初回配置は除く）
      const holding = Date.now() < moveGateRef.current
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
          if (holding) continue
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
    }, interval)
    return () => window.clearInterval(timer)
  }, [bundle.players, speedFactor])

  // 新着イベントをバナーのキューへ積む
  useEffect(() => {
    const events = bundle.events
    if (!eventsInitializedRef.current) {
      eventsInitializedRef.current = true
      lastEventIdRef.current = events[events.length - 1]?.id ?? null
      if (
        bundle.game.phase === 'presenting' ||
        bundle.game.phase === 'await_card_move'
      ) {
        const latestCardEvent = latestCardEventInTurn(events)
        const card = latestCardEvent ? cardFromEvent(latestCardEvent) : null
        if (latestCardEvent && card) {
          setActiveCard({
            eventId: latestCardEvent.id,
            playerId: latestCardEvent.actor_player_id,
            card,
            announced: true,
          })
        }
      }
      return
    }
    const lastId = lastEventIdRef.current
    const lastIndex = lastId
      ? events.findIndex((event) => event.id === lastId)
      : -1
    const fresh = lastIndex >= 0 ? events.slice(lastIndex + 1) : events.slice(-5)
    if (fresh.length === 0) return
    lastEventIdRef.current = events[events.length - 1]?.id ?? lastId
    // コメントを読む時間を確保するため、新着イベント直後は駒の歩行を一拍止める
    moveGateRef.current = Date.now() + MOVE_READ_DELAY * speedFactorRef.current
    const latestCardEvent = [...fresh]
      .reverse()
      .find((event) => event.event_type === 'card')
    const card = latestCardEvent ? cardFromEvent(latestCardEvent) : null
    if (latestCardEvent && card) {
      setActiveCard({
        eventId: latestCardEvent.id,
        playerId: latestCardEvent.actor_player_id,
        card,
        announced: false,
      })
    }
    eventQueueRef.current.push(...fresh)
    if (bannerTimerRef.current === null) showNextBanner()
  }, [bundle.events, bundle.game.phase, showNextBanner])

  const animationTargetKey = bundle.players
    .map((player) => `${player.id}:${player.position}`)
    .join('|')
  const allTokensSettled = bundle.players.every(
    (player) => displayPositions[player.id] === player.position,
  )
  const activeCardPlayer = activeCard
    ? bundle.players.find((player) => player.id === activeCard.playerId)
    : null
  const activeCardTokenSettled =
    !activeCardPlayer ||
    displayPositions[activeCardPlayer.id] === activeCardPlayer.position

  useEffect(() => {
    if (!activeCard || banner?.id !== activeCard.eventId) return
    setActiveCard((current) =>
      current?.eventId === activeCard.eventId
        ? current.announced
          ? current
          : { ...current, announced: true }
        : current,
    )
  }, [activeCard, banner])

  // カードを引いた駒が到着してから、内容を読む時間を必ず確保する。
  useEffect(() => {
    if (
      !activeCard ||
      !activeCard.announced ||
      !activeCardTokenSettled ||
      bundle.game.phase === 'await_card_move'
    ) {
      return
    }
    const timer = window.setTimeout(
      () =>
        setActiveCard((current) =>
          current?.eventId === activeCard.eventId ? null : current,
        ),
      Math.round(3000 * speedFactor),
    )
    return () => window.clearTimeout(timer)
  }, [
    activeCard,
    activeCardTokenSettled,
    bundle.game.phase,
    speedFactor,
  ])

  // 前ターンのコメントと駒移動、次ターンの告知を順番に消化してから操作を解禁する。
  useEffect(() => {
    if (
      bundle.game.status !== 'playing' ||
      !allTokensSettled ||
      activeCard !== null ||
      banner !== null ||
      eventQueueRef.current.length > 0 ||
      bannerTimerRef.current !== null
    ) {
      return
    }

    const player = bundle.players.find(
      (item) => item.id === bundle.game.current_player_id,
    )
    const shouldCompletePresentation = bundle.game.phase === 'presenting'
    const shouldAdvanceCpu =
      bundle.game.phase === 'await_roll' &&
      player?.controller_type === 'cpu'
    if (!shouldCompletePresentation && !shouldAdvanceCpu) return

    const wait = Math.max(
      250,
      moveGateRef.current - Date.now() + 250,
    )
    const timer = window.setTimeout(async () => {
      if (
        turnFlowBusyRef.current ||
        eventQueueRef.current.length > 0 ||
        bannerTimerRef.current !== null
      ) {
        return
      }
      turnFlowBusyRef.current = true
      try {
        const result = shouldCompletePresentation
          ? await completeTurnPresentationAction(
              slug,
              bundle.game.id,
              bundle.game.version,
            )
          : await advanceCpuAction(slug, bundle.game.id, player?.id ?? '')
        if (result.ok) {
          setBundle(result.bundle)
        } else {
          await refresh()
        }
      } catch {
        await refresh()
      } finally {
        turnFlowBusyRef.current = false
      }
    }, wait)
    return () => window.clearTimeout(timer)
  }, [
    allTokensSettled,
    activeCard,
    animationTargetKey,
    banner,
    bundle.game.current_player_id,
    bundle.game.id,
    bundle.game.phase,
    bundle.game.status,
    bundle.game.version,
    refresh,
    slug,
  ])

  const availableTokens = TOKENS.filter(
    (token) => !bundle.players.some((player) => player.token_id === token.id),
  )
  const smartphonePlayers = bundle.players.filter(
    (player) => player.controller_type === 'smartphone',
  )
  // 対局中の再接続では CPU 化された席も割り当て対象にする（割当時にスマホへ戻る）
  const assignablePlayers = bundle.players.filter(
    (player) =>
      !player.bankrupt &&
      (player.controller_type === 'smartphone' ||
        player.controller_type === 'cpu'),
  )
  const waitingControllers = bundle.controllers.filter(
    (controller) => controller.status === 'waiting',
  )
  const inPlay = bundle.game.status !== 'lobby' && bundle.game.status !== 'finished'
  const pending = bundle.game.pending_action
  const pendingSpace =
    pending.kind === 'purchase' || pending.kind === 'auction'
      ? getSpace(pending.spaceIndex)
      : null
  const auction = pending.kind === 'auction' ? pending : null
  const cardMove = pending.kind === 'card_move' ? pending : null
  const advanceLabel = cardMove?.resolution === 'end_turn' ? 'OK' : '進む'

  // 現ターン中に引いたカードを表示する（turn イベント以降の最新 card イベント）
  const lastCard = useMemo(() => {
    const reversed = [...bundle.events].reverse()
    for (const ev of reversed) {
      if (ev.event_type === 'turn') break
      const card = cardFromEvent(ev)
      if (card) return card
    }
    return null
  }, [bundle.events])
  const visibleCard =
    activeCard?.card ??
    (bundle.game.phase === 'await_card_move' ? lastCard : null)
  const visibleCardTokenArrived = activeCard
    ? activeCardTokenSettled
    : !currentPlayer ||
      (displayPositions[currentPlayer.id] ?? currentPlayer.position) ===
        currentPlayer.position

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
    if (
      (bundle.game.status === 'playing' ||
        bundle.game.status === 'paused') &&
      !window.confirm(
        '現在のゲームは保存したまま、新しいゲーム卓へ切り替えます。よろしいですか？',
      )
    ) {
      return
    }
    const title = window.prompt('新しいゲーム卓の名前', 'MONOPOLY')
    if (title === null) return
    setBusy(true)
    try {
      const result = await createNewGameAction(slug, title)
      if (result.ok) {
        setBundle(result.bundle)
        setSavedGames((current) => [
          {
            id: result.bundle.game.id,
            title: result.bundle.game.title,
            status: result.bundle.game.status,
            join_code: result.bundle.game.join_code,
            player_count: result.bundle.players.length,
            updated_at: result.bundle.game.updated_at,
          },
          ...current.filter((game) => game.id !== result.bundle.game.id),
        ])
        const url = new URL(window.location.href)
        url.searchParams.set('game', result.bundle.game.id)
        window.history.replaceState({}, '', url)
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

  function switchGame(gameId: string) {
    if (gameId === bundle.game.id) return
    const url = new URL(window.location.href)
    url.searchParams.set('game', gameId)
    window.location.assign(url)
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

  async function convertToCpu(playerId: string, name: string) {
    if (
      !window.confirm(
        `${name} をCPUに切り替えますか？\n離脱・電池切れのプレイヤーの代わりにCPUが操作を続けます。`,
      )
    )
      return
    await run(() => convertPlayerToCpuAction(slug, bundle.game.id, playerId))
  }

  // QR拡大オーバーレイは Escape キーでも閉じられるようにする
  useEffect(() => {
    if (!qrZoom) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQrZoom(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [qrZoom])

  // 盤面優先モードも Escape キーで通常表示へ戻せるようにする
  useEffect(() => {
    if (!boardFocus || qrZoom) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBoardFocus(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [boardFocus, qrZoom])

  // 駒が実位置へ歩き終えてからカードを表示する（到着前のネタバレ防止）
  const tokenArrived =
    !currentPlayer ||
    (displayPositions[currentPlayer.id] ?? currentPlayer.position) ===
      currentPlayer.position

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
          {visibleCard && visibleCardTokenArrived ? (
            <div className="rcardSlot rcardSlot--center">
              <RichCard card={visibleCard} />
              {bundle.game.phase === 'await_card_move' ? (
                <p className="advanceHint">
                  {currentPlayer?.display_name ?? 'プレイヤー'} が「{advanceLabel}」を押すと
                  {cardMove?.resolution === 'end_turn' ? '次に進みます' : '駒が移動します'}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="diceDisplay">
            <b>{bundle.game.dice_1 ?? '-'}</b>
            <b>{bundle.game.dice_2 ?? '-'}</b>
          </div>
          <strong style={{ color: currentPlayer?.color }}>
            {currentPlayer?.display_name ?? 'GAME OVER'}
          </strong>
          {!visibleCard && pendingSpace && tokenArrived ? (
            <div className="rcardSlot rcardSlot--center">
              <RichCard space={pendingSpace} />
            </div>
          ) : null}
          {auction ? (
            <div className="auctionStatus">
              <span className="auctionStatus__label">現在の最高額</span>
              <strong className="auctionStatus__bid">
                {money(auction.highestBid)}
              </strong>
              <span className="auctionStatus__bidder">
                {bundle.players.find(
                  (player) => player.id === auction.highestBidderId,
                )?.display_name ?? '入札なし'}
              </span>
            </div>
          ) : null}
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
    <main
      className="hostShell"
      data-board-focus={boardFocus ? 'true' : 'false'}
    >
      <BackToAppHarbor label="アプリ一覧へ" />

      {boardFocus ? (
        <button
          type="button"
          className="panelRestoreButton"
          onClick={() => setBoardFocus(false)}
          aria-label="操作パネルを表示"
        >
          操作パネルを表示
        </button>
      ) : null}

      {qrZoom && joinUrl ? (
        <div
          className="qrZoomOverlay"
          role="dialog"
          aria-modal="true"
          aria-label="接続用QRコード"
          onClick={() => setQrZoom(false)}
        >
          <div className="qrZoomCard" onClick={(event) => event.stopPropagation()}>
            <QrCode
              value={joinUrl}
              label="スマートフォン接続用QRコード"
              className="qrZoomImg"
            />
            <div className="qrZoomCaption">
              <b>QRを読み込んで接続</b>
              <span>接続後、ホストがプレイヤーへ割り当てます</span>
            </div>
            <button
              type="button"
              className="qrZoomClose"
              onClick={() => setQrZoom(false)}
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
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
            tokenScale={tokenScale}
          />
        </div>
      </section>

      <aside className="hostPanel">
        <header className="hostHeader">
          <div>
            <p>TABLETOP CONTROL</p>
            <h1>{bundle.game.title}</h1>
          </div>
          <div className="hostHeaderActions">
            <button
              type="button"
              className="boardFocusButton"
              onClick={() => setBoardFocus(true)}
            >
              盤面を拡大
            </button>
            <button type="button" disabled={busy} onClick={createNewGame}>
              新規卓
            </button>
          </div>
        </header>

        {error ? <div className="errorBox">{error}</div> : null}

        <section className="panelCard gamePicker">
          <label htmlFor="saved-game">保存ゲーム</label>
          <select
            id="saved-game"
            value={bundle.game.id}
            disabled={busy}
            onChange={(event) => switchGame(event.target.value)}
          >
            {displayedSavedGames.map((game) => (
              <option key={game.id} value={game.id}>
                {game.title} / {game.status} / {game.player_count}人
              </option>
            ))}
          </select>
        </section>

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

        {inPlay ? (
          <section className="panelCard reconnectCard">
            <span className="sectionLabel">🔌 端末の再接続・追加</span>
            {joinUrl ? (
              <div className="reconnectQr">
                <button
                  type="button"
                  className="reconnectQrButton"
                  onClick={() => setQrZoom(true)}
                  title="クリックで拡大表示"
                >
                  <QrCode
                    value={joinUrl}
                    label="参加用QRコード"
                    className="reconnectQrImg"
                  />
                </button>
                <p className="muted">
                  QRをクリックで拡大。スマホで読み込み、下のリストで席に割り当てます。
                </p>
              </div>
            ) : null}
            {waitingControllers.length === 0 ? (
              <p className="muted">接続待ちの端末はありません。</p>
            ) : (
              waitingControllers.map((controller) => (
                <div className="assignmentRow" key={controller.id}>
                  <strong>{controller.label}</strong>
                  <select
                    value={
                      assignments[controller.id] ??
                      assignablePlayers[0]?.id ??
                      ''
                    }
                    onChange={(event) =>
                      setAssignments((current) => ({
                        ...current,
                        [controller.id]: event.target.value,
                      }))
                    }
                  >
                    {assignablePlayers.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.display_name}
                        {player.controller_type === 'cpu' ? '（CPU解除）' : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy || assignablePlayers.length === 0}
                    onClick={() =>
                      run(() =>
                        assignControllerAction(
                          slug,
                          bundle.game.id,
                          controller.id,
                          assignments[controller.id] ??
                            assignablePlayers[0]?.id ??
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
            const isSmartphone = player.controller_type === 'smartphone'
            const online =
              isSmartphone &&
              isControllerOnline(
                assignedController(bundle.controllers, player.id),
              )
            const showCpuButton =
              inPlay && isSmartphone && !player.bankrupt
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
                  <strong>
                    {isSmartphone ? (
                      <span
                        className={`presenceDot ${online ? 'on' : 'off'}`}
                        title={online ? 'オンライン' : 'オフライン'}
                      />
                    ) : null}
                    {player.display_name}
                  </strong>
                  <span>
                    {player.controller_type.toUpperCase()}
                    {assigned ? ` / ${assigned.label}` : ''}
                    {isSmartphone && !online ? ' / 切断中' : ''}
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
                      disabled={busy || bundle.game.status === 'finished'}
                      onClick={() => correctCash(player.id)}
                    >
                      $
                    </button>
                    <button
                      type="button"
                      className="mini"
                      disabled={busy || bundle.game.status === 'finished'}
                      onClick={() => correctPosition(player.id)}
                    >
                      位置
                    </button>
                    {showCpuButton ? (
                      <button
                        type="button"
                        className={`mini ${online ? '' : 'danger'}`}
                        disabled={busy}
                        onClick={() =>
                          convertToCpu(player.id, player.display_name)
                        }
                        title="この席をCPUに切り替えて続行"
                      >
                        🤖CPU
                      </button>
                    ) : null}
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
          ) : inPlay ? (
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
                disabled={busy || bundle.game.phase === 'presenting'}
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
          ) : (
            <div className="finishedNotice">このゲームは終了しています。</div>
          )}
        </section>

        <section className="panelCard speedCard">
          <span className="sectionLabel">進行スピード</span>
          <select
            value={speed}
            disabled={busy || bundle.game.status === 'finished'}
            onChange={(event) => {
              const next = event.target.value as GameSpeed
              setBundle((current) => ({
                ...current,
                game: {
                  ...current.game,
                  settings: { ...current.game.settings, speed: next },
                },
              }))
              void run(() =>
                setGameSpeedAction(slug, bundle.game.id, next),
              )
            }}
          >
            {SPEED_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </section>

        <section className="panelCard speedCard">
          <span className="sectionLabel">駒の大きさ</span>
          <select
            value={tokenSizeKey}
            disabled={busy || bundle.game.status === 'finished'}
            onChange={(event) => {
              const next = event.target.value as TokenSize
              setBundle((current) => ({
                ...current,
                game: {
                  ...current.game,
                  settings: { ...current.game.settings, tokenSize: next },
                },
              }))
              void run(() =>
                setGameTokenSizeAction(slug, bundle.game.id, next),
              )
            }}
          >
            {TOKEN_SIZE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
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
              {bundle.game.phase === 'await_card_move' ? (
                <button
                  type="button"
                  onClick={() =>
                    run(() =>
                      hostPlayerActionAction(
                        slug,
                        bundle.game.id,
                        currentPlayer.id,
                        'advance_card',
                      ),
                    )
                  }
                >
                  {advanceLabel}
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
          min-height: 100dvh;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(320px, 410px);
          gap: clamp(10px, 1.4vw, 20px);
          padding: clamp(8px, 1.25vw, 18px);
          box-sizing: border-box;
          background:
            radial-gradient(circle at 12% 4%, rgba(213,40,47,.2), transparent 30rem),
            radial-gradient(circle at 90% 80%, rgba(36,122,82,.17), transparent 28rem),
            #1a0f14;
          color: #fff8ed;
          font-family: Inter, "Noto Sans JP", system-ui, sans-serif;
        }
        .boardColumn { min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; }
        .boardStage {
          position: relative;
          width: min(100%, 94vh);
          width: min(100%, 94dvh);
          min-width: 0;
        }
        .hostShell[data-board-focus="true"] {
          grid-template-columns: minmax(0, 1fr);
        }
        .hostShell[data-board-focus="true"] .boardStage {
          width: min(100%, calc(100vh - 16px));
          width: min(100%, calc(100dvh - 16px));
        }
        .hostShell[data-board-focus="true"] .hostPanel {
          display: none;
        }
        .panelRestoreButton {
          position: fixed;
          top: 12px;
          left: 12px;
          z-index: 20;
          min-height: 38px;
          border: 1px solid rgba(255,244,228,.35);
          background: rgba(26,15,20,.9);
          color: #fff8ed;
          box-shadow: 0 8px 22px rgba(0,0,0,.35);
          backdrop-filter: blur(5px);
        }
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
        .auctionStatus {
          width: 100%; display: grid; gap: 2px; padding: 6px 8px;
          border-radius: 6px; border: 2px solid #7f1d1d;
          background: rgba(127,29,29,.08); text-align: center;
        }
        .auctionStatus__label { font-size: 9px; font-weight: 900; letter-spacing: .14em; color: #7f1d1d; }
        .auctionStatus__bid { font-size: clamp(18px, 2.2vw, 30px); color: #7f1d1d; font-family: Georgia, serif; }
        .auctionStatus__bidder { font-size: 11px; color: #181413; }
        .rcardSlot { width: 100%; }
        .rcardSlot--center { width: 340px; max-width: 100%; margin: 6px auto; }
        .advanceHint {
          margin: 8px auto 0; max-width: 320px;
          color: #7f1d1d; font-size: 12px; font-weight: 800; text-align: center;
        }
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
        .hostHeaderActions { display: flex; justify-content: flex-end; gap: 7px; flex-wrap: wrap; }
        .boardFocusButton { background: #efbf64; }
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
        .presenceDot {
          display: inline-block; width: 8px; height: 8px; margin-right: 6px;
          border-radius: 50%; vertical-align: middle;
        }
        .presenceDot.on  { background: #4ade80; box-shadow: 0 0 5px #4ade80; }
        .presenceDot.off { background: #6b7280; }
        .reconnectCard { display: grid; gap: 4px; }
        .reconnectQr { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
        .reconnectQrButton {
          padding: 0; border: 0; background: none; cursor: pointer; line-height: 0;
          border-radius: 6px; transition: transform .12s ease, box-shadow .12s ease;
        }
        .reconnectQrButton:hover { transform: scale(1.04); box-shadow: 0 0 0 3px rgba(239,191,100,.6); }
        .reconnectQrImg { width: clamp(72px, 18vw, 110px); height: auto; border-radius: 6px; display: block; }
        .reconnectQr .muted { margin: 0; }

        .qrZoomOverlay {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; align-items: center; justify-content: center;
          padding: 24px; background: rgba(8,10,8,.82);
          backdrop-filter: blur(3px);
        }
        .qrZoomCard {
          display: flex; flex-direction: column; align-items: center; gap: 16px;
          padding: 28px 28px 22px; border: 3px solid #171717; border-radius: 14px;
          background: rgba(247,240,221,.97); color: #181413;
          box-shadow: 0 24px 60px rgba(0,0,0,.5);
          max-width: min(90vw, 560px);
        }
        .qrZoomImg { width: min(70vw, 70vh, 440px); height: auto; }
        .qrZoomCaption { display: grid; gap: 6px; text-align: center; }
        .qrZoomCaption b { font-size: clamp(16px, 2.4vw, 24px); }
        .qrZoomCaption span { font-size: clamp(11px, 1.4vw, 15px); color: #4a463c; }
        .qrZoomClose {
          padding: 8px 26px; border: 2px solid #171717; border-radius: 8px;
          background: #efbf64; color: #181413; font-weight: 900; cursor: pointer;
        }
        .qrZoomClose:hover { background: #f3cd7f; }
        .playerMoney { color: #86efac; font-family: Georgia, serif; font-size: 16px; }
        .mini { min-height: 30px; padding: 0 7px; font-size: 11px; }
        .danger { background: #fecaca; }
        .correctionButtons { display: flex; gap: 4px; }
        .primaryActions, .pcActions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .speedCard { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .speedCard select { flex: 1; }
        .primaryActions .startButton { grid-column: 1 / -1; min-height: 54px; background: #d5282f; color: #fff; font-size: 17px; }
        .eventLog { display: grid; gap: 5px; max-height: 190px; overflow-y: auto; }
        .eventLog > div { display: grid; grid-template-columns: 40px 1fr; gap: 6px; font-size: 11px; border-bottom: 1px solid rgba(255,255,255,.06); padding-bottom: 4px; }
        .eventLog time { color: #a99b9f; }
        .adminLink { color: #efbf64; text-align: center; font-size: 12px; }
        .gamePicker {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: center;
          gap: 10px;
        }
        .gamePicker label {
          color: #efbf64;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: .12em;
        }
        .gamePicker select { min-width: 0; }
        @media (max-width: 1050px) {
          .hostShell { grid-template-columns: 1fr; }
          .boardStage {
            width: min(100%, calc(100vh - 16px));
            width: min(100%, calc(100dvh - 16px));
          }

          .hostPanel { max-height: none; overflow: visible; }
        }
        ${RICH_CARD_CSS}
      `}</style>
    </main>
  )
}
