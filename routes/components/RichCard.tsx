'use client'

import type { BoardSpace, GameCard } from '../_types'

const money = (v: number) => `$${v.toLocaleString('en-US')}`

function bandTextColor(group: string | undefined): string {
  return group === 'dark-blue' || group === 'railroad' ? '#fff' : '#181413'
}

function PropertyCard({ space }: { space: BoardSpace }) {
  if (space.type === 'street') {
    const labels = ['賃料', '家1軒', '家2軒', '家3軒', '家4軒', 'ホテル']
    const rents = space.rents ?? []
    return (
      <div className="rcard rcard--property">
        <header
          className="rcard__band"
          style={{
            background: space.color ?? '#888',
            color: bandTextColor(space.group),
          }}
        >
          <small>TITLE DEED</small>
          <h2>{space.name}</h2>
        </header>
        <div className="rcard__body">
          <p className="rcard__price">購入価格 {money(space.price ?? 0)}</p>
          <dl className="rcard__rents">
            {rents.map((rent, i) => (
              <div key={i}>
                <dt>{labels[i]}</dt>
                <dd>{money(rent)}</dd>
              </div>
            ))}
          </dl>
          <p className="rcard__note">
            家の価格 {money(space.houseCost ?? 0)} / 抵当価格 {money(space.mortgage ?? 0)}
            <br />同色を揃えると未建設時の賃料は2倍
          </p>
        </div>
      </div>
    )
  }

  if (space.type === 'railroad') {
    const rents = space.rents ?? []
    const labels = ['1社を所有', '2社を所有', '3社を所有', '4社を所有']
    return (
      <div className="rcard rcard--property">
        <header
          className="rcard__band"
          style={{ background: '#202020', color: '#fff' }}
        >
          <small>RAILROAD DEED</small>
          <h2>{space.name}</h2>
        </header>
        <div className="rcard__body">
          <p className="rcard__price">購入価格 {money(space.price ?? 0)}</p>
          <dl className="rcard__rents">
            {rents.map((rent, i) => (
              <div key={i}>
                <dt>{labels[i] ?? `${i + 1}社`}</dt>
                <dd>{money(rent)}</dd>
              </div>
            ))}
          </dl>
          <p className="rcard__note">
            抵当価格 {money(space.mortgage ?? 0)}
            <br />鉄道を集めるほど賃料が上昇
          </p>
        </div>
      </div>
    )
  }

  if (space.type === 'utility') {
    return (
      <div className="rcard rcard--property">
        <header
          className="rcard__band"
          style={{ background: '#cfc9b4', color: '#181413' }}
        >
          <small>UTILITY DEED</small>
          <h2>{space.name}</h2>
        </header>
        <div className="rcard__body">
          <p className="rcard__price">購入価格 {money(space.price ?? 0)}</p>
          <dl className="rcard__rents">
            <div>
              <dt>1社を所有</dt>
              <dd>出目 × 4</dd>
            </div>
            <div>
              <dt>2社を所有</dt>
              <dd>出目 × 10</dd>
            </div>
          </dl>
          <p className="rcard__note">
            抵当価格 {money(space.mortgage ?? 0)}
            <br />移動に使ったサイコロの出目で計算
          </p>
        </div>
      </div>
    )
  }

  return null
}

function EventCard({ card }: { card: GameCard }) {
  const isChance = card.deck === 'chance'
  return (
    <div className={`rcard rcard--event rcard--event-${card.deck}`}>
      <p className="rcard__kicker">
        {isChance ? 'CHANCE' : 'COMMUNITY CHEST'}
      </p>
      <div className="rcard__event-body">
        <div className="rcard__icon">{isChance ? '?' : '★'}</div>
        <h2 className="rcard__event-title">{card.title}</h2>
      </div>
      <p className="rcard__detail">{card.detail}</p>
    </div>
  )
}

export function RichCard({ space, card }: { space?: BoardSpace; card?: GameCard }) {
  if (card) return <EventCard card={card} />
  if (
    space &&
    (space.type === 'street' || space.type === 'railroad' || space.type === 'utility')
  ) {
    return <PropertyCard space={space} />
  }
  return null
}

export const RICH_CARD_CSS = `
  .rcard {
    position: relative;
    container-type: inline-size;
    width: 100%;
    aspect-ratio: 2.5 / 3.5;
    overflow: hidden;
    padding: 4cqw;
    border: 1px solid rgba(24,20,19,.28);
    border-radius: 11px;
    box-shadow: 0 12px 28px rgba(0,0,0,.26);
    background:
      repeating-linear-gradient(0deg, rgba(90,70,40,.025) 0 1px, transparent 1px 4px),
      #f7f0dd;
    color: #181413;
    display: flex;
    flex-direction: column;
  }
  .rcard::after {
    position: absolute;
    inset: 5px;
    border: 1px solid rgba(24,20,19,.28);
    border-radius: 7px;
    content: "";
    pointer-events: none;
  }
  .rcard--property { }
  .rcard__band {
    display: grid;
    min-height: 22cqw;
    place-items: center;
    padding: 3cqw;
    border: 2px solid #181413;
    text-align: center;
  }
  .rcard__band small {
    display: block;
    margin-bottom: 1cqw;
    font-size: clamp(7px, 2.6cqw, 12px);
    font-weight: 900;
    letter-spacing: .18em;
  }
  .rcard__band h2 {
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(14px, 6.4cqw, 26px);
    font-weight: 900;
    line-height: .95;
    text-transform: uppercase;
  }
  .rcard__body {
    display: flex;
    flex: 1;
    flex-direction: column;
    padding: 3.5cqw 2cqw 1.5cqw;
  }
  .rcard__price {
    margin: 0 0 3cqw;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(11px, 3.9cqw, 17px);
    font-weight: 700;
    text-align: center;
  }
  .rcard__rents {
    display: grid;
    gap: 1cqw;
    margin: 0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(10px, 3.5cqw, 16px);
  }
  .rcard__rents div { display: flex; justify-content: space-between; gap: 6px; }
  .rcard__rents dt, .rcard__rents dd { margin: 0; }
  .rcard__note {
    margin: auto 0 0;
    padding-top: 2.4cqw;
    border-top: 1px solid rgba(24,20,19,.22);
    font-size: clamp(8px, 2.7cqw, 12px);
    line-height: 1.45;
    text-align: center;
    color: #3d2417;
  }
  .rcard--event {
    justify-content: space-between;
    text-align: center;
  }
  .rcard--event-chance { --rcard-event: #ef8c35; }
  .rcard--event-chest  { --rcard-event: #79b9c8; }
  .rcard__kicker {
    margin: 2.5cqw 0 0;
    color: color-mix(in srgb, var(--rcard-event, #ef8c35) 80%, #3d2417);
    font-size: clamp(9px, 3.2cqw, 14px);
    font-weight: 900;
    letter-spacing: .22em;
  }
  .rcard__event-body {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .rcard__icon {
    display: grid;
    place-items: center;
    width: 26cqw;
    aspect-ratio: 1;
    margin: 3cqw auto 2cqw;
    border: 3px solid #181413;
    border-radius: 50%;
    background: var(--rcard-event, #ef8c35);
    color: #181413;
    font-family: Georgia, serif;
    font-size: clamp(34px, 15cqw, 60px);
    font-weight: 900;
    transform: rotate(-6deg);
    box-shadow: 4px 5px 0 #181413;
  }
  .rcard__event-title {
    margin: 2.5cqw 3cqw 0;
    font-family: Georgia, "Yu Mincho", serif;
    font-size: clamp(16px, 6.8cqw, 28px);
    line-height: 1.25;
  }
  .rcard__detail {
    margin: 0 4cqw 4cqw;
    padding-top: 3cqw;
    border-top: 1px solid rgba(24,20,19,.22);
    font-size: clamp(10px, 3.5cqw, 15px);
    font-weight: 700;
    line-height: 1.6;
  }
`
