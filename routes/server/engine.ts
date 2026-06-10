import { randomUUID } from 'crypto'
import type {
  AuctionPending,
  Game,
  GameEvent,
  PendingAction,
  Player,
  PropertyState,
  TradePending,
} from '../_types'
import {
  BOARD,
  CHANCE_CARDS,
  CHEST_CARDS,
  getCard,
  getSpace,
} from '../gameData'

export interface MutableGameState {
  game: Game
  players: Player[]
  properties: PropertyState[]
  newEvents: Array<{
    event_type: GameEvent['event_type']
    actor_player_id: string | null
    message: string
    payload?: Record<string, unknown>
  }>
}

function nowIso() {
  return new Date().toISOString()
}

function emit(
  state: MutableGameState,
  eventType: GameEvent['event_type'],
  message: string,
  actorPlayerId: string | null = null,
  payload: Record<string, unknown> = {},
) {
  state.newEvents.push({
    event_type: eventType,
    actor_player_id: actorPlayerId,
    message,
    payload,
  })
}

function rollDie() {
  return Math.floor(Math.random() * 6) + 1
}

function activePlayers(state: MutableGameState) {
  return state.players
    .filter((player) => !player.bankrupt)
    .sort((a, b) => a.seat_order - b.seat_order)
}

function currentPlayer(state: MutableGameState) {
  return state.players.find((player) => player.id === state.game.current_player_id) ?? null
}

function propertyAt(state: MutableGameState, spaceIndex: number) {
  return state.properties.find((property) => property.space_index === spaceIndex) ?? null
}

function ownedProperties(state: MutableGameState, playerId: string) {
  return state.properties.filter((property) => property.owner_player_id === playerId)
}

function spacesInGroup(group: string) {
  return BOARD.filter((space) => space.group === group && space.type === 'street')
}

function hasMonopoly(state: MutableGameState, playerId: string, group: string) {
  const spaces = spacesInGroup(group)
  return (
    spaces.length > 0 &&
    spaces.every(
      (space) => propertyAt(state, space.index)?.owner_player_id === playerId,
    )
  )
}

function groupProperties(state: MutableGameState, group: string) {
  return spacesInGroup(group)
    .map((space) => propertyAt(state, space.index))
    .filter((property): property is PropertyState => Boolean(property))
}

function nextPlayer(state: MutableGameState, fromPlayerId: string) {
  const players = activePlayers(state)
  if (players.length <= 1) return players[0] ?? null
  const currentIndex = players.findIndex((player) => player.id === fromPlayerId)
  if (currentIndex >= 0) return players[(currentIndex + 1) % players.length]
  // 破産直後など activePlayers に居ない場合は席順で次のプレイヤーへ
  const from = state.players.find((player) => player.id === fromPlayerId)
  return (
    players.find((player) => from && player.seat_order > from.seat_order) ??
    players[0]
  )
}

function finishIfNeeded(state: MutableGameState) {
  const players = activePlayers(state)
  if (players.length !== 1 || state.game.status === 'lobby') return false
  state.game.status = 'finished'
  state.game.phase = 'finished'
  state.game.winner_player_id = players[0].id
  state.game.current_player_id = players[0].id
  state.game.finished_at = nowIso()
  state.game.pending_action = {}
  emit(state, 'finish', `${players[0].display_name} がゲームに勝利しました`, players[0].id)
  return true
}

function startTurn(state: MutableGameState, player: Player) {
  state.game.current_player_id = player.id
  state.game.phase = 'await_roll'
  state.game.pending_action = {}
  state.game.dice_1 = null
  state.game.dice_2 = null
  state.game.doubles_count = 0
  emit(state, 'turn', `${player.display_name} のターンです`, player.id)
}

function endTurn(
  state: MutableGameState,
  player: Player,
  rolledDoubles: boolean,
) {
  if (finishIfNeeded(state)) return
  if (rolledDoubles && !player.in_jail && !player.bankrupt) {
    state.game.phase = 'await_roll'
    state.game.pending_action = {}
    emit(state, 'turn', `${player.display_name} はゾロ目でもう一度振れます`, player.id)
    return
  }

  const next = nextPlayer(state, player.id)
  if (!next) return
  state.game.turn_number += 1
  startTurn(state, next)
}

function sendToJail(state: MutableGameState, player: Player, reason: string) {
  player.position = 10
  player.in_jail = true
  player.jail_turns = 0
  state.game.doubles_count = 0
  emit(state, 'move', `${player.display_name} は留置所へ移動しました`, player.id, { reason })
}

function calculateRent(
  state: MutableGameState,
  property: PropertyState,
  diceTotal: number,
  multiplier = 1,
) {
  const space = getSpace(property.space_index)
  if (!space || property.mortgaged || !property.owner_player_id) return 0

  if (space.type === 'railroad') {
    const count = ownedProperties(state, property.owner_player_id).filter(
      (item) => getSpace(item.space_index)?.type === 'railroad' && !item.mortgaged,
    ).length
    return (space.rents?.[Math.max(0, count - 1)] ?? 0) * multiplier
  }

  if (space.type === 'utility') {
    const count = ownedProperties(state, property.owner_player_id).filter(
      (item) => getSpace(item.space_index)?.type === 'utility' && !item.mortgaged,
    ).length
    return diceTotal * (multiplier > 1 ? multiplier : count >= 2 ? 10 : 4)
  }

  if (space.type === 'street') {
    let rent = space.rents?.[property.buildings] ?? 0
    if (
      property.buildings === 0 &&
      space.group &&
      hasMonopoly(state, property.owner_player_id, space.group)
    ) {
      rent *= 2
    }
    return rent * multiplier
  }

  return 0
}

function liquidateCpu(state: MutableGameState, player: Player) {
  const owned = ownedProperties(state, player.id)

  while (player.money < 0) {
    const withBuildings = owned
      .filter((property) => property.buildings > 0)
      .sort((a, b) => b.buildings - a.buildings)[0]
    if (!withBuildings) break
    const space = getSpace(withBuildings.space_index)
    withBuildings.buildings -= 1
    player.money += Math.floor((space.houseCost ?? 0) / 2)
    emit(state, 'build', `${player.display_name} が建物を売却しました`, player.id, {
      spaceIndex: withBuildings.space_index,
    })
  }

  while (player.money < 0) {
    const mortgageable = owned.find(
      (property) => !property.mortgaged && property.buildings === 0,
    )
    if (!mortgageable) break
    const space = getSpace(mortgageable.space_index)
    mortgageable.mortgaged = true
    player.money += space.mortgage ?? 0
    emit(state, 'mortgage', `${player.display_name} が${space.name}を抵当に入れました`, player.id)
  }
}

function liquidationValue(state: MutableGameState, player: Player) {
  return ownedProperties(state, player.id).reduce((total, property) => {
    const space = getSpace(property.space_index)
    const buildingValue =
      property.buildings * Math.floor((space.houseCost ?? 0) / 2)
    const mortgageValue = property.mortgaged ? 0 : (space.mortgage ?? 0)
    return total + buildingValue + mortgageValue
  }, player.money)
}

function declareBankrupt(
  state: MutableGameState,
  player: Player,
  creditorPlayerId: string | null,
) {
  const creditor = state.players.find((item) => item.id === creditorPlayerId) ?? null

  for (const property of ownedProperties(state, player.id)) {
    const space = getSpace(property.space_index)
    if (property.buildings > 0) {
      player.money +=
        property.buildings * Math.floor((space.houseCost ?? 0) / 2)
      property.buildings = 0
    }
  }

  if (creditor) {
    creditor.money -= Math.max(0, -player.money)
    creditor.get_out_chance += player.get_out_chance
    creditor.get_out_chest += player.get_out_chest
  } else {
    if (player.get_out_chance > 0) {
      state.game.chance_deck.push(
        ...Array(player.get_out_chance).fill('ch-get-out'),
      )
    }
    if (player.get_out_chest > 0) {
      state.game.chest_deck.push(
        ...Array(player.get_out_chest).fill('cc-get-out'),
      )
    }
  }

  for (const property of ownedProperties(state, player.id)) {
    property.owner_player_id = creditor?.id ?? null
    if (!creditor) {
      property.mortgaged = false
      property.buildings = 0
    }
  }
  player.bankrupt = true
  player.bankrupt_to_player_id = creditor?.id ?? null
  player.money = 0
  player.get_out_chance = 0
  player.get_out_chest = 0
  emit(
    state,
    'bankruptcy',
    `${player.display_name} が破産しました`,
    player.id,
    { creditorPlayerId: creditor?.id ?? null },
  )
}

function charge(
  state: MutableGameState,
  payer: Player,
  amount: number,
  creditor: Player | null,
  reason: string,
  rolledDoubles: boolean,
) {
  if (amount <= 0) return
  payer.money -= amount
  if (creditor) creditor.money += amount
  emit(
    state,
    creditor ? 'rent' : 'system',
    `${payer.display_name} が${reason}として$${amount}を支払いました`,
    payer.id,
    { amount, creditorPlayerId: creditor?.id ?? null },
  )

  if (payer.money >= 0) return
  if (payer.controller_type === 'cpu') {
    liquidateCpu(state, payer)
    if (payer.money < 0) {
      declareBankrupt(state, payer, creditor?.id ?? null)
      endTurn(state, payer, false)
    }
    return
  }
  state.game.phase = 'manage_debt'
  state.game.pending_action = {
    kind: 'debt',
    playerId: payer.id,
    creditorPlayerId: creditor?.id ?? null,
    amount,
    reason,
    rolledDoubles,
  }
}

function movePlayer(
  state: MutableGameState,
  player: Player,
  destination: number,
  collectGo: boolean,
) {
  if (collectGo && destination < player.position) {
    player.money += state.game.settings.salary
    emit(state, 'move', `${player.display_name} がGOを通過し$${state.game.settings.salary}を受け取りました`, player.id)
  }
  player.position = destination
  emit(state, 'move', `${player.display_name} が${getSpace(destination).name}へ移動しました`, player.id, {
    position: destination,
  })
}

function nearestSpace(position: number, target: 'railroad' | 'utility') {
  for (let offset = 1; offset <= 40; offset += 1) {
    const index = (position + offset) % 40
    if (getSpace(index).type === target) return index
  }
  return position
}

function drawCard(
  state: MutableGameState,
  player: Player,
  deck: 'chance' | 'chest',
  rolledDoubles: boolean,
) {
  const ids = deck === 'chance' ? state.game.chance_deck : state.game.chest_deck
  const fallback = (deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS).map((card) => card.id)
  const cardId = ids.shift() ?? fallback[0]
  const card = getCard(deck, cardId)
  if (!card) {
    endTurn(state, player, rolledDoubles)
    return
  }

  emit(state, 'card', `${player.display_name}: ${card.title} - ${card.detail}`, player.id, {
    deck,
    cardId,
  })

  const effect = card.effect
  if (effect.type !== 'get_out') ids.push(cardId)

  if (effect.type === 'money') {
    if (effect.perPlayer) {
      const others = activePlayers(state).filter((item) => item.id !== player.id)
      if (effect.amount > 0) {
        for (const other of others) {
          other.money -= effect.amount
          player.money += effect.amount
        }
      } else {
        for (const other of others) {
          player.money += effect.amount
          other.money -= effect.amount
        }
      }
      if (player.money < 0 && player.controller_type !== 'cpu') {
        state.game.phase = 'manage_debt'
        state.game.pending_action = {
          kind: 'debt',
          playerId: player.id,
          creditorPlayerId: null,
          amount: Math.abs(effect.amount) * others.length,
          reason: card.title,
          rolledDoubles,
        }
        return
      }
    } else if (effect.amount >= 0) {
      player.money += effect.amount
    } else {
      charge(
        state,
        player,
        Math.abs(effect.amount),
        null,
        card.title,
        rolledDoubles,
      )
      if (state.game.phase === 'manage_debt' || player.bankrupt) return
    }
    endTurn(state, player, rolledDoubles)
    return
  }

  if (effect.type === 'move') {
    movePlayer(state, player, effect.position, effect.collectGo)
    applyLanding(state, player, rolledDoubles)
    return
  }

  if (effect.type === 'nearest') {
    const destination = nearestSpace(player.position, effect.target)
    movePlayer(state, player, destination, true)
    applyLanding(state, player, rolledDoubles, effect.rentMultiplier)
    return
  }

  if (effect.type === 'back') {
    const destination = (player.position - effect.spaces + 40) % 40
    movePlayer(state, player, destination, false)
    applyLanding(state, player, rolledDoubles)
    return
  }

  if (effect.type === 'jail') {
    sendToJail(state, player, card.title)
    endTurn(state, player, false)
    return
  }

  if (effect.type === 'get_out') {
    if (deck === 'chance') player.get_out_chance += 1
    else player.get_out_chest += 1
    endTurn(state, player, rolledDoubles)
    return
  }

  const buildings = ownedProperties(state, player.id).reduce(
    (total, property) => total + (property.buildings === 5 ? effect.hotel : property.buildings * effect.house),
    0,
  )
  charge(state, player, buildings, null, card.title, rolledDoubles)
  if (state.game.phase !== 'manage_debt' && !player.bankrupt) {
    endTurn(state, player, rolledDoubles)
  }
}

function startAuction(
  state: MutableGameState,
  spaceIndex: number,
  turnPlayer: Player,
  rolledDoubles: boolean,
) {
  const players = activePlayers(state)
  state.game.phase = 'auction'
  state.game.pending_action = {
    kind: 'auction',
    spaceIndex,
    highestBid: 0,
    highestBidderId: null,
    activePlayerIds: players.map((player) => player.id),
    passedPlayerIds: [],
    turnPlayerId: turnPlayer.id,
    rolledDoubles,
  }
  emit(state, 'auction', `${getSpace(spaceIndex).name}の競売を開始します`, turnPlayer.id)
  runCpuAuction(state)
}

function settleAuctionIfReady(state: MutableGameState) {
  if (state.game.phase !== 'auction') return false
  const auction = state.game.pending_action as AuctionPending
  const remaining = auction.activePlayerIds.filter(
    (id) => !auction.passedPlayerIds.includes(id),
  )

  if (remaining.length > 1) return false
  // 残り1人がまだ入札していない場合は、その人に入札機会を残す
  if (remaining.length === 1 && remaining[0] !== auction.highestBidderId) {
    return false
  }
  const turnPlayer = state.players.find((player) => player.id === auction.turnPlayerId)
  const property = propertyAt(state, auction.spaceIndex)
  const winner = state.players.find((player) => player.id === auction.highestBidderId)

  if (winner && property && winner.money >= auction.highestBid) {
    winner.money -= auction.highestBid
    property.owner_player_id = winner.id
    emit(state, 'auction', `${winner.display_name} が${getSpace(auction.spaceIndex).name}を$${auction.highestBid}で落札しました`, winner.id)
  } else {
    emit(state, 'auction', `${getSpace(auction.spaceIndex).name}は落札されませんでした`)
  }

  state.game.pending_action = {}
  if (turnPlayer) endTurn(state, turnPlayer, auction.rolledDoubles)
  return true
}

function runCpuAuction(state: MutableGameState) {
  let rounds = 0
  while (state.game.phase === 'auction' && rounds < 64) {
    const auction = state.game.pending_action as AuctionPending
    const space = getSpace(auction.spaceIndex)
    let acted = false

    for (const player of activePlayers(state)) {
      if (
        player.controller_type !== 'cpu' ||
        auction.passedPlayerIds.includes(player.id) ||
        auction.highestBidderId === player.id
      ) {
        continue
      }
      acted = true
      const maxBid = Math.min(
        player.money - 150,
        Math.floor((space.price ?? 0) * (0.72 + Math.random() * 0.38)),
      )
      const nextBid = Math.max(10, auction.highestBid + 10)
      if (maxBid >= nextBid) {
        auction.highestBid = Math.min(
          maxBid,
          nextBid + Math.floor(Math.random() * 5) * 10,
        )
        auction.highestBidderId = player.id
        emit(
          state,
          'auction',
          `${player.display_name} が$${auction.highestBid}を入札しました`,
          player.id,
        )
      } else {
        auction.passedPlayerIds.push(player.id)
        emit(state, 'auction', `${player.display_name} は競売を降りました`, player.id)
      }
    }

    if (settleAuctionIfReady(state)) return

    const remainingHuman = auction.activePlayerIds.some((id) => {
      if (auction.passedPlayerIds.includes(id)) return false
      return state.players.find((player) => player.id === id)?.controller_type !== 'cpu'
    })
    if (remainingHuman || !acted) return
    rounds += 1
  }

  if (state.game.phase === 'auction') {
    const auction = state.game.pending_action as AuctionPending
    for (const playerId of auction.activePlayerIds) {
      if (
        playerId !== auction.highestBidderId &&
        !auction.passedPlayerIds.includes(playerId)
      ) {
        auction.passedPlayerIds.push(playerId)
      }
    }
    settleAuctionIfReady(state)
  }
}

function applyLanding(
  state: MutableGameState,
  player: Player,
  rolledDoubles: boolean,
  rentMultiplier = 1,
) {
  const space = getSpace(player.position)

  if (space.type === 'go' || space.type === 'jail' || space.type === 'parking') {
    endTurn(state, player, rolledDoubles)
    return
  }
  if (space.type === 'go_to_jail') {
    sendToJail(state, player, 'Go To Jail')
    endTurn(state, player, false)
    return
  }
  if (space.type === 'tax') {
    charge(state, player, space.tax ?? 0, null, space.name, rolledDoubles)
    if (state.game.phase !== 'manage_debt' && !player.bankrupt) {
      endTurn(state, player, rolledDoubles)
    }
    return
  }
  if (space.type === 'chance' || space.type === 'chest') {
    drawCard(state, player, space.type, rolledDoubles)
    return
  }

  const property = propertyAt(state, space.index)
  if (!property) {
    endTurn(state, player, rolledDoubles)
    return
  }
  if (!property.owner_player_id) {
    if (player.controller_type === 'cpu') {
      const shouldBuy = player.money - (space.price ?? 0) >= 220
      if (shouldBuy) {
        player.money -= space.price ?? 0
        property.owner_player_id = player.id
        emit(state, 'purchase', `${player.display_name} が${space.name}を購入しました`, player.id, { spaceIndex: space.index })
        endTurn(state, player, rolledDoubles)
      } else {
        startAuction(state, space.index, player, rolledDoubles)
      }
      return
    }
    state.game.phase = 'await_purchase'
    state.game.pending_action = {
      kind: 'purchase',
      playerId: player.id,
      spaceIndex: space.index,
      rolledDoubles,
    }
    return
  }
  if (property.owner_player_id === player.id || property.mortgaged) {
    endTurn(state, player, rolledDoubles)
    return
  }

  const owner = state.players.find((item) => item.id === property.owner_player_id) ?? null
  const diceTotal = (state.game.dice_1 ?? 0) + (state.game.dice_2 ?? 0)
  const rent = calculateRent(state, property, diceTotal, rentMultiplier)
  if (owner && !owner.bankrupt && rent > 0) {
    charge(state, player, rent, owner, `${space.name}の賃料`, rolledDoubles)
  }
  if (state.game.phase !== 'manage_debt' && !player.bankrupt) {
    endTurn(state, player, rolledDoubles)
  }
}

export function startGameEngine(state: MutableGameState) {
  const players = activePlayers(state)
  if (players.length < 2) throw new Error('players_required')
  state.game.status = 'playing'
  state.game.phase = 'await_roll'
  state.game.started_at = state.game.started_at ?? nowIso()
  state.game.finished_at = null
  state.game.winner_player_id = null
  state.game.turn_number = 1
  state.game.current_player_id = players[0].id
  state.game.pending_action = {}
  emit(state, 'system', 'ゲームを開始しました')
  startTurn(state, players[0])
  runCpuTurns(state)
}

export function rollTurnEngine(state: MutableGameState, playerId: string) {
  const player = currentPlayer(state)
  if (
    !player ||
    player.bankrupt ||
    player.id !== playerId ||
    state.game.status !== 'playing' ||
    state.game.phase !== 'await_roll' ||
    (state.game.pending_action as PendingAction).kind === 'trade'
  ) {
    throw new Error('not_your_turn')
  }

  const dice1 = rollDie()
  const dice2 = rollDie()
  const total = dice1 + dice2
  const rolledDoubles = dice1 === dice2
  state.game.dice_1 = dice1
  state.game.dice_2 = dice2
  state.game.doubles_count = rolledDoubles ? state.game.doubles_count + 1 : 0
  emit(state, 'dice', `${player.display_name} が ${dice1} + ${dice2} = ${total} を出しました`, player.id, {
    dice1,
    dice2,
  })

  if (player.in_jail) {
    if (rolledDoubles) {
      player.in_jail = false
      player.jail_turns = 0
      state.game.doubles_count = 0
      movePlayer(state, player, (player.position + total) % 40, true)
      applyLanding(state, player, false)
      return
    }
    if (player.jail_turns >= 2) {
      charge(state, player, 50, null, '留置所の釈放料', false)
      player.in_jail = false
      player.jail_turns = 0
      if (!player.bankrupt && state.game.pending_action.kind !== 'debt') {
        movePlayer(state, player, (player.position + total) % 40, true)
        applyLanding(state, player, false)
      }
      return
    }
    player.jail_turns += 1
    emit(state, 'turn', `${player.display_name} は留置所に留まります`, player.id)
    endTurn(state, player, false)
    return
  }

  if (state.game.doubles_count >= 3) {
    sendToJail(state, player, 'ゾロ目を3回連続で出したため')
    endTurn(state, player, false)
    return
  }

  movePlayer(state, player, (player.position + total) % 40, true)
  applyLanding(state, player, rolledDoubles)
}

export function purchaseEngine(
  state: MutableGameState,
  playerId: string,
  buy: boolean,
) {
  if (state.game.phase !== 'await_purchase') throw new Error('purchase_not_available')
  const pending = state.game.pending_action
  if (pending.kind !== 'purchase' || pending.playerId !== playerId) {
    throw new Error('purchase_not_available')
  }
  const player = state.players.find((item) => item.id === playerId)
  const property = propertyAt(state, pending.spaceIndex)
  const space = getSpace(pending.spaceIndex)
  if (!player || !property || property.owner_player_id) throw new Error('property_unavailable')

  if (buy) {
    const price = space.price ?? 0
    if (player.money < price) throw new Error('insufficient_funds')
    player.money -= price
    property.owner_player_id = player.id
    state.game.pending_action = {}
    emit(state, 'purchase', `${player.display_name} が${space.name}を$${price}で購入しました`, player.id)
    endTurn(state, player, pending.rolledDoubles)
  } else {
    startAuction(state, pending.spaceIndex, player, pending.rolledDoubles)
  }
  runCpuTurns(state)
}

export function auctionEngine(
  state: MutableGameState,
  playerId: string,
  action: 'bid' | 'pass',
  amount = 0,
) {
  if (state.game.phase !== 'auction') throw new Error('auction_not_available')
  const auction = state.game.pending_action as AuctionPending
  if (!auction.activePlayerIds.includes(playerId) || auction.passedPlayerIds.includes(playerId)) {
    throw new Error('auction_not_available')
  }
  const player = state.players.find((item) => item.id === playerId)
  if (!player || player.bankrupt) throw new Error('player_not_found')

  if (action === 'pass') {
    if (auction.highestBidderId === playerId) throw new Error('highest_bidder_cannot_pass')
    auction.passedPlayerIds.push(playerId)
    emit(state, 'auction', `${player.display_name} は競売を降りました`, player.id)
  } else {
    const bid = Math.floor(amount / 10) * 10
    if (bid < auction.highestBid + 10 || bid > player.money) throw new Error('invalid_bid')
    auction.highestBid = bid
    auction.highestBidderId = player.id
    emit(state, 'auction', `${player.display_name} が$${bid}を入札しました`, player.id)
  }
  runCpuAuction(state)
  settleAuctionIfReady(state)
  runCpuTurns(state)
}

export function managePropertyEngine(
  state: MutableGameState,
  playerId: string,
  spaceIndex: number,
  action: 'build' | 'sell' | 'mortgage' | 'unmortgage',
) {
  const player = state.players.find((item) => item.id === playerId)
  const property = propertyAt(state, spaceIndex)
  const space = getSpace(spaceIndex)
  if (!player || !property || property.owner_player_id !== player.id) {
    throw new Error('property_not_owned')
  }

  if (action === 'mortgage') {
    if (property.mortgaged || property.buildings > 0) throw new Error('cannot_mortgage')
    if (space.group && groupProperties(state, space.group).some((item) => item.buildings > 0)) {
      throw new Error('sell_buildings_first')
    }
    property.mortgaged = true
    player.money += space.mortgage ?? 0
    emit(state, 'mortgage', `${player.display_name} が${space.name}を抵当に入れました`, player.id)
  }

  if (action === 'unmortgage') {
    const cost = Math.ceil((space.mortgage ?? 0) * 1.1)
    if (!property.mortgaged || player.money < cost) throw new Error('cannot_unmortgage')
    property.mortgaged = false
    player.money -= cost
    emit(state, 'mortgage', `${player.display_name} が${space.name}の抵当を解除しました`, player.id)
  }

  if (action === 'build') {
    if (
      space.type !== 'street' ||
      !space.group ||
      !hasMonopoly(state, player.id, space.group) ||
      property.mortgaged ||
      property.buildings >= 5
    ) {
      throw new Error('cannot_build')
    }
    const group = groupProperties(state, space.group)
    if (group.some((item) => item.mortgaged)) throw new Error('cannot_build')
    const minimum = Math.min(...group.map((item) => item.buildings))
    if (property.buildings !== minimum) throw new Error('build_evenly')
    const cost = space.houseCost ?? 0
    if (player.money < cost) throw new Error('insufficient_funds')
    player.money -= cost
    property.buildings += 1
    emit(state, 'build', `${player.display_name} が${space.name}に${property.buildings === 5 ? 'ホテル' : '家'}を建てました`, player.id)
  }

  if (action === 'sell') {
    if (space.type !== 'street' || !space.group || property.buildings <= 0) {
      throw new Error('cannot_sell')
    }
    const group = groupProperties(state, space.group)
    const maximum = Math.max(...group.map((item) => item.buildings))
    if (property.buildings !== maximum) throw new Error('sell_evenly')
    property.buildings -= 1
    player.money += Math.floor((space.houseCost ?? 0) / 2)
    emit(state, 'build', `${player.display_name} が${space.name}の建物を売却しました`, player.id)
  }

  if (
    state.game.phase === 'manage_debt' &&
    state.game.pending_action.kind === 'debt' &&
    state.game.pending_action.playerId === player.id &&
    player.money >= 0
  ) {
    const rolledDoubles = state.game.pending_action.rolledDoubles
    state.game.pending_action = {}
    endTurn(state, player, rolledDoubles)
    runCpuTurns(state)
  }
}

export function payBailEngine(
  state: MutableGameState,
  playerId: string,
  useCard: boolean,
) {
  const player = currentPlayer(state)
  if (!player || player.id !== playerId || !player.in_jail || state.game.phase !== 'await_roll') {
    throw new Error('bail_not_available')
  }
  if (useCard) {
    if (player.get_out_chance > 0) {
      player.get_out_chance -= 1
      state.game.chance_deck.push('ch-get-out')
    } else if (player.get_out_chest > 0) {
      player.get_out_chest -= 1
      state.game.chest_deck.push('cc-get-out')
    } else {
      throw new Error('card_not_available')
    }
  } else {
    if (player.money < 50) throw new Error('insufficient_funds')
    player.money -= 50
  }
  player.in_jail = false
  player.jail_turns = 0
  emit(state, 'turn', `${player.display_name} が留置所から出ました`, player.id)
}

export function declareBankruptcyEngine(state: MutableGameState, playerId: string) {
  if (
    state.game.phase !== 'manage_debt' ||
    state.game.pending_action.kind !== 'debt' ||
    state.game.pending_action.playerId !== playerId
  ) {
    throw new Error('bankruptcy_not_available')
  }
  const player = state.players.find((item) => item.id === playerId)
  if (!player) throw new Error('player_not_found')
  if (liquidationValue(state, player) >= 0) {
    throw new Error('assets_available')
  }
  const creditorId = state.game.pending_action.creditorPlayerId
  declareBankrupt(state, player, creditorId)
  state.game.pending_action = {}
  endTurn(state, player, false)
  runCpuTurns(state)
}

export function proposeTradeEngine(
  state: MutableGameState,
  fromPlayerId: string,
  input: Omit<TradePending, 'kind' | 'id' | 'fromPlayerId'>,
) {
  const current = currentPlayer(state)
  if (
    !current ||
    current.id !== fromPlayerId ||
    state.game.phase !== 'await_roll' ||
    Object.keys(state.game.pending_action).length > 0
  ) {
    throw new Error('trade_not_available')
  }
  const target = state.players.find((player) => player.id === input.toPlayerId && !player.bankrupt)
  if (!target || target.id === fromPlayerId) throw new Error('invalid_trade')
  // CPU / PC操作プレイヤーは交換に応答できないため対象外
  if (target.controller_type !== 'smartphone') {
    throw new Error('trade_target_unavailable')
  }

  const owns = (playerId: string, indexes: number[]) =>
    indexes.every((index) => {
      const property = propertyAt(state, index)
      return property?.owner_player_id === playerId && property.buildings === 0
    })
  if (
    !owns(fromPlayerId, input.offeredSpaceIndexes) ||
    !owns(target.id, input.requestedSpaceIndexes) ||
    current.money < input.offeredCash ||
    target.money < input.requestedCash
  ) {
    throw new Error('invalid_trade')
  }
  state.game.pending_action = {
    kind: 'trade',
    id: randomUUID(),
    fromPlayerId,
    ...input,
  }
  emit(state, 'trade', `${current.display_name} が${target.display_name}へ交換を提案しました`, current.id)
}

export function respondTradeEngine(
  state: MutableGameState,
  playerId: string,
  accept: boolean,
) {
  const trade = state.game.pending_action
  if (trade.kind !== 'trade' || trade.toPlayerId !== playerId) {
    throw new Error('trade_not_available')
  }
  const from = state.players.find((player) => player.id === trade.fromPlayerId)
  const to = state.players.find((player) => player.id === trade.toPlayerId)
  if (!from || !to) throw new Error('player_not_found')

  if (accept) {
    if (from.money < trade.offeredCash || to.money < trade.requestedCash) {
      throw new Error('insufficient_funds')
    }
    from.money += trade.requestedCash - trade.offeredCash
    to.money += trade.offeredCash - trade.requestedCash
    for (const index of trade.offeredSpaceIndexes) {
      const property = propertyAt(state, index)
      if (property?.owner_player_id !== from.id || property.buildings > 0) throw new Error('invalid_trade')
      property.owner_player_id = to.id
    }
    for (const index of trade.requestedSpaceIndexes) {
      const property = propertyAt(state, index)
      if (property?.owner_player_id !== to.id || property.buildings > 0) throw new Error('invalid_trade')
      property.owner_player_id = from.id
    }
    emit(state, 'trade', `${to.display_name} が交換を承認しました`, to.id)
  } else {
    emit(state, 'trade', `${to.display_name} が交換を断りました`, to.id)
  }
  state.game.pending_action = {}
}

export function forceEndTurnEngine(state: MutableGameState) {
  const player = currentPlayer(state)
  if (!player || state.game.status !== 'playing') return
  state.game.pending_action = {}
  endTurn(state, player, false)
  runCpuTurns(state)
}

export function runCpuTurns(state: MutableGameState, maxTurns = 16) {
  let count = 0
  while (count < maxTurns) {
    const player = currentPlayer(state)
    if (
      !player ||
      player.bankrupt ||
      player.controller_type !== 'cpu' ||
      state.game.status !== 'playing'
    ) {
      break
    }
    if (state.game.phase === 'await_roll') {
      rollTurnEngine(state, player.id)
      count += 1
      continue
    }
    if (state.game.phase === 'auction') {
      runCpuAuction(state)
      count += 1
      if (state.game.phase !== 'auction') continue
    }
    break
  }
}
