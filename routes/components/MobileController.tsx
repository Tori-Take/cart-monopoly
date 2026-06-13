'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { BoardSpace, PublicGameState } from '../_types'
import { getSpace } from '../gameData'
import { RichCard, RICH_CARD_CSS } from './RichCard'
import {
  connectControllerAction,
  controllerActionAction,
  getControllerStateAction,
  leaveControllerAction,
} from '../server/actions'
import { TokenPiece } from './TokenPiece'

type Identity = {
  controllerId: string
  controllerToken: string
  gameId: string
  label: string
}

type Preview =
  | {
      ok: true
      game: {
        id: string
        join_code: string
        title: string
        status: string
      }
    }
  | { ok: false; error: string }

const ERROR_LABELS: Record<string, string> = {
  not_your_turn: '現在はあなたのターンではありません。',
  game_paused: 'ゲームは一時停止中です。',
  purchase_not_available: '現在は購入できません。',
  insufficient_funds: '現金が不足しています。',
  invalid_bid: '現在価格より$10以上高く、所持金以内で入札してください。',
  highest_bidder_cannot_pass: '最高入札者は、他の入札があるまで降りられません。',
  cannot_build: 'この土地には建設できません。',
  build_evenly: '同色グループへ均等に建設してください。',
  sell_evenly: '同色グループから均等に売却してください。',
  sell_buildings_first: '同色グループの建物をすべて売却してください。',
  cannot_mortgage: 'この土地は抵当に入れられません。',
  cannot_unmortgage: '抵当を解除できません。',
  assets_available: 'まだ売却・抵当で支払える資産があります。',
  invalid_trade: '交換条件を確認してください。建物のある土地は交換できません。',
  trade_not_available: '現在は交換を提案できません。',
  trade_target_unavailable: 'スマートフォン操作のプレイヤーにのみ交換を提案できます。',
  state_conflict: '他の操作と重なりました。もう一度お試しください。',
}

function money(value: number) {
  return `$${value.toLocaleString('en-US')}`
}

function errorLabel(value: string) {
  return ERROR_LABELS[value] ?? value
}

export function MobileController({
  slug,
  code,
  initialGameId,
  initialJoinSecret,
  preview,
}: {
  slug: string
  code: string
  initialGameId?: string
  initialJoinSecret?: string
  preview: Preview
}) {
  const storageKey = `monopoly-controller:${slug}:${code}:${initialGameId ?? ''}`
  const [identity, setIdentity] = useState<Identity | null>(null)
  const [state, setState] = useState<PublicGameState | null>(null)
  const [label, setLabel] = useState('')
  const [error, setError] = useState<string | null>(
    preview.ok ? null : preview.error,
  )
  const [busy, setBusy] = useState(false)
  const [bid, setBid] = useState(0)
  const [tradeTarget, setTradeTarget] = useState('')
  const [offeredCash, setOfferedCash] = useState(0)
  const [requestedCash, setRequestedCash] = useState(0)
  const [offeredProperty, setOfferedProperty] = useState('')
  const [requestedProperty, setRequestedProperty] = useState('')
  const [richView, setRichView] = useState<BoardSpace | null>(null)
  const pollingRef = useRef(false)
  // ポーリング由来のエラーだけを次回成功時にクリアする (操作エラーを即座に消さない)
  const pollErrorRef = useRef(false)

  useEffect(() => {
    let timer: number | null = null
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        timer = window.setTimeout(() => {
          setIdentity(JSON.parse(stored) as Identity)
        }, 0)
      }
    } catch {
      window.localStorage.removeItem(storageKey)
    }
    return () => {
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [storageKey])

  useEffect(() => {
    if (!identity) return
    const currentIdentity = identity
    let cancelled = false

    async function poll() {
      if (pollingRef.current) return
      pollingRef.current = true
      try {
        const result = await getControllerStateAction(
          slug,
          code,
          currentIdentity.controllerId,
          currentIdentity.controllerToken,
          currentIdentity.gameId,
        )
        if (cancelled) return
        if (result.ok) {
          setState(result.state)
          if (pollErrorRef.current) {
            setError(null)
            pollErrorRef.current = false
          }
        } else if (result.error === 'controller_not_found') {
          setIdentity(null)
          setState(null)
          window.localStorage.removeItem(storageKey)
          setError('端末接続が無効になりました。QRコードを読み直してください。')
          pollErrorRef.current = true
        } else {
          setError(errorLabel(result.error))
          pollErrorRef.current = true
        }
      } finally {
        pollingRef.current = false
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), 850)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [code, identity, slug, storageKey])

  const me = state?.me ?? null
  const currentPlayer = state?.players.find(
    (player) => player.id === state.game.current_player_id,
  )
  const myProperties = useMemo(
    () =>
      state?.properties.filter(
        (property) => property.owner_player_id === me?.id,
      ) ?? [],
    [me?.id, state?.properties],
  )
  const opponents = useMemo(
    () =>
      state?.players.filter(
        (player) =>
          !player.bankrupt &&
          player.id !== me?.id &&
          player.controller_type === 'smartphone',
      ) ?? [],
    [me?.id, state?.players],
  )
  const effectiveTradeTarget = tradeTarget || opponents[0]?.id || ''
  const pending = state?.game.pending_action
  const auction = pending?.kind === 'auction' ? pending : null
  const minBid = auction ? auction.highestBid + 10 : 0
  const maxBid = me?.money ?? 0
  const bidValue = Math.min(Math.max(bid, minBid), Math.max(minBid, maxBid))
  const canAffordBid = maxBid >= minBid
  const incomingTrade =
    pending?.kind === 'trade' && pending.toPlayerId === me?.id ? pending : null
  const outgoingTrade =
    pending?.kind === 'trade' && pending.fromPlayerId === me?.id ? pending : null
  const isMyTurn = Boolean(me && currentPlayer?.id === me.id)

  const auctionActive = Boolean(auction)
  useEffect(() => {
    if (!auctionActive) setBid(0)
  }, [auctionActive])

  useEffect(() => {
    if (!richView) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRichView(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [richView])

  async function connect() {
    setBusy(true)
    setError(null)
    // 端末名が未入力ならフォールバック名で接続する
    const effectiveLabel = label.trim() || 'スマホ'
    const result = await connectControllerAction(
      slug,
      code,
      effectiveLabel,
      initialGameId,
      initialJoinSecret,
    )
    setBusy(false)
    if (!result.ok) {
      setError(errorLabel(result.error))
      return
    }
    const next: Identity = {
      controllerId: result.controllerId,
      controllerToken: result.controllerToken,
      gameId: result.gameId,
      label: effectiveLabel,
    }
    setIdentity(next)
    window.localStorage.setItem(storageKey, JSON.stringify(next))
  }

  async function act(
    action: string,
    payload: Record<string, unknown> = {},
  ) {
    if (!identity) return
    setBusy(true)
    setError(null)
    pollErrorRef.current = false
    const result = await controllerActionAction(
      slug,
      code,
      identity.controllerId,
      identity.controllerToken,
      action,
      payload,
      identity.gameId,
    )
    setBusy(false)
    if (!result.ok) setError(errorLabel(result.error))
  }

  async function disconnectLocal() {
    if (
      !window.confirm(
        'この端末の接続を解除しますか？\nホストが別の端末を割り当てられるようになります。',
      )
    )
      return
    const current = identity
    setIdentity(null)
    setState(null)
    window.localStorage.removeItem(storageKey)
    if (current) {
      // サーバー側でも席を解放する（失敗してもローカルは解除済み）
      try {
        await leaveControllerAction(
          slug,
          code,
          current.controllerId,
          current.controllerToken,
          current.gameId,
        )
      } catch {
        /* ローカル解除済みのため無視 */
      }
    }
  }

  function proposeTrade() {
    if (!effectiveTradeTarget) return
    void act('trade_propose', {
      toPlayerId: effectiveTradeTarget,
      offeredCash,
      requestedCash,
      offeredSpaceIndexes: offeredProperty ? [Number(offeredProperty)] : [],
      requestedSpaceIndexes: requestedProperty
        ? [Number(requestedProperty)]
        : [],
    })
  }

  return (
    <main className="mobileShell">
      <header className="mobileHeader">
        <div>
          <p>ROOM {code}</p>
          <h1>MONOPOLY</h1>
        </div>
        {identity ? (
          <button
            type="button"
            className="ghostButton"
            onClick={() => void disconnectLocal()}
          >
            端末解除
          </button>
        ) : null}
      </header>

      {!identity ? (
        <section className="paperCard connectCard">
          <span className="eyebrow">CONTROLLER CONNECTION</span>
          <h2>{preview.ok ? preview.game.title : '接続できません'}</h2>
          <label htmlFor="phoneLabel">端末名</label>
          <input
            id="phoneLabel"
            value={label}
            maxLength={24}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="例: 太郎のスマホ"
          />
          <button
            type="button"
            className="primaryButton"
            disabled={!preview.ok || busy}
            onClick={connect}
          >
            {busy ? '接続中...' : 'ホストへ接続'}
          </button>
        </section>
      ) : !state || !me ? (
        <section className="paperCard waitingCard">
          <div className="spinner" />
          <span className="eyebrow">CONNECTED</span>
          <h2>ホストの割り当てを待っています</h2>
          <p>
            PC画面で「{identity.label}」をプレイヤー枠へ割り当ててください。
          </p>
        </section>
      ) : (
        <>
          <section
            className={`playerHero ${isMyTurn ? 'myTurn' : ''}`}
            style={{ '--player-color': me.color } as CSSProperties}
          >
            <TokenPiece tokenId={me.token_id} size={78} />
            <div>
              <span className="eyebrow">
                {isMyTurn ? 'YOUR TURN' : 'PLAYER'}
              </span>
              <h2>{me.display_name}</h2>
              <p>{getSpace(me.position).name}</p>
            </div>
            <strong>{money(me.money)}</strong>
          </section>

          {state.game.status === 'lobby' ? (
            <section className="noticeCard">
              接続済みです。ホストがゲームを開始するまでお待ちください。
            </section>
          ) : state.game.status === 'paused' ? (
            <section className="noticeCard">ゲームは一時停止中です。</section>
          ) : state.game.status === 'finished' ? (
            <section className="noticeCard finishNotice">
              {state.players.find(
                (player) => player.id === state.game.winner_player_id,
              )?.display_name ?? '勝者'}
              が勝利しました
            </section>
          ) : (
            <section className="actionCard">
              <div className="turnLine">
                <div>
                  <span className="eyebrow">CURRENT TURN</span>
                  <strong>{currentPlayer?.display_name}</strong>
                </div>
                <div className="mobileDice">
                  <b>{state.game.dice_1 ?? '-'}</b>
                  <b>{state.game.dice_2 ?? '-'}</b>
                </div>
              </div>

              {!isMyTurn &&
              currentPlayer?.controller_type === 'cpu' &&
              state.game.phase === 'await_roll' ? (
                <button
                  type="button"
                  className="rollButton cpuButton"
                  disabled={busy}
                  onClick={() => void act('advance_cpu')}
                >
                  🤖 CPUのターンを始める
                </button>
              ) : null}

              {isMyTurn && state.game.phase === 'await_roll' && !pending?.kind ? (
                <>
                  {me.in_jail ? (
                    <div className="jailActions">
                      <button
                        type="button"
                        disabled={busy || me.money < 50}
                        onClick={() => void act('pay_bail')}
                      >
                        $50で釈放
                      </button>
                      <button
                        type="button"
                        disabled={
                          busy ||
                          me.get_out_chance + me.get_out_chest <= 0
                        }
                        onClick={() => void act('use_jail_card')}
                      >
                        釈放カード
                      </button>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="rollButton"
                    disabled={busy}
                    onClick={() => void act('roll')}
                  >
                    サイコロを振る
                  </button>
                </>
              ) : null}

              {isMyTurn &&
              state.game.phase === 'await_purchase' &&
              pending?.kind === 'purchase' ? (
                <div className="decisionPanel">
                  <span
                    style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
                    onClick={() => setRichView(getSpace(pending.spaceIndex))}
                  >{getSpace(pending.spaceIndex).name}</span>
                  <strong>{money(getSpace(pending.spaceIndex).price ?? 0)}</strong>
                  <div>
                    <button
                      type="button"
                      disabled={
                        busy ||
                        me.money < (getSpace(pending.spaceIndex).price ?? 0)
                      }
                      onClick={() => void act('buy')}
                    >
                      購入する
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={busy}
                      onClick={() => void act('auction_start')}
                    >
                      競売へ
                    </button>
                  </div>
                </div>
              ) : null}

              {auction &&
              auction.activePlayerIds.includes(me.id) &&
              !auction.passedPlayerIds.includes(me.id) ? (
                <div className="auctionPanel">
                  <span className="eyebrow">AUCTION</span>
                  <h3>{getSpace(auction.spaceIndex).name}</h3>
                  <p>
                    現在価格 {money(auction.highestBid)} /{' '}
                    {state.players.find(
                      (player) => player.id === auction.highestBidderId,
                    )?.display_name ?? '入札なし'}
                  </p>
                  <div className="bidStepper">
                    <button
                      type="button"
                      className="stepButton"
                      disabled={busy || bidValue <= minBid}
                      onClick={() => setBid(Math.max(minBid, bidValue - 10))}
                    >
                      −
                    </button>
                    <strong>{money(bidValue)}</strong>
                    <button
                      type="button"
                      className="stepButton"
                      disabled={busy || bidValue >= maxBid}
                      onClick={() => setBid(Math.min(maxBid, bidValue + 10))}
                    >
                      ＋
                    </button>
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={busy || !canAffordBid}
                      onClick={() =>
                        void act('auction_bid', { amount: bidValue })
                      }
                    >
                      入札
                    </button>
                    <button
                      type="button"
                      className="secondaryButton"
                      disabled={
                        busy || auction.highestBidderId === me.id
                      }
                      onClick={() => void act('auction_pass')}
                    >
                      降りる
                    </button>
                  </div>
                </div>
              ) : null}

              {isMyTurn && state.game.phase === 'manage_debt' ? (
                <div className="debtPanel">
                  <strong>資金が不足しています</strong>
                  <p>
                    建物売却や抵当で現金を確保してください。解消できない場合は破産します。
                  </p>
                  <button
                    type="button"
                    className="dangerButton"
                    disabled={busy}
                    onClick={() => void act('bankrupt')}
                  >
                    破産を宣言
                  </button>
                </div>
              ) : null}

              {!isMyTurn && !auction ? (
                <p className="waitingTurn">
                  {currentPlayer?.display_name} の操作を待っています
                </p>
              ) : null}
            </section>
          )}

          {incomingTrade ? (
            <section className="paperCard tradeNotice">
              <span className="eyebrow">TRADE OFFER</span>
              <h3>
                {
                  state.players.find(
                    (player) => player.id === incomingTrade.fromPlayerId,
                  )?.display_name
                }
                から交換提案
              </h3>
              <p>
                受取: {money(incomingTrade.offeredCash)}{' '}
                {incomingTrade.offeredSpaceIndexes
                  .map((index) => getSpace(index).name)
                  .join(', ')}
              </p>
              <p>
                渡す: {money(incomingTrade.requestedCash)}{' '}
                {incomingTrade.requestedSpaceIndexes
                  .map((index) => getSpace(index).name)
                  .join(', ')}
              </p>
              <div className="twoButtons">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act('trade_accept')}
                >
                  承認
                </button>
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={busy}
                  onClick={() => void act('trade_reject')}
                >
                  拒否
                </button>
              </div>
            </section>
          ) : null}

          <section className="paperCard">
            <span className="eyebrow">MY DEEDS</span>
            <h3>手持ちカード</h3>
            <div className="deedGrid">
              {myProperties.map((property) => {
                const space = getSpace(property.space_index)
                return (
                  <article
                    key={property.id}
                    className="deedCard"
                    style={{ '--deed-color': space.color ?? '#252525' } as CSSProperties}
                    onClick={() => setRichView(space)}
                  >
                    <div />
                    <strong>{space.name}</strong>
                    <span>
                      {property.mortgaged
                        ? '抵当中'
                        : property.buildings === 5
                          ? 'ホテル'
                          : property.buildings > 0
                            ? `家 ${property.buildings}`
                            : '建物なし'}
                    </span>
                    <div className="deedActions">
                      {space.type === 'street' ? (
                        <>
                          <button
                            type="button"
                            disabled={busy || property.mortgaged}
                            onClick={() =>
                              void act('build', {
                                spaceIndex: property.space_index,
                              })
                            }
                          >
                            建設
                          </button>
                          <button
                            type="button"
                            disabled={busy || property.buildings === 0}
                            onClick={() =>
                              void act('sell', {
                                spaceIndex: property.space_index,
                              })
                            }
                          >
                            売却
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy || property.buildings > 0}
                        onClick={() =>
                          void act(
                            property.mortgaged ? 'unmortgage' : 'mortgage',
                            { spaceIndex: property.space_index },
                          )
                        }
                      >
                        {property.mortgaged ? '抵当解除' : '抵当'}
                      </button>
                    </div>
                  </article>
                )
              })}
              {myProperties.length === 0 ? (
                <p className="muted">所有している権利書はありません。</p>
              ) : null}
            </div>
            <p className="cardCount">
              留置所から無料で出るカード:{' '}
              {me.get_out_chance + me.get_out_chest}
            </p>
          </section>

          {isMyTurn &&
          state.game.phase === 'await_roll' &&
          !pending?.kind &&
          opponents.length > 0 ? (
            <section className="paperCard tradeForm">
              <span className="eyebrow">TRADE</span>
              <h3>交換を提案</h3>
              <label>相手</label>
              <select
                value={effectiveTradeTarget}
                onChange={(event) => {
                  setTradeTarget(event.target.value)
                  setRequestedProperty('')
                }}
              >
                {opponents.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.display_name}
                  </option>
                ))}
              </select>
              <div className="cashPair">
                <label>
                  渡す現金
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={offeredCash}
                    onChange={(event) =>
                      setOfferedCash(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  受取現金
                  <input
                    type="number"
                    min={0}
                    step={10}
                    value={requestedCash}
                    onChange={(event) =>
                      setRequestedCash(Number(event.target.value))
                    }
                  />
                </label>
              </div>
              <label>渡す土地</label>
              <select
                value={offeredProperty}
                onChange={(event) => setOfferedProperty(event.target.value)}
              >
                <option value="">なし</option>
                {myProperties
                  .filter((property) => property.buildings === 0)
                  .map((property) => (
                    <option key={property.id} value={property.space_index}>
                      {getSpace(property.space_index).name}
                    </option>
                  ))}
              </select>
              <label>受け取る土地</label>
              <select
                value={requestedProperty}
                onChange={(event) => setRequestedProperty(event.target.value)}
              >
                <option value="">なし</option>
                {state.properties
                  .filter(
                    (property) =>
                      property.owner_player_id === effectiveTradeTarget &&
                      property.buildings === 0,
                  )
                  .map((property) => (
                    <option key={property.id} value={property.space_index}>
                      {getSpace(property.space_index).name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={proposeTrade}
              >
                提案を送る
              </button>
            </section>
          ) : outgoingTrade ? (
            <section className="noticeCard">交換提案の返答待ちです。</section>
          ) : null}

          <section className="paperCard">
            <span className="eyebrow">ALL PLAYERS</span>
            <div className="playerRanking">
              {state.players.map((player) => {
                const count = state.properties.filter(
                  (property) => property.owner_player_id === player.id,
                ).length
                return (
                  <div
                    key={player.id}
                    className={player.bankrupt ? 'bankrupt' : ''}
                  >
                    <span
                      className="colorDot"
                      style={{ backgroundColor: player.color }}
                    />
                    <TokenPiece tokenId={player.token_id} size={38} />
                    <span>
                      <strong>{player.display_name}</strong>
                      <small>
                        {getSpace(player.position).name} / 権利書 {count}
                      </small>
                    </span>
                    <b>{money(player.money)}</b>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="paperCard eventCard">
            <span className="eyebrow">GAME LOG</span>
            {[...(state.events ?? [])]
              .reverse()
              .slice(0, 12)
              .map((event) => (
                <p key={event.id}>{event.message}</p>
              ))}
          </section>
        </>
      )}

      {error ? <div className="mobileError">{error}</div> : null}

      <style>{`
        .mobileShell {
          min-height: 100vh;
          display: grid;
          align-content: start;
          gap: 12px;
          padding: 16px;
          box-sizing: border-box;
          background:
            radial-gradient(circle at 10% 0, rgba(213,40,47,.22), transparent 24rem),
            #1a0f14;
          color: #fff8ed;
          font-family: Inter, "Noto Sans JP", system-ui, sans-serif;
        }
        .mobileHeader { display: flex; justify-content: space-between; align-items: center; }
        .mobileHeader p, .eyebrow { margin: 0; color: #efbf64; font-size: 10px; font-weight: 900; letter-spacing: .18em; }
        .mobileHeader h1 { margin: 2px 0 0; font-family: Georgia, serif; font-size: 30px; letter-spacing: -.04em; }
        button, input, select {
          min-height: 46px;
          border: 1px solid rgba(24,20,19,.22);
          border-radius: 8px;
          padding: 0 12px;
          box-sizing: border-box;
          font: inherit;
        }
        button { cursor: pointer; background: #d5282f; color: #fff; font-weight: 900; }
        button:disabled { cursor: not-allowed; opacity: .42; }
        input, select { width: 100%; background: #fffdf6; color: #181413; }
        label { display: grid; gap: 5px; color: #594b47; font-size: 12px; font-weight: 800; }
        .ghostButton { min-height: 36px; background: transparent; color: #d9c9c4; border-color: rgba(255,255,255,.18); font-size: 11px; }
        .paperCard, .actionCard, .noticeCard, .playerHero {
          border: 1px solid rgba(255,244,228,.14);
          border-radius: 12px;
          padding: 14px;
          background: #f7f0dd;
          color: #181413;
          box-shadow: 0 10px 24px rgba(0,0,0,.16);
        }
        .paperCard h2, .paperCard h3 { margin: 5px 0 12px; font-family: Georgia, "Yu Mincho", serif; }
        .connectCard { display: grid; gap: 10px; margin-top: 10vh; }
        .primaryButton { margin-top: 4px; }
        .waitingCard { margin-top: 16vh; display: grid; justify-items: center; text-align: center; }
        .waitingCard p { color: #756560; line-height: 1.6; }
        .spinner {
          width: 44px; height: 44px; margin-bottom: 12px;
          border: 4px solid #d8cdb9; border-top-color: #d5282f; border-radius: 50%;
          animation: spin .8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .playerHero {
          --player-color: #fff;
          display: grid;
          grid-template-columns: 78px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          border-left: 7px solid var(--player-color);
          background: #efe3c6;
        }
        .playerHero.myTurn { box-shadow: 0 0 0 2px #efbf64, 0 10px 28px rgba(239,191,100,.2); }
        .playerHero h2 { margin: 2px 0; font-family: Georgia, serif; font-size: 24px; }
        .playerHero p { margin: 0; color: #756560; font-size: 11px; }
        .playerHero > strong { color: #247a52; font-family: Georgia, serif; font-size: 23px; }
        .noticeCard { background: rgba(239,191,100,.16); color: #ffe9b5; text-align: center; font-weight: 800; }
        .finishNotice { font-size: 20px; }
        .actionCard { display: grid; gap: 12px; background: #21181b; color: #fff8ed; }
        .turnLine { display: flex; justify-content: space-between; align-items: center; }
        .turnLine > div:first-child { display: grid; }
        .turnLine > div:first-child strong { font-size: 20px; }
        .mobileDice { display: flex; gap: 7px; }
        .mobileDice b { width: 42px; aspect-ratio: 1; display: grid; place-items: center; border-radius: 8px; background: #f7f0dd; color: #181413; box-shadow: 0 4px 0 #a99b9f; font-family: Georgia, serif; font-size: 24px; }
        .rollButton { min-height: 74px; font-size: 20px; box-shadow: 0 5px 0 #7d191d; }
        .cpuButton { background: #374151; box-shadow: 0 5px 0 #1f2937; font-size: 18px; }
        .jailActions, .twoButtons, .decisionPanel > div, .auctionPanel > div { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .secondaryButton { background: #e8dfcd; color: #181413; }
        .decisionPanel, .auctionPanel, .debtPanel { display: grid; gap: 9px; padding: 12px; border: 1px solid rgba(255,255,255,.13); border-radius: 9px; }
        .decisionPanel > strong { color: #86efac; font-size: 26px; }
        .auctionPanel h3 { margin: 0; font-size: 20px; }
        .auctionPanel p { margin: 0; color: #d9c9c4; }
        .auctionPanel > .bidStepper { grid-template-columns: 64px 1fr 64px; align-items: center; gap: 10px; }
        .bidStepper strong { text-align: center; font-size: 26px; font-family: Georgia, serif; color: #f7f0dd; }
        .bidStepper .stepButton { min-height: 56px; font-size: 30px; line-height: 1; padding: 0; }
        .debtPanel { border-color: rgba(248,113,113,.5); background: rgba(127,29,29,.2); }
        .debtPanel p { margin: 0; font-size: 12px; line-height: 1.55; }
        .dangerButton { background: #991b1b; }
        .waitingTurn { margin: 0; color: #a99b9f; text-align: center; }
        .tradeNotice p { margin: 5px 0; font-size: 13px; }
        .deedGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
        .deedCard { --deed-color: #222; display: grid; gap: 5px; overflow: hidden; border: 1px solid rgba(24,20,19,.24); border-radius: 8px; background: #fffaf0; }
        .deedCard > div:first-child { height: 15px; background: var(--deed-color); border-bottom: 1px solid #181413; }
        .deedCard > strong, .deedCard > span { padding: 0 8px; }
        .deedCard > strong { min-height: 30px; font-family: Georgia, serif; font-size: 13px; }
        .deedCard > span { color: #756560; font-size: 11px; }
        .deedActions { display: grid; grid-template-columns: repeat(2, 1fr); gap: 4px; padding: 6px; }
        .deedActions button { min-height: 34px; padding: 0 4px; font-size: 10px; }
        .cardCount { margin: 10px 0 0; color: #756560; font-size: 12px; }
        .tradeForm { display: grid; gap: 8px; }
        .cashPair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .playerRanking { display: grid; gap: 7px; margin-top: 9px; }
        .playerRanking > div { display: grid; grid-template-columns: 7px 38px minmax(0, 1fr) auto; gap: 7px; align-items: center; min-height: 45px; border-bottom: 1px solid rgba(24,20,19,.1); }
        .playerRanking > div.bankrupt { opacity: .4; filter: grayscale(1); }
        .colorDot { width: 6px; height: 34px; border-radius: 99px; }
        .playerRanking span:nth-child(3) { display: grid; }
        .playerRanking small { color: #756560; font-size: 10px; }
        .playerRanking b { color: #247a52; font-family: Georgia, serif; }
        .eventCard { display: grid; gap: 5px; }
        .eventCard p { margin: 0; padding-bottom: 5px; border-bottom: 1px solid rgba(24,20,19,.1); font-size: 11px; }
        .muted { color: #756560; font-size: 12px; }
        .rcardModal { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: rgba(10,6,8,.72); }
        .rcardModal__inner { width: min(86vw, 300px); display: grid; gap: 12px; }
        .rcardModal__close { min-height: 44px; border: 0; border-radius: 8px; background: #d5282f; color: #fff; font-weight: 800; font: inherit; cursor: pointer; }
        .deedCard { cursor: pointer; }
        .mobileError {
          position: sticky;
          z-index: 20;
          bottom: 10px;
          padding: 11px 13px;
          border: 1px solid #fca5a5;
          border-radius: 9px;
          background: #7f1d1d;
          color: #fff;
          font-weight: 800;
          box-shadow: 0 8px 24px rgba(0,0,0,.3);
        }
        ${RICH_CARD_CSS}
      `}</style>
      {richView ? (
        <div
          className="rcardModal"
          role="dialog"
          aria-modal="true"
          onClick={() => setRichView(null)}
        >
          <div className="rcardModal__inner" onClick={(e) => e.stopPropagation()}>
            <RichCard space={richView} />
            <button
              type="button"
              className="rcardModal__close"
              onClick={() => setRichView(null)}
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
    </main>
  )
}
