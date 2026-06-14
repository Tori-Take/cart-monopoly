import assert from 'node:assert/strict'
import test from 'node:test'
import type { Game, Player, PropertyState } from '../_types'
import { BOARD, HOTEL_SUPPLY, HOUSE_SUPPLY } from '../gameData'
import {
  auctionEngine,
  completeTurnPresentationEngine,
  declareBankruptcyEngine,
  managePropertyEngine,
  rollTurnEngine,
  type MutableGameState,
} from './engine'

function game(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    organization_id: 'org-1',
    join_code: 'ABC123',
    join_secret: 'secret',
    title: 'TEST',
    status: 'playing',
    phase: 'await_roll',
    current_player_id: 'p1',
    winner_player_id: null,
    turn_number: 1,
    dice_1: null,
    dice_2: null,
    doubles_count: 0,
    chance_deck: [],
    chest_deck: [],
    pending_action: {},
    settings: {
      startingMoney: 1500,
      salary: 200,
      speed: 'normal',
      tokenSize: 'normal',
    },
    version: 1,
    last_mutation_id: null,
    mutation_payload: {},
    created_by: null,
    started_at: new Date(0).toISOString(),
    finished_at: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

function player(
  id: string,
  seatOrder: number,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    organization_id: 'org-1',
    game_id: 'game-1',
    seat_order: seatOrder,
    display_name: id.toUpperCase(),
    controller_type: 'smartphone',
    token_id: seatOrder === 0 ? 'hat' : seatOrder === 1 ? 'car' : 'ship',
    color: '#ffffff',
    money: 1500,
    position: 0,
    in_jail: false,
    jail_turns: 0,
    get_out_chance: 0,
    get_out_chest: 0,
    bankrupt: false,
    bankrupt_to_player_id: null,
    connected: true,
    profile_id: null,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

function property(
  id: string,
  spaceIndex: number,
  ownerPlayerId: string | null,
  overrides: Partial<PropertyState> = {},
): PropertyState {
  return {
    id,
    organization_id: 'org-1',
    game_id: 'game-1',
    space_index: spaceIndex,
    owner_player_id: ownerPlayerId,
    buildings: 0,
    mortgaged: false,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    ...overrides,
  }
}

function state(
  players: Player[],
  properties: PropertyState[] = [],
  gameOverrides: Partial<Game> = {},
): MutableGameState {
  return {
    game: game(gameOverrides),
    players,
    properties,
    newEvents: [],
  }
}

function withRandom(value: number, run: () => void) {
  const original = Math.random
  Math.random = () => value
  try {
    run()
  } finally {
    Math.random = original
  }
}

test('three consecutive doubles sends the player to jail', () => {
  const p1 = player('p1', 0, { position: 8 })
  const current = state([p1, player('p2', 1)])

  withRandom(0, () => {
    for (let roll = 1; roll <= 2; roll += 1) {
      p1.position = 8
      rollTurnEngine(current, p1.id)
      completeTurnPresentationEngine(current)
      assert.equal(current.game.doubles_count, roll)
      completeTurnPresentationEngine(current)
    }

    p1.position = 8
    rollTurnEngine(current, p1.id)
  })

  assert.equal(p1.in_jail, true)
  assert.equal(p1.position, 10)
  assert.equal(current.game.doubles_count, 0)
})

test('third failed jail roll resumes movement after debt is resolved', () => {
  const p1 = player('p1', 0, {
    position: 10,
    money: 0,
    in_jail: true,
    jail_turns: 2,
  })
  const railroad = property('property-5', 5, p1.id)
  const current = state([p1, player('p2', 1)], [railroad])
  const rolls = [0, 0.2]
  const original = Math.random
  Math.random = () => rolls.shift() ?? 0
  try {
    rollTurnEngine(current, p1.id)
  } finally {
    Math.random = original
  }

  assert.equal(current.game.phase, 'manage_debt')
  assert.equal(current.game.pending_action.kind, 'debt')
  managePropertyEngine(current, p1.id, railroad.space_index, 'mortgage')

  assert.equal(p1.position, 13)
  assert.equal(p1.in_jail, false)
  assert.equal(p1.money, 50)
  assert.equal(current.game.phase, 'presenting')
})

test('another player cannot manage property while debt is pending', () => {
  const p1 = player('p1', 0, { money: -50 })
  const p2 = player('p2', 1)
  const railroad = property('property-5', 5, p2.id)
  const utility = property('property-12', 12, p1.id)
  utility.mortgaged = true
  const current = state([p1, p2], [railroad, utility], {
    phase: 'manage_debt',
    pending_action: {
      kind: 'debt',
      playerId: p1.id,
      creditorPlayerId: p2.id,
      amount: 50,
      reason: 'rent',
      rolledDoubles: false,
      resume: { kind: 'end_turn' },
    },
  })

  assert.throws(
    () => managePropertyEngine(current, p2.id, railroad.space_index, 'mortgage'),
    /debt_in_progress/,
  )
  assert.throws(
    () => managePropertyEngine(current, p1.id, utility.space_index, 'unmortgage'),
    /debt_reduction_only/,
  )
})

test('per-player card payments never leave a player with negative cash', () => {
  const p1 = player('p1', 0, { position: 5, money: 0 })
  const p2 = player('p2', 1)
  const p3 = player('p3', 2)
  const current = state([p1, p2, p3], [], {
    chance_deck: ['ch-chairman'],
  })

  withRandom(0, () => rollTurnEngine(current, p1.id))

  assert.equal(p1.bankrupt, true)
  assert.equal(p1.money, 0)
  assert.ok(current.players.every((item) => item.money >= 0))
})

test('bankruptcy to the bank auctions every property in sequence', () => {
  const p1 = player('p1', 0, { money: -1000 })
  const p2 = player('p2', 1)
  const p3 = player('p3', 2)
  const first = property('property-1', 1, p1.id, { mortgaged: true })
  const second = property('property-3', 3, p1.id, { mortgaged: true })
  const current = state([p1, p2, p3], [first, second], {
    phase: 'manage_debt',
    pending_action: {
      kind: 'debt',
      playerId: p1.id,
      creditorPlayerId: null,
      amount: 1000,
      reason: 'tax',
      rolledDoubles: false,
      resume: { kind: 'end_turn' },
    },
  })

  declareBankruptcyEngine(current, p1.id)

  assert.equal(current.game.phase, 'auction')
  assert.equal(current.game.pending_action.kind, 'auction')
  assert.equal(current.game.pending_action.source, 'bankruptcy')
  assert.equal(current.game.pending_action.spaceIndex, 1)
  assert.deepEqual(current.game.pending_action.remainingSpaceIndexes, [3])
  assert.equal(first.mortgaged, false)

  auctionEngine(current, p2.id, 'bid', 1)
  auctionEngine(current, p3.id, 'pass')
  assert.equal(first.owner_player_id, p2.id)
  assert.equal(current.game.pending_action.kind, 'auction')
  assert.equal(current.game.pending_action.spaceIndex, 3)

  auctionEngine(current, p3.id, 'bid', 1)
  auctionEngine(current, p2.id, 'pass')
  assert.equal(second.owner_player_id, p3.id)
  assert.equal(current.game.phase, 'presenting')
  assert.equal(p1.bankrupt, true)
})

test('house and hotel supply limits block additional construction', () => {
  const p1 = player('p1', 0, { money: 10000 })
  const p2 = player('p2', 1)
  const brownOne = property('property-1', 1, p1.id)
  const brownTwo = property('property-3', 3, p1.id)
  const otherStreets = BOARD.filter(
    (space) =>
      space.type === 'street' && space.index !== 1 && space.index !== 3,
  )
  const houseStock = otherStreets.slice(0, HOUSE_SUPPLY / 4).map(
    (space, index) =>
      property(`house-${index}`, space.index, p2.id, { buildings: 4 }),
  )
  const houseShortage = state(
    [p1, p2],
    [brownOne, brownTwo, ...houseStock],
  )

  assert.throws(
    () => managePropertyEngine(houseShortage, p1.id, 1, 'build'),
    /house_shortage/,
  )

  brownOne.buildings = 4
  brownTwo.buildings = 4
  const hotelStock = otherStreets.slice(0, HOTEL_SUPPLY).map(
    (space, index) =>
      property(`hotel-${index}`, space.index, p2.id, { buildings: 5 }),
  )
  const hotelShortage = state(
    [p1, p2],
    [brownOne, brownTwo, ...hotelStock],
  )

  assert.throws(
    () => managePropertyEngine(hotelShortage, p1.id, 1, 'build'),
    /hotel_shortage/,
  )
})

test('a full hotel group can be sold when the bank has no houses', () => {
  const p1 = player('p1', 0, { money: -400 })
  const p2 = player('p2', 1)
  const brownOne = property('property-1', 1, p1.id, { buildings: 5 })
  const brownTwo = property('property-3', 3, p1.id, { buildings: 5 })
  const otherStreets = BOARD.filter(
    (space) =>
      space.type === 'street' && space.index !== 1 && space.index !== 3,
  )
  const houseStock = otherStreets.slice(0, HOUSE_SUPPLY / 4).map(
    (space, index) =>
      property(`house-${index}`, space.index, p2.id, { buildings: 4 }),
  )
  const current = state(
    [p1, p2],
    [brownOne, brownTwo, ...houseStock],
    {
      phase: 'manage_debt',
      pending_action: {
        kind: 'debt',
        playerId: p1.id,
        creditorPlayerId: null,
        amount: 400,
        reason: 'tax',
        rolledDoubles: false,
        resume: { kind: 'end_turn' },
      },
    },
  )

  managePropertyEngine(current, p1.id, 1, 'sell')

  assert.equal(brownOne.buildings, 0)
  assert.equal(brownTwo.buildings, 0)
  assert.equal(p1.money, -150)
})
