'use server'

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { getAdminSupabase, requireApp } from '@/sdk'
import type {
  Controller,
  ControllerType,
  Game,
  GameBundle,
  GameEvent,
  Player,
  PropertyState,
  PublicGameState,
  TokenId,
} from '../_types'
import {
  BOARD,
  CHANCE_CARDS,
  CHEST_CARDS,
  PLAYER_COLORS,
  TOKENS,
  getSpace,
  shuffle,
} from '../gameData'
import {
  auctionEngine,
  declareBankruptcyEngine,
  forceEndTurnEngine,
  managePropertyEngine,
  payBailEngine,
  proposeTradeEngine,
  purchaseEngine,
  respondTradeEngine,
  rollTurnEngine,
  runCpuTurns,
  startGameEngine,
  type MutableGameState,
} from './engine'

const APP_ID = 'monopoly'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TOKEN_PATTERN = /^[0-9a-f]{64}$/i

// ロビーだけでなく対局中・一時停止中も端末の参加を受け付ける
const JOINABLE_STATUSES = new Set(['lobby', 'playing', 'paused'])

function makeToken() {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
}

function makeJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from(
    { length: 6 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join('')
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

function normalizeName(value: string, fallback: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 24) || fallback
}

function normalizeGame(row: Record<string, unknown>) {
  return {
    ...row,
    dice_1: typeof row.dice_1 === 'number' ? row.dice_1 : null,
    dice_2: typeof row.dice_2 === 'number' ? row.dice_2 : null,
    chance_deck: Array.isArray(row.chance_deck)
      ? row.chance_deck.map(String)
      : [],
    chest_deck: Array.isArray(row.chest_deck)
      ? row.chest_deck.map(String)
      : [],
    pending_action:
      row.pending_action && typeof row.pending_action === 'object'
        ? row.pending_action
        : {},
    settings:
      row.settings && typeof row.settings === 'object'
        ? row.settings
        : { startingMoney: 1500, salary: 200 },
  } as Game
}

function isTokenId(value: unknown): value is TokenId {
  return TOKENS.some((token) => token.id === value)
}

function isControllerType(value: unknown): value is ControllerType {
  return value === 'smartphone' || value === 'cpu' || value === 'pc'
}

async function requireHost(slug: string) {
  return requireApp(
    slug,
    APP_ID,
    (role) => role === 'host' || role === 'admin',
  )
}

async function requireAdmin(slug: string) {
  return requireApp(slug, APP_ID, (role) => role === 'admin')
}

async function findOrganizationId(slug: string) {
  const supabase = getAdminSupabase()
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('slug', slug)
    .eq('status', 'active')
    .is('deleted_at', null)
    .maybeSingle()
  return data ? String(data.id) : null
}

async function findGameByCode(
  slug: string,
  rawCode: string,
  gameId?: string,
) {
  const code = normalizeCode(rawCode)
  const supabase = getAdminSupabase()
  const organizationId = await findOrganizationId(slug)
  if (!organizationId) return null

  if (gameId && UUID_PATTERN.test(gameId)) {
    const { data } = await supabase
      .from('monopoly_games')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', gameId)
      .eq('join_code', code)
      .maybeSingle()
    if (data) return normalizeGame(data)
  }

  const { data } = await supabase
    .from('monopoly_games')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('join_code', code)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data ? normalizeGame(data) : null
}

async function fetchBundle(organizationId: string, gameId: string) {
  const supabase = getAdminSupabase()
  const [
    { data: game },
    { data: players },
    { data: controllers },
    { data: properties },
    { data: events },
  ] = await Promise.all([
    supabase
      .from('monopoly_games')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('id', gameId)
      .maybeSingle(),
    supabase
      .from('monopoly_players')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('game_id', gameId)
      .order('seat_order', { ascending: true }),
    supabase
      .from('monopoly_controllers')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('game_id', gameId)
      .order('created_at', { ascending: true }),
    supabase
      .from('monopoly_properties')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('game_id', gameId)
      .order('space_index', { ascending: true }),
    supabase
      .from('monopoly_events')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('game_id', gameId)
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  if (!game) return null
  return {
    game: normalizeGame(game),
    players: (players ?? []) as Player[],
    controllers: (controllers ?? []) as Controller[],
    properties: (properties ?? []) as PropertyState[],
    events: ((events ?? []) as GameEvent[]).reverse(),
  } satisfies GameBundle
}

async function persistState(
  organizationId: string,
  state: MutableGameState,
  expectedVersion: number,
) {
  const supabase = getAdminSupabase()
  const nextVersion = expectedVersion + 1
  const { error: gameError } = await supabase
    .from('monopoly_games')
    .update({
      status: state.game.status,
      phase: state.game.phase,
      current_player_id: state.game.current_player_id,
      winner_player_id: state.game.winner_player_id,
      turn_number: state.game.turn_number,
      dice_1: state.game.dice_1,
      dice_2: state.game.dice_2,
      doubles_count: state.game.doubles_count,
      chance_deck: state.game.chance_deck,
      chest_deck: state.game.chest_deck,
      pending_action: state.game.pending_action,
      settings: state.game.settings,
      version: nextVersion,
      started_at: state.game.started_at,
      finished_at: state.game.finished_at,
    })
    .eq('organization_id', organizationId)
    .eq('id', state.game.id)
    .eq('version', expectedVersion)

  if (gameError) throw new Error('state_conflict')

  // Studio の supabase-mock は UPDATE ... RETURNING 非対応のため、
  // .select() の戻りではなく再読込で楽観ロックの成立を確認する
  const { data: verifyRow } = await supabase
    .from('monopoly_games')
    .select('version')
    .eq('organization_id', organizationId)
    .eq('id', state.game.id)
    .maybeSingle()
  if (!verifyRow || Number(verifyRow.version) !== nextVersion) {
    throw new Error('state_conflict')
  }
  state.game.version = nextVersion

  const writeResults = await Promise.all([
    ...state.players.map((player) =>
      supabase
        .from('monopoly_players')
        .update({
          display_name: player.display_name,
          controller_type: player.controller_type,
          token_id: player.token_id,
          color: player.color,
          money: player.money,
          position: player.position,
          in_jail: player.in_jail,
          jail_turns: player.jail_turns,
          get_out_chance: player.get_out_chance,
          get_out_chest: player.get_out_chest,
          bankrupt: player.bankrupt,
          bankrupt_to_player_id: player.bankrupt_to_player_id,
          connected: player.connected,
        })
        .eq('organization_id', organizationId)
        .eq('game_id', state.game.id)
        .eq('id', player.id),
    ),
    ...state.properties.map((property) =>
      supabase
        .from('monopoly_properties')
        .update({
          owner_player_id: property.owner_player_id,
          buildings: property.buildings,
          mortgaged: property.mortgaged,
        })
        .eq('organization_id', organizationId)
        .eq('game_id', state.game.id)
        .eq('id', property.id),
    ),
  ])
  const failedWrite = writeResults.find((result) => result.error)
  if (failedWrite?.error) {
    throw new Error(`persist_failed: ${failedWrite.error.message}`)
  }

  if (state.newEvents.length > 0) {
    const now = Date.now()
    const { error: eventError } = await supabase.from('monopoly_events').insert(
      state.newEvents.map((event, i) => ({
        organization_id: organizationId,
        game_id: state.game.id,
        event_type: event.event_type,
        actor_player_id: event.actor_player_id,
        message: event.message.slice(0, 240),
        payload: event.payload ?? {},
        created_at: new Date(now + i).toISOString(),
      })),
    )
    if (eventError) throw new Error(`persist_failed: ${eventError.message}`)
  }
}

async function mutateGame(
  organizationId: string,
  gameId: string,
  mutate: (state: MutableGameState) => void,
) {
  const bundle = await fetchBundle(organizationId, gameId)
  if (!bundle) throw new Error('game_not_found')
  const expectedVersion = bundle.game.version
  const state: MutableGameState = {
    game: bundle.game,
    players: bundle.players,
    properties: bundle.properties,
    newEvents: [],
  }
  mutate(state)
  await persistState(organizationId, state, expectedVersion)
  return fetchBundle(organizationId, gameId)
}

async function createGame(
  organizationId: string,
  creatorId: string,
  title = 'MONOPOLY',
) {
  const supabase = getAdminSupabase()
  let game: Game | null = null

  for (let attempt = 0; !game && attempt < 5; attempt += 1) {
    const { data } = await supabase
      .from('monopoly_games')
      .insert({
        organization_id: organizationId,
        join_code: makeJoinCode(),
        join_secret: makeToken(),
        title: normalizeName(title, 'MONOPOLY'),
        chance_deck: shuffle(CHANCE_CARDS.map((card) => card.id)),
        chest_deck: shuffle(CHEST_CARDS.map((card) => card.id)),
        created_by: creatorId,
      })
      .select('*')
      .maybeSingle()
    if (data) game = normalizeGame(data)
  }
  if (!game) throw new Error('game_create_failed')

  const { data: players, error: playerError } = await supabase
    .from('monopoly_players')
    .insert([
      {
        organization_id: organizationId,
        game_id: game.id,
        seat_order: 0,
        display_name: 'PLAYER 1',
        controller_type: 'smartphone',
        token_id: 'hat',
        color: PLAYER_COLORS[0],
        // 複数行 insert は全行同じカラム構成にする (欠けたキーは null になり not null 違反)
        connected: false,
      },
      {
        organization_id: organizationId,
        game_id: game.id,
        seat_order: 1,
        display_name: 'CPU 1',
        controller_type: 'cpu',
        token_id: 'car',
        color: PLAYER_COLORS[1],
        connected: true,
      },
    ])
    .select('*')

  if (playerError || !players) throw new Error('player_create_failed')

  const purchasable = BOARD.filter(
    (space) =>
      space.type === 'street' ||
      space.type === 'railroad' ||
      space.type === 'utility',
  )
  await supabase.from('monopoly_properties').insert(
    purchasable.map((space) => ({
      organization_id: organizationId,
      game_id: game!.id,
      space_index: space.index,
    })),
  )
  await supabase.from('monopoly_events').insert({
    organization_id: organizationId,
    game_id: game.id,
    event_type: 'system',
    actor_player_id: null,
    message: 'ゲーム卓を作成しました',
    payload: {},
  })
  return fetchBundle(organizationId, game.id)
}

export async function getOrCreateHostGameAction(slug: string) {
  const ctx = await requireHost(slug)
  const supabase = getAdminSupabase()
  const { data } = await supabase
    .from('monopoly_games')
    .select('id')
    .eq('organization_id', ctx.actor.organizationId)
    .neq('status', 'finished')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const bundle = data
    ? await fetchBundle(ctx.actor.organizationId, String(data.id))
    : await createGame(ctx.actor.organizationId, ctx.actor.id)
  return bundle
    ? { ok: true as const, bundle }
    : { ok: false as const, error: 'game_not_found' }
}

export async function createNewGameAction(slug: string, title: string) {
  const ctx = await requireHost(slug)
  const bundle = await createGame(ctx.actor.organizationId, ctx.actor.id, title)
  revalidatePath(`/org/${slug}/apps/${APP_ID}`)
  return bundle
    ? { ok: true as const, bundle }
    : { ok: false as const, error: 'game_create_failed' }
}

export async function getHostSnapshotAction(slug: string, gameId: string) {
  const ctx = await requireHost(slug)
  const bundle = await fetchBundle(ctx.actor.organizationId, gameId)
  return bundle
    ? { ok: true as const, bundle }
    : { ok: false as const, error: 'game_not_found' }
}

export async function addPlayerSlotAction(
  slug: string,
  gameId: string,
  input: {
    displayName: string
    controllerType: string
    tokenId: string
  },
) {
  const ctx = await requireHost(slug)
  const bundle = await fetchBundle(ctx.actor.organizationId, gameId)
  if (!bundle || bundle.game.status !== 'lobby') {
    return { ok: false as const, error: 'lobby_only' }
  }
  if (bundle.players.length >= 8) {
    return { ok: false as const, error: 'player_limit' }
  }
  if (!isControllerType(input.controllerType) || !isTokenId(input.tokenId)) {
    return { ok: false as const, error: 'invalid_player' }
  }
  // PC操作は競売・債務整理を操作できないため、対応が揃うまで追加不可
  if (input.controllerType === 'pc') {
    return { ok: false as const, error: 'PC操作プレイヤーは現在未対応です' }
  }
  if (bundle.players.some((player) => player.token_id === input.tokenId)) {
    return { ok: false as const, error: 'token_in_use' }
  }

  const usedSeats = new Set(bundle.players.map((player) => player.seat_order))
  const seatOrder = Array.from({ length: 8 }, (_, index) => index).find(
    (index) => !usedSeats.has(index),
  )
  if (seatOrder === undefined) {
    return { ok: false as const, error: 'player_limit' }
  }
  const supabase = getAdminSupabase()
  const { error } = await supabase.from('monopoly_players').insert({
    organization_id: ctx.actor.organizationId,
    game_id: gameId,
    seat_order: seatOrder,
    display_name: normalizeName(input.displayName, `PLAYER ${seatOrder + 1}`),
    controller_type: input.controllerType,
    token_id: input.tokenId,
    color: PLAYER_COLORS[seatOrder % PLAYER_COLORS.length],
    connected: input.controllerType !== 'smartphone',
  })
  if (error) return { ok: false as const, error: error.message }
  revalidatePath(`/org/${slug}/apps/${APP_ID}`)
  return { ok: true as const }
}

export async function removePlayerSlotAction(
  slug: string,
  gameId: string,
  playerId: string,
) {
  const ctx = await requireHost(slug)
  const bundle = await fetchBundle(ctx.actor.organizationId, gameId)
  if (!bundle || bundle.game.status !== 'lobby') {
    return { ok: false as const, error: 'lobby_only' }
  }
  const supabase = getAdminSupabase()
  await supabase
    .from('monopoly_controllers')
    .update({ assigned_player_id: null, status: 'waiting' })
    .eq('organization_id', ctx.actor.organizationId)
    .eq('game_id', gameId)
    .eq('assigned_player_id', playerId)
  const { error } = await supabase
    .from('monopoly_players')
    .delete()
    .eq('organization_id', ctx.actor.organizationId)
    .eq('game_id', gameId)
    .eq('id', playerId)
  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const }
}

export async function assignControllerAction(
  slug: string,
  gameId: string,
  controllerId: string,
  playerId: string,
) {
  const ctx = await requireHost(slug)
  const orgId = ctx.actor.organizationId
  const bundle = await fetchBundle(orgId, gameId)
  if (!bundle || bundle.game.status === 'finished') {
    return { ok: false as const, error: 'game_finished' }
  }
  const inPlay = bundle.game.status !== 'lobby'
  // 再接続時は CPU 化された席にも割り当て可能（割当と同時にスマホ操作へ戻す）
  const player = bundle.players.find(
    (item) =>
      item.id === playerId &&
      (item.controller_type === 'smartphone' || item.controller_type === 'cpu'),
  )
  const controller = bundle.controllers.find((item) => item.id === controllerId)
  if (!player || !controller || controller.status !== 'waiting') {
    return { ok: false as const, error: 'invalid_assignment' }
  }
  const wasCpu = player.controller_type === 'cpu'
  const supabase = getAdminSupabase()
  // この席に割り当て済みの旧コントローラーを解放する。
  // ロビーでは再利用できるよう waiting、対局中は古い端末なので disconnected。
  await supabase
    .from('monopoly_controllers')
    .update({
      assigned_player_id: null,
      status: inPlay ? 'disconnected' : 'waiting',
    })
    .eq('organization_id', orgId)
    .eq('game_id', gameId)
    .eq('assigned_player_id', playerId)
  await supabase
    .from('monopoly_controllers')
    .update({ assigned_player_id: playerId, status: 'assigned' })
    .eq('organization_id', orgId)
    .eq('game_id', gameId)
    .eq('id', controllerId)

  if (inPlay) {
    // 対局中はプレイヤー状態をバージョンロック経由で更新する
    await mutateGame(orgId, gameId, (state) => {
      const target = state.players.find((item) => item.id === playerId)
      if (!target) throw new Error('player_not_found')
      target.connected = true
      if (target.controller_type === 'cpu') target.controller_type = 'smartphone'
      state.newEvents.push({
        event_type: 'assign',
        actor_player_id: playerId,
        message: wasCpu
          ? `${target.display_name} がスマートフォンで復帰しました（CPU解除）`
          : `${controller.label} を ${target.display_name} に割り当てました`,
      })
    })
  } else {
    await supabase
      .from('monopoly_players')
      .update({ connected: true })
      .eq('organization_id', orgId)
      .eq('game_id', gameId)
      .eq('id', playerId)
    await supabase.from('monopoly_events').insert({
      organization_id: orgId,
      game_id: gameId,
      event_type: 'assign',
      actor_player_id: playerId,
      message: `${controller.label} を ${player.display_name} に割り当てました`,
      payload: { controllerId },
    })
  }
  revalidatePath(`/org/${slug}/apps/${APP_ID}`)
  return { ok: true as const }
}

// スマートフォン側からの接続解除。席を空け、ホストが別端末を割り当て可能にする。
export async function leaveControllerAction(
  slug: string,
  rawCode: string,
  controllerId: string,
  controllerToken: string,
  gameId?: string,
) {
  const validated = await validateController(
    slug,
    rawCode,
    controllerId,
    controllerToken,
    gameId,
  )
  if (!validated) return { ok: false as const, error: 'controller_not_found' }
  const orgId = validated.game.organization_id
  const playerId = validated.controller.assigned_player_id
  const supabase = getAdminSupabase()
  await supabase
    .from('monopoly_controllers')
    .update({ assigned_player_id: null, status: 'disconnected' })
    .eq('organization_id', orgId)
    .eq('id', controllerId)
  if (playerId) {
    await supabase
      .from('monopoly_players')
      .update({ connected: false })
      .eq('organization_id', orgId)
      .eq('game_id', validated.game.id)
      .eq('id', playerId)
    await supabase.from('monopoly_events').insert({
      organization_id: orgId,
      game_id: validated.game.id,
      event_type: 'system',
      actor_player_id: playerId,
      message: `${validated.controller.label} が接続を解除しました`,
      payload: { controllerId },
    })
  }
  return { ok: true as const }
}

// ホストがオフライン/離脱した席を CPU に切り替える（案B）。
// その席のターン中なら CPU 操作で即座に進める。
export async function convertPlayerToCpuAction(
  slug: string,
  gameId: string,
  playerId: string,
) {
  const ctx = await requireHost(slug)
  const orgId = ctx.actor.organizationId
  const supabase = getAdminSupabase()
  // この席のコントローラーを解放する
  await supabase
    .from('monopoly_controllers')
    .update({ assigned_player_id: null, status: 'disconnected' })
    .eq('organization_id', orgId)
    .eq('game_id', gameId)
    .eq('assigned_player_id', playerId)
  try {
    const updated = await mutateGame(orgId, gameId, (state) => {
      const player = state.players.find((item) => item.id === playerId)
      if (!player) throw new Error('player_not_found')
      if (player.controller_type !== 'smartphone') {
        throw new Error('not_smartphone')
      }
      player.controller_type = 'cpu'
      player.connected = true
      state.newEvents.push({
        event_type: 'system',
        actor_player_id: playerId,
        message: `${player.display_name} をCPUに切り替えました`,
      })
      if (
        state.game.status === 'playing' &&
        state.game.current_player_id === playerId
      ) {
        runCpuTurns(state)
      }
    })
    return updated
      ? { ok: true as const, bundle: updated }
      : { ok: false as const, error: 'game_not_found' }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'action_failed',
    }
  }
}

export async function startGameAction(slug: string, gameId: string) {
  const ctx = await requireHost(slug)
  const bundle = await fetchBundle(ctx.actor.organizationId, gameId)
  if (!bundle || bundle.game.status !== 'lobby') {
    return { ok: false as const, error: 'lobby_only' }
  }
  if (bundle.players.length < 2) {
    return { ok: false as const, error: 'players_required' }
  }
  const missingController = bundle.players.find(
    (player) =>
      player.controller_type === 'smartphone' &&
      !bundle.controllers.some(
        (controller) =>
          controller.assigned_player_id === player.id &&
          controller.status === 'assigned',
      ),
  )
  if (missingController) {
    return {
      ok: false as const,
      error: `${missingController.display_name} にスマートフォンを割り当ててください`,
    }
  }

  const updated = await mutateGame(ctx.actor.organizationId, gameId, (state) => {
    startGameEngine(state)
  })
  return updated
    ? { ok: true as const, bundle: updated }
    : { ok: false as const, error: 'game_not_found' }
}

export async function setPauseAction(
  slug: string,
  gameId: string,
  paused: boolean,
) {
  const ctx = await requireHost(slug)
  const supabase = getAdminSupabase()
  const { error } = await supabase
    .from('monopoly_games')
    .update({ status: paused ? 'paused' : 'playing' })
    .eq('organization_id', ctx.actor.organizationId)
    .eq('id', gameId)
    .in('status', ['playing', 'paused'])
  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const }
}

export async function rotateJoinSecretAction(slug: string, gameId: string) {
  const ctx = await requireHost(slug)
  const supabase = getAdminSupabase()
  const { data, error } = await supabase
    .from('monopoly_games')
    .update({ join_secret: makeToken() })
    .eq('organization_id', ctx.actor.organizationId)
    .eq('id', gameId)
    .eq('status', 'lobby')
    .select('*')
    .maybeSingle()
  return error || !data
    ? { ok: false as const, error: 'lobby_only' }
    : { ok: true as const, game: normalizeGame(data) }
}

export async function hostCorrectionAction(
  slug: string,
  gameId: string,
  input: {
    action: 'cash' | 'position' | 'end_turn'
    playerId?: string
    value?: number
  },
) {
  const ctx = await requireHost(slug)
  const updated = await mutateGame(ctx.actor.organizationId, gameId, (state) => {
    if (input.action === 'end_turn') {
      forceEndTurnEngine(state)
      return
    }
    const player = state.players.find((item) => item.id === input.playerId)
    if (!player) throw new Error('player_not_found')
    if (input.action === 'cash') {
      const amount = Math.trunc(Number(input.value) || 0)
      player.money = Math.max(0, player.money + amount)
      state.newEvents.push({
        event_type: 'correction',
        actor_player_id: player.id,
        message: `${player.display_name} の現金を ${amount >= 0 ? '+' : ''}$${amount} 調整しました`,
      })
    } else {
      player.position = Math.max(0, Math.min(39, Math.trunc(Number(input.value) || 0)))
      state.newEvents.push({
        event_type: 'correction',
        actor_player_id: player.id,
        message: `${player.display_name} の位置を ${getSpace(player.position).name} に変更しました`,
      })
    }
  })
  return updated
    ? { ok: true as const, bundle: updated }
    : { ok: false as const, error: 'game_not_found' }
}

export async function advanceCpuAction(slug: string, gameId: string) {
  const ctx = await requireHost(slug)
  const updated = await mutateGame(ctx.actor.organizationId, gameId, (state) => {
    runCpuTurns(state)
  })
  return updated
    ? { ok: true as const, bundle: updated }
    : { ok: false as const, error: 'game_not_found' }
}

export async function getJoinPreviewAction(
  slug: string,
  rawCode: string,
  gameId?: string,
  joinSecret?: string,
) {
  const game = await findGameByCode(slug, rawCode, gameId)
  if (
    !game ||
    !joinSecret ||
    !TOKEN_PATTERN.test(joinSecret) ||
    game.join_secret !== joinSecret.toLowerCase() ||
    !JOINABLE_STATUSES.has(game.status)
  ) {
    return {
      ok: false as const,
      error: 'この参加用QRコードは無効か、ゲームが終了しています',
    }
  }
  return {
    ok: true as const,
    game: {
      id: game.id,
      join_code: game.join_code,
      title: game.title,
      status: game.status,
    },
  }
}

export async function connectControllerAction(
  slug: string,
  rawCode: string,
  label: string,
  gameId?: string,
  joinSecret?: string,
) {
  const game = await findGameByCode(slug, rawCode, gameId)
  if (
    !game ||
    !joinSecret ||
    game.join_secret !== joinSecret.toLowerCase() ||
    !JOINABLE_STATUSES.has(game.status)
  ) {
    return { ok: false as const, error: 'QRコードを読み直してください' }
  }
  const token = makeToken()
  const supabase = getAdminSupabase()
  const { data, error } = await supabase
    .from('monopoly_controllers')
    .insert({
      organization_id: game.organization_id,
      game_id: game.id,
      controller_token: token,
      label: normalizeName(label, 'SMARTPHONE'),
      last_seen_at: new Date().toISOString(),
    })
    .select('*')
    .maybeSingle()
  if (error || !data) {
    return { ok: false as const, error: error?.message ?? 'connect_failed' }
  }
  await supabase.from('monopoly_events').insert({
    organization_id: game.organization_id,
    game_id: game.id,
    event_type: 'join',
    actor_player_id: null,
    message: `${String(data.label)} がコントローラーとして接続しました`,
    payload: { controllerId: data.id },
  })
  return {
    ok: true as const,
    controllerId: String(data.id),
    controllerToken: token,
    gameId: game.id,
  }
}

async function validateController(
  slug: string,
  rawCode: string,
  controllerId: string,
  controllerToken: string,
  gameId?: string,
) {
  if (
    !UUID_PATTERN.test(controllerId) ||
    !TOKEN_PATTERN.test(controllerToken)
  ) {
    return null
  }
  const game = await findGameByCode(slug, rawCode, gameId)
  if (!game) return null
  const supabase = getAdminSupabase()
  const { data: controller } = await supabase
    .from('monopoly_controllers')
    .select('*')
    .eq('organization_id', game.organization_id)
    .eq('game_id', game.id)
    .eq('id', controllerId)
    .eq('controller_token', controllerToken)
    .maybeSingle()
  if (!controller) return null
  await supabase
    .from('monopoly_controllers')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('organization_id', game.organization_id)
    .eq('id', controllerId)
  return { game, controller: controller as Controller }
}

export async function getControllerStateAction(
  slug: string,
  rawCode: string,
  controllerId: string,
  controllerToken: string,
  gameId?: string,
) {
  const validated = await validateController(
    slug,
    rawCode,
    controllerId,
    controllerToken,
    gameId,
  )
  if (!validated) return { ok: false as const, error: 'controller_not_found' }
  const bundle = await fetchBundle(
    validated.game.organization_id,
    validated.game.id,
  )
  if (!bundle) return { ok: false as const, error: 'game_not_found' }
  const me =
    bundle.players.find(
      (player) => player.id === validated.controller.assigned_player_id,
    ) ?? null
  const publicPlayers = bundle.players.map((player) => ({
    ...player,
    profile_id: null,
    get_out_chance: player.id === me?.id ? player.get_out_chance : 0,
    get_out_chest: player.id === me?.id ? player.get_out_chest : 0,
  }))
  const { join_secret: _secret, created_by: _creator, ...publicGame } =
    bundle.game
  const state: PublicGameState = {
    game: publicGame,
    players: publicPlayers,
    properties: bundle.properties,
    events: bundle.events,
    controller: {
      id: validated.controller.id,
      label: validated.controller.label,
      status: validated.controller.status,
      assigned_player_id: validated.controller.assigned_player_id,
    },
    me,
  }
  return { ok: true as const, state }
}

export async function controllerActionAction(
  slug: string,
  rawCode: string,
  controllerId: string,
  controllerToken: string,
  action: string,
  payload: Record<string, unknown> = {},
  gameId?: string,
) {
  const validated = await validateController(
    slug,
    rawCode,
    controllerId,
    controllerToken,
    gameId,
  )
  if (!validated || !validated.controller.assigned_player_id) {
    return { ok: false as const, error: 'controller_not_assigned' }
  }
  const playerId = validated.controller.assigned_player_id
  try {
    await mutateGame(
      validated.game.organization_id,
      validated.game.id,
      (state) => {
        if (state.game.status === 'paused') throw new Error('game_paused')
        if (action === 'roll') rollTurnEngine(state, playerId)
        else if (action === 'buy') purchaseEngine(state, playerId, true)
        else if (action === 'auction_start') purchaseEngine(state, playerId, false)
        else if (action === 'auction_bid') auctionEngine(state, playerId, 'bid', Number(payload.amount))
        else if (action === 'auction_pass') auctionEngine(state, playerId, 'pass')
        else if (
          action === 'build' ||
          action === 'sell' ||
          action === 'mortgage' ||
          action === 'unmortgage'
        ) {
          managePropertyEngine(
            state,
            playerId,
            Number(payload.spaceIndex),
            action,
          )
        } else if (action === 'pay_bail') payBailEngine(state, playerId, false)
        else if (action === 'use_jail_card') payBailEngine(state, playerId, true)
        else if (action === 'bankrupt') declareBankruptcyEngine(state, playerId)
        else if (action === 'trade_propose') {
          proposeTradeEngine(state, playerId, {
            toPlayerId: String(payload.toPlayerId ?? ''),
            offeredCash: Math.max(0, Math.trunc(Number(payload.offeredCash) || 0)),
            requestedCash: Math.max(0, Math.trunc(Number(payload.requestedCash) || 0)),
            offeredSpaceIndexes: Array.isArray(payload.offeredSpaceIndexes)
              ? payload.offeredSpaceIndexes.map(Number)
              : [],
            requestedSpaceIndexes: Array.isArray(payload.requestedSpaceIndexes)
              ? payload.requestedSpaceIndexes.map(Number)
              : [],
          })
        } else if (action === 'trade_accept') respondTradeEngine(state, playerId, true)
        else if (action === 'trade_reject') respondTradeEngine(state, playerId, false)
        else if (action === 'advance_cpu') {
          const cp = state.players.find((p) => p.id === state.game.current_player_id)
          if (!cp || cp.controller_type !== 'cpu') throw new Error('not_cpu_turn')
          if (state.game.phase !== 'await_roll') throw new Error('wrong_phase')
          runCpuTurns(state)
        }
        else throw new Error('unknown_action')
      },
    )
    return { ok: true as const }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'action_failed',
    }
  }
}

export async function hostPlayerActionAction(
  slug: string,
  gameId: string,
  playerId: string,
  action: 'roll' | 'buy' | 'auction_start',
) {
  const ctx = await requireHost(slug)
  try {
    const bundle = await mutateGame(ctx.actor.organizationId, gameId, (state) => {
      const player = state.players.find((item) => item.id === playerId)
      if (!player || player.controller_type !== 'pc') throw new Error('pc_player_only')
      if (action === 'roll') rollTurnEngine(state, playerId)
      else purchaseEngine(state, playerId, action === 'buy')
    })
    return bundle
      ? { ok: true as const, bundle }
      : { ok: false as const, error: 'game_not_found' }
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : 'action_failed',
    }
  }
}

export async function listAdminGamesAction(slug: string) {
  const ctx = await requireAdmin(slug)
  const supabase = getAdminSupabase()
  const [{ data: games, error }, { data: players }] = await Promise.all([
    supabase
      .from('monopoly_games')
      .select('*')
      .eq('organization_id', ctx.actor.organizationId)
      .order('updated_at', { ascending: false })
      .limit(50),
    supabase
      .from('monopoly_players')
      .select('id, game_id')
      .eq('organization_id', ctx.actor.organizationId),
  ])
  if (error) return { ok: false as const, error: error.message }
  const counts = new Map<string, number>()
  for (const player of players ?? []) {
    const id = String(player.game_id)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return {
    ok: true as const,
    games: (games ?? []).map((row: Record<string, unknown>) => ({
      ...normalizeGame(row),
      player_count: counts.get(String(row.id)) ?? 0,
    })),
  }
}

export async function deleteGameAction(slug: string, gameId: string) {
  const ctx = await requireAdmin(slug)
  const supabase = getAdminSupabase()
  const { error } = await supabase
    .from('monopoly_games')
    .delete()
    .eq('organization_id', ctx.actor.organizationId)
    .eq('id', gameId)
  revalidatePath(`/org/${slug}/apps/${APP_ID}`)
  revalidatePath(`/org/${slug}/apps/${APP_ID}/admin`)
  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const }
}

export async function deleteGameFormAction(
  slug: string,
  gameId: string,
  _formData: FormData,
): Promise<void> {
  await deleteGameAction(slug, gameId)
}
