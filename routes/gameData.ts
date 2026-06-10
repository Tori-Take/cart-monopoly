import type { BoardSpace, GameCard, TokenDefinition } from './_types'

export const TOKENS: TokenDefinition[] = [
  { id: 'hat', label: 'トップハット', spriteColumn: 0, spriteRow: 0 },
  { id: 'car', label: 'ロードスター', spriteColumn: 1, spriteRow: 0 },
  { id: 'ship', label: '蒸気船', spriteColumn: 2, spriteRow: 0 },
  { id: 'dog', label: 'テリア', spriteColumn: 3, spriteRow: 0 },
  { id: 'boot', label: 'ブーツ', spriteColumn: 0, spriteRow: 1 },
  { id: 'cat', label: '猫', spriteColumn: 1, spriteRow: 1 },
  { id: 'plane', label: '飛行機', spriteColumn: 2, spriteRow: 1 },
  { id: 'camera', label: 'カメラ', spriteColumn: 3, spriteRow: 1 },
]

export const PLAYER_COLORS = [
  '#d62828',
  '#2563eb',
  '#16a34a',
  '#f59e0b',
  '#9333ea',
  '#0891b2',
  '#db2777',
  '#4b5563',
]

export const BOARD: BoardSpace[] = [
  { index: 0, name: 'GO', type: 'go', icon: 'GO' },
  { index: 1, name: 'Mediterranean Avenue', type: 'street', price: 60, color: '#8b5a3c', group: 'brown', rents: [2, 10, 30, 90, 160, 250], houseCost: 50, mortgage: 30 },
  { index: 2, name: 'Community Chest', type: 'chest', icon: '★' },
  { index: 3, name: 'Baltic Avenue', type: 'street', price: 60, color: '#8b5a3c', group: 'brown', rents: [4, 20, 60, 180, 320, 450], houseCost: 50, mortgage: 30 },
  { index: 4, name: 'Income Tax', type: 'tax', tax: 200, icon: '$' },
  { index: 5, name: 'Reading Railroad', type: 'railroad', price: 200, group: 'railroad', rents: [25, 50, 100, 200], mortgage: 100, icon: 'R' },
  { index: 6, name: 'Oriental Avenue', type: 'street', price: 100, color: '#8bcbd6', group: 'light-blue', rents: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50 },
  { index: 7, name: 'Chance', type: 'chance', icon: '?' },
  { index: 8, name: 'Vermont Avenue', type: 'street', price: 100, color: '#8bcbd6', group: 'light-blue', rents: [6, 30, 90, 270, 400, 550], houseCost: 50, mortgage: 50 },
  { index: 9, name: 'Connecticut Avenue', type: 'street', price: 120, color: '#8bcbd6', group: 'light-blue', rents: [8, 40, 100, 300, 450, 600], houseCost: 50, mortgage: 60 },
  { index: 10, name: 'Jail / Just Visiting', type: 'jail', icon: 'JAIL' },
  { index: 11, name: 'St. Charles Place', type: 'street', price: 140, color: '#d95a9c', group: 'pink', rents: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70 },
  { index: 12, name: 'Electric Company', type: 'utility', price: 150, group: 'utility', mortgage: 75, icon: '⚡' },
  { index: 13, name: 'States Avenue', type: 'street', price: 140, color: '#d95a9c', group: 'pink', rents: [10, 50, 150, 450, 625, 750], houseCost: 100, mortgage: 70 },
  { index: 14, name: 'Virginia Avenue', type: 'street', price: 160, color: '#d95a9c', group: 'pink', rents: [12, 60, 180, 500, 700, 900], houseCost: 100, mortgage: 80 },
  { index: 15, name: 'Pennsylvania Railroad', type: 'railroad', price: 200, group: 'railroad', rents: [25, 50, 100, 200], mortgage: 100, icon: 'R' },
  { index: 16, name: 'St. James Place', type: 'street', price: 180, color: '#ef842f', group: 'orange', rents: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90 },
  { index: 17, name: 'Community Chest', type: 'chest', icon: '★' },
  { index: 18, name: 'Tennessee Avenue', type: 'street', price: 180, color: '#ef842f', group: 'orange', rents: [14, 70, 200, 550, 750, 950], houseCost: 100, mortgage: 90 },
  { index: 19, name: 'New York Avenue', type: 'street', price: 200, color: '#ef842f', group: 'orange', rents: [16, 80, 220, 600, 800, 1000], houseCost: 100, mortgage: 100 },
  { index: 20, name: 'Free Parking', type: 'parking', icon: 'P' },
  { index: 21, name: 'Kentucky Avenue', type: 'street', price: 220, color: '#d8272f', group: 'red', rents: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110 },
  { index: 22, name: 'Chance', type: 'chance', icon: '?' },
  { index: 23, name: 'Indiana Avenue', type: 'street', price: 220, color: '#d8272f', group: 'red', rents: [18, 90, 250, 700, 875, 1050], houseCost: 150, mortgage: 110 },
  { index: 24, name: 'Illinois Avenue', type: 'street', price: 240, color: '#d8272f', group: 'red', rents: [20, 100, 300, 750, 925, 1100], houseCost: 150, mortgage: 120 },
  { index: 25, name: 'B. & O. Railroad', type: 'railroad', price: 200, group: 'railroad', rents: [25, 50, 100, 200], mortgage: 100, icon: 'R' },
  { index: 26, name: 'Atlantic Avenue', type: 'street', price: 260, color: '#f0cf3a', group: 'yellow', rents: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130 },
  { index: 27, name: 'Ventnor Avenue', type: 'street', price: 260, color: '#f0cf3a', group: 'yellow', rents: [22, 110, 330, 800, 975, 1150], houseCost: 150, mortgage: 130 },
  { index: 28, name: 'Water Works', type: 'utility', price: 150, group: 'utility', mortgage: 75, icon: '●' },
  { index: 29, name: 'Marvin Gardens', type: 'street', price: 280, color: '#f0cf3a', group: 'yellow', rents: [24, 120, 360, 850, 1025, 1200], houseCost: 150, mortgage: 140 },
  { index: 30, name: 'Go To Jail', type: 'go_to_jail', icon: '→' },
  { index: 31, name: 'Pacific Avenue', type: 'street', price: 300, color: '#278b58', group: 'green', rents: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { index: 32, name: 'North Carolina Avenue', type: 'street', price: 300, color: '#278b58', group: 'green', rents: [26, 130, 390, 900, 1100, 1275], houseCost: 200, mortgage: 150 },
  { index: 33, name: 'Community Chest', type: 'chest', icon: '★' },
  { index: 34, name: 'Pennsylvania Avenue', type: 'street', price: 320, color: '#278b58', group: 'green', rents: [28, 150, 450, 1000, 1200, 1400], houseCost: 200, mortgage: 160 },
  { index: 35, name: 'Short Line', type: 'railroad', price: 200, group: 'railroad', rents: [25, 50, 100, 200], mortgage: 100, icon: 'R' },
  { index: 36, name: 'Chance', type: 'chance', icon: '?' },
  { index: 37, name: 'Park Place', type: 'street', price: 350, color: '#2450a3', group: 'dark-blue', rents: [35, 175, 500, 1100, 1300, 1500], houseCost: 200, mortgage: 175 },
  { index: 38, name: 'Luxury Tax', type: 'tax', tax: 100, icon: '◆' },
  { index: 39, name: 'Boardwalk', type: 'street', price: 400, color: '#2450a3', group: 'dark-blue', rents: [50, 200, 600, 1400, 1700, 2000], houseCost: 200, mortgage: 200 },
]

export const CHANCE_CARDS: GameCard[] = [
  { id: 'ch-go', deck: 'chance', title: '新しい周回', detail: 'GOへ進み、$200を受け取る。', effect: { type: 'move', position: 0, collectGo: true } },
  { id: 'ch-boardwalk', deck: 'chance', title: '海辺の大通りへ', detail: 'Boardwalkへ進む。GOを通過したら$200を受け取る。', effect: { type: 'move', position: 39, collectGo: true } },
  { id: 'ch-illinois', deck: 'chance', title: '赤い通りへ', detail: 'Illinois Avenueへ進む。GOを通過したら$200を受け取る。', effect: { type: 'move', position: 24, collectGo: true } },
  { id: 'ch-st-charles', deck: 'chance', title: '朝市へ寄り道', detail: 'St. Charles Placeへ進む。GOを通過したら$200を受け取る。', effect: { type: 'move', position: 11, collectGo: true } },
  { id: 'ch-railroad-1', deck: 'chance', title: '最寄りの鉄道へ', detail: '最寄りのRailroadへ進む。所有者がいれば通常の2倍を支払う。', effect: { type: 'nearest', target: 'railroad', rentMultiplier: 2 } },
  { id: 'ch-railroad-2', deck: 'chance', title: '急行列車に乗る', detail: '最寄りのRailroadへ進む。所有者がいれば通常の2倍を支払う。', effect: { type: 'nearest', target: 'railroad', rentMultiplier: 2 } },
  { id: 'ch-utility', deck: 'chance', title: '公共設備の点検', detail: '最寄りのUtilityへ進む。所有者がいれば出目の10倍を支払う。', effect: { type: 'nearest', target: 'utility', rentMultiplier: 10 } },
  { id: 'ch-back', deck: 'chance', title: '道を一本まちがえた', detail: '3マス戻り、止まったマスの指示に従う。', effect: { type: 'back', spaces: 3 } },
  { id: 'ch-jail', deck: 'chance', title: '交通整理に協力', detail: '留置所へ直行する。GOの給与は受け取らない。', effect: { type: 'jail' } },
  { id: 'ch-get-out', deck: 'chance', title: '無料通行証', detail: '留置所から無料で出られるまで保管する。', effect: { type: 'get_out' } },
  { id: 'ch-dividend', deck: 'chance', title: '投資先から便り', detail: '銀行から$50を受け取る。', effect: { type: 'money', amount: 50 } },
  { id: 'ch-fine', deck: 'chance', title: '急ぎすぎ注意', detail: '罰金として$15を支払う。', effect: { type: 'money', amount: -15 } },
  { id: 'ch-chairman', deck: 'chance', title: '役員会の主催', detail: '各プレイヤーへ$50ずつ支払う。', effect: { type: 'money', amount: -50, perPlayer: true } },
  { id: 'ch-repairs', deck: 'chance', title: '建物の安全点検', detail: '家1軒につき$25、ホテル1軒につき$100を支払う。', effect: { type: 'repairs', house: 25, hotel: 100 } },
  { id: 'ch-reading', deck: 'chance', title: '鉄道旅行の日', detail: 'Reading Railroadへ進む。GOを通過したら$200を受け取る。', effect: { type: 'move', position: 5, collectGo: true } },
  { id: 'ch-loan', deck: 'chance', title: '建築ローンの満期', detail: '銀行から$150を受け取る。', effect: { type: 'money', amount: 150 } },
]

export const CHEST_CARDS: GameCard[] = [
  { id: 'cc-go', deck: 'chest', title: 'GOで再出発', detail: 'GOへ進み、$200を受け取る。', effect: { type: 'move', position: 0, collectGo: true } },
  { id: 'cc-bank', deck: 'chest', title: '口座の精算', detail: '銀行から$200を受け取る。', effect: { type: 'money', amount: 200 } },
  { id: 'cc-doctor', deck: 'chest', title: '診療費', detail: '診療費として$50を支払う。', effect: { type: 'money', amount: -50 } },
  { id: 'cc-sale', deck: 'chest', title: '在庫売却', detail: '売却益として$50を受け取る。', effect: { type: 'money', amount: 50 } },
  { id: 'cc-jail', deck: 'chest', title: '公共ルールを守ろう', detail: '留置所へ直行する。GOの給与は受け取らない。', effect: { type: 'jail' } },
  { id: 'cc-get-out', deck: 'chest', title: '無料通行証', detail: '留置所から無料で出られるまで保管する。', effect: { type: 'get_out' } },
  { id: 'cc-holiday', deck: 'chest', title: '休暇積立の満期', detail: '銀行から$100を受け取る。', effect: { type: 'money', amount: 100 } },
  { id: 'cc-tax', deck: 'chest', title: '税金の調整', detail: '還付金として$20を受け取る。', effect: { type: 'money', amount: 20 } },
  { id: 'cc-birthday', deck: 'chest', title: '本日の主役', detail: '各プレイヤーから$10ずつ受け取る。', effect: { type: 'money', amount: 10, perPlayer: true } },
  { id: 'cc-insurance', deck: 'chest', title: '保険の満期', detail: '銀行から$100を受け取る。', effect: { type: 'money', amount: 100 } },
  { id: 'cc-hospital', deck: 'chest', title: '入院費', detail: '入院費として$100を支払う。', effect: { type: 'money', amount: -100 } },
  { id: 'cc-school', deck: 'chest', title: '教育費', detail: '教育費として$50を支払う。', effect: { type: 'money', amount: -50 } },
  { id: 'cc-consulting', deck: 'chest', title: '相談料', detail: '相談料として$25を受け取る。', effect: { type: 'money', amount: 25 } },
  { id: 'cc-repairs', deck: 'chest', title: '道路工事の分担金', detail: '家1軒につき$40、ホテル1軒につき$115を支払う。', effect: { type: 'repairs', house: 40, hotel: 115 } },
  { id: 'cc-beauty', deck: 'chest', title: '街のコンテスト', detail: '賞金として$10を受け取る。', effect: { type: 'money', amount: 10 } },
  { id: 'cc-inherit', deck: 'chest', title: '小さな相続', detail: '銀行から$100を受け取る。', effect: { type: 'money', amount: 100 } },
]

export function getSpace(index: number) {
  return BOARD[index]
}

export function getCard(deck: 'chance' | 'chest', id: string) {
  return (deck === 'chance' ? CHANCE_CARDS : CHEST_CARDS).find((card) => card.id === id) ?? null
}

export function shuffle<T>(items: T[]) {
  const result = [...items]
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[result[index], result[other]] = [result[other], result[index]]
  }
  return result
}
