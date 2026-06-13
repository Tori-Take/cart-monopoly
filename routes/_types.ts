export type GameStatus = 'lobby' | 'playing' | 'paused' | 'finished'
export type GamePhase =
  | 'lobby'
  | 'await_roll'
  | 'await_card_move'
  | 'await_purchase'
  | 'auction'
  | 'manage_debt'
  | 'finished'
export type ControllerType = 'smartphone' | 'cpu' | 'pc'
export type ControllerStatus = 'waiting' | 'assigned' | 'disconnected'
export type TokenId = 'hat' | 'car' | 'ship' | 'dog' | 'boot' | 'cat' | 'plane' | 'camera'
export type EventType =
  | 'system'
  | 'join'
  | 'assign'
  | 'turn'
  | 'dice'
  | 'move'
  | 'purchase'
  | 'auction'
  | 'rent'
  | 'card'
  | 'build'
  | 'mortgage'
  | 'trade'
  | 'correction'
  | 'bankruptcy'
  | 'finish'

export type GameSpeed = 'very_slow' | 'slow' | 'normal' | 'fast' | 'very_fast'
export type TokenSize = 'small' | 'normal' | 'large' | 'xlarge'

export interface GameSettings {
  startingMoney: number
  salary: number
  speed: GameSpeed
  tokenSize: TokenSize
}

export interface PurchasePending {
  kind: 'purchase'
  playerId: string
  spaceIndex: number
  rolledDoubles: boolean
}

export interface CardMovePending {
  kind: 'card_move'
  playerId: string
  cardDeck: 'chance' | 'chest'
  cardId: string
  destination: number
  collectGo: boolean
  rentMultiplier: number
  rolledDoubles: boolean
}

export interface AuctionPending {
  kind: 'auction'
  spaceIndex: number
  highestBid: number
  highestBidderId: string | null
  activePlayerIds: string[]
  passedPlayerIds: string[]
  turnPlayerId: string
  rolledDoubles: boolean
}

export interface DebtPending {
  kind: 'debt'
  playerId: string
  creditorPlayerId: string | null
  amount: number
  reason: string
  rolledDoubles: boolean
}

export interface TradePending {
  kind: 'trade'
  id: string
  fromPlayerId: string
  toPlayerId: string
  offeredCash: number
  requestedCash: number
  offeredSpaceIndexes: number[]
  requestedSpaceIndexes: number[]
}

export type PendingAction =
  | PurchasePending
  | CardMovePending
  | AuctionPending
  | DebtPending
  | TradePending
  | Record<string, never>

export interface Game {
  id: string
  organization_id: string
  join_code: string
  join_secret: string
  title: string
  status: GameStatus
  phase: GamePhase
  current_player_id: string | null
  winner_player_id: string | null
  turn_number: number
  dice_1: number | null
  dice_2: number | null
  doubles_count: number
  chance_deck: string[]
  chest_deck: string[]
  pending_action: PendingAction
  settings: GameSettings
  version: number
  created_by: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  organization_id: string
  game_id: string
  seat_order: number
  display_name: string
  controller_type: ControllerType
  token_id: TokenId
  color: string
  money: number
  position: number
  in_jail: boolean
  jail_turns: number
  get_out_chance: number
  get_out_chest: number
  bankrupt: boolean
  bankrupt_to_player_id: string | null
  connected: boolean
  profile_id: string | null
  created_at: string
  updated_at: string
}

export interface Controller {
  id: string
  organization_id: string
  game_id: string
  controller_token: string
  label: string
  status: ControllerStatus
  assigned_player_id: string | null
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface PropertyState {
  id: string
  organization_id: string
  game_id: string
  space_index: number
  owner_player_id: string | null
  buildings: number
  mortgaged: boolean
  created_at: string
  updated_at: string
}

export interface GameEvent {
  id: string
  organization_id: string
  game_id: string
  event_type: EventType
  actor_player_id: string | null
  message: string
  payload: Record<string, unknown>
  created_at: string
}

export type SpaceType =
  | 'go'
  | 'street'
  | 'railroad'
  | 'utility'
  | 'chance'
  | 'chest'
  | 'tax'
  | 'jail'
  | 'parking'
  | 'go_to_jail'

export interface BoardSpace {
  index: number
  name: string
  type: SpaceType
  price?: number
  color?: string
  group?: string
  rents?: number[]
  houseCost?: number
  mortgage?: number
  tax?: number
  icon?: string
}

export type CardEffect =
  | { type: 'money'; amount: number; perPlayer?: boolean }
  | { type: 'move'; position: number; collectGo: boolean }
  | { type: 'nearest'; target: 'railroad' | 'utility'; rentMultiplier: number }
  | { type: 'back'; spaces: number }
  | { type: 'jail' }
  | { type: 'get_out' }
  | { type: 'repairs'; house: number; hotel: number }

export interface GameCard {
  id: string
  deck: 'chance' | 'chest'
  title: string
  detail: string
  effect: CardEffect
}

export interface TokenDefinition {
  id: TokenId
  label: string
  spriteColumn: number
  spriteRow: number
}

export interface GameBundle {
  game: Game
  players: Player[]
  controllers: Controller[]
  properties: PropertyState[]
  events: GameEvent[]
}

export interface PublicGameState {
  game: Omit<Game, 'join_secret' | 'created_by'>
  players: Player[]
  properties: PropertyState[]
  events: GameEvent[]
  controller: Pick<Controller, 'id' | 'label' | 'status' | 'assigned_player_id'> | null
  me: Player | null
}
