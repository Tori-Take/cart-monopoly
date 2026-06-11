'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { BoardSpace, Player, PropertyState } from '../_types'
import { BOARD } from '../gameData'
import { TokenPiece } from './TokenPiece'

function getGridArea(index: number) {
  if (index <= 10) return `11 / ${11 - index} / 12 / ${12 - index}`
  if (index <= 20) return `${21 - index} / 1 / ${22 - index} / 2`
  if (index <= 30) return `1 / ${index - 19} / 2 / ${index - 18}`
  return `${index - 29} / 11 / ${index - 28} / 12`
}

function getSide(index: number) {
  if (index <= 10) return { name: 'bottom', rotation: '0deg' }
  if (index <= 20) return { name: 'left', rotation: '90deg' }
  if (index <= 30) return { name: 'top', rotation: '180deg' }
  return { name: 'right', rotation: '-90deg' }
}

const CORNER_TYPES = ['go', 'jail', 'parking', 'go_to_jail']

function subLabel(space: BoardSpace) {
  if (space.type === 'go') return 'COLLECT $200'
  if (space.type === 'tax') return `PAY $${space.tax ?? 0}`
  if (space.type === 'chance') return 'DRAW A CARD'
  if (space.type === 'chest') return 'FOLLOW INSTRUCTIONS'
  if (space.type === 'jail') return 'JUST VISITING'
  if (space.type === 'parking') return 'TAKE A BREAK'
  if (space.type === 'go_to_jail') return 'GO DIRECTLY TO JAIL'
  return typeof space.price === 'number' ? `$${space.price}` : ''
}

export function MonopolyBoard({
  players,
  properties,
  currentPlayerId,
  center,
}: {
  players: Player[]
  properties: PropertyState[]
  currentPlayerId: string | null
  center: ReactNode
}) {
  const propertyMap = new Map(
    properties.map((property) => [property.space_index, property]),
  )
  const playerMap = new Map(players.map((player) => [player.id, player]))

  return (
    <section className="boardFrame" aria-label="モノポリー盤面">
      <div className="monopolyBoard">
        <div className="boardCenter">
          <span className="deck chanceDeck" />
          <span className="deck chestDeck" />
          <span className="deckLabel chanceLabel">Chance</span>
          <span className="deckLabel chestLabel">Community Chest</span>
          {center}
        </div>

        {BOARD.map((space) => {
          const property = propertyMap.get(space.index)
          const owner = property?.owner_player_id
            ? playerMap.get(property.owner_player_id)
            : null
          const tokens = players.filter(
            (player) => !player.bankrupt && player.position === space.index,
          )
          const side = getSide(space.index)
          const isCorner = CORNER_TYPES.includes(space.type)
          return (
            <article
              key={space.index}
              className={`boardSpace ${side.name} ${space.type} ${
                isCorner ? 'corner' : ''
              } ${owner ? 'ownedSpace' : ''}`}
              style={{
                gridArea: getGridArea(space.index),
                '--rotation': side.rotation,
                '--property-color': space.color ?? 'transparent',
                '--owner-color': owner?.color ?? 'transparent',
              } as CSSProperties}
              title={space.name}
            >
              <div className="spaceInner">
                {space.color ? <div className="colorBar" /> : null}
                <div className="spaceBody">
                  <strong className="spaceName">{space.name}</strong>
                  {space.icon ? <b className="spaceIcon">{space.icon}</b> : null}
                  <span className="spacePrice">{subLabel(space)}</span>
                </div>
              </div>
              {property?.mortgaged ? <span className="mortgageMark">M</span> : null}
              {property && property.buildings > 0 ? (
                <span className={`buildingMark b${property.buildings}`}>
                  {property.buildings === 5
                    ? '▰'
                    : '▪'.repeat(property.buildings)}
                </span>
              ) : null}
              {tokens.length > 0 ? (
                <div className="spaceTokens">
                  {tokens.map((player) => (
                    <span
                      key={player.id}
                      className={
                        player.id === currentPlayerId ? 'activeToken' : ''
                      }
                      style={{ borderColor: player.color }}
                    >
                      <TokenPiece
                        tokenId={player.token_id}
                        size={26}
                        label={player.display_name}
                      />
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          )
        })}
      </div>

      <style>{`
        .boardFrame {
          width: min(100%, 88vh);
          aspect-ratio: 1;
          min-width: 0;
          perspective: 1200px;
        }
        .monopolyBoard {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: 1.48fr repeat(9, 1fr) 1.48fr;
          grid-template-rows: 1.48fr repeat(9, 1fr) 1.48fr;
          overflow: hidden;
          border: clamp(3px, .45vw, 7px) solid #111;
          background: #c9dfca;
          box-shadow:
            0 2px 0 #e7f2e3 inset,
            0 0 0 2px rgba(255,255,255,.14),
            0 2rem 4rem rgba(0,0,0,.48);
          color: #151515;
          box-sizing: border-box;
          transform: rotateX(1.5deg);
          transform-origin: 50% 100%;
          isolation: isolate;
        }
        .boardCenter {
          grid-area: 2 / 2 / 11 / 11;
          position: relative;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid #1e1e1e;
          background:
            linear-gradient(135deg, rgba(255,255,255,.14), transparent 48%),
            #c9dfca;
        }
        .deck {
          position: absolute;
          width: 21%;
          aspect-ratio: 1.55;
          border: 2px solid #161616;
          box-shadow: .3rem .4rem 0 rgba(0,0,0,.15);
          transform: rotate(55deg);
        }
        .chanceDeck {
          top: 15%;
          right: 12%;
          background:
            linear-gradient(135deg, transparent 46%, rgba(0,0,0,.13) 47% 53%, transparent 54%),
            #f6a33b;
        }
        .chestDeck {
          bottom: 15%;
          left: 12%;
          background:
            linear-gradient(45deg, transparent 46%, rgba(0,0,0,.13) 47% 53%, transparent 54%),
            #86c9da;
        }
        .deckLabel {
          position: absolute;
          z-index: 1;
          color: rgba(17,17,17,.75);
          font-family: Georgia, serif;
          font-size: clamp(.42rem, .85vw, .82rem);
          font-weight: 900;
          letter-spacing: .05em;
          text-transform: uppercase;
          transform: rotate(55deg);
        }
        .chanceLabel { top: 22.5%; right: 16%; }
        .chestLabel { bottom: 22%; left: 13%; }
        .boardSpace {
          --owner-color: transparent;
          position: relative;
          z-index: 3;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          border: .5px solid #3e3e3e;
          background: #e9f2e7;
        }
        .boardSpace.ownedSpace {
          box-shadow: inset 0 0 0 clamp(2px, .25vw, 3px) var(--owner-color);
        }
        .spaceInner {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-between;
          transform: translate(-50%, -50%) rotate(var(--rotation, 0deg));
          transform-origin: center;
          text-align: center;
        }
        .boardSpace.left .spaceInner,
        .boardSpace.right .spaceInner {
          width: 68%;
          height: 147%;
        }
        .colorBar {
          flex: 0 0 25%;
          width: 100%;
          border-bottom: 1px solid #222;
          background: var(--property-color);
        }
        .spaceBody {
          flex: 1;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: space-around;
          gap: 2%;
          min-height: 0;
          padding: 5% 4%;
        }
        .spaceName {
          max-width: 100%;
          font-size: clamp(.23rem, .61vw, .66rem);
          font-weight: 900;
          line-height: 1.02;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }
        .spacePrice {
          font-size: clamp(.22rem, .53vw, .58rem);
          line-height: 1;
          white-space: nowrap;
        }
        .spaceIcon {
          display: grid;
          place-items: center;
          min-height: 0;
          font-family: Georgia, serif;
          font-size: clamp(.52rem, 1.45vw, 1.55rem);
          font-weight: 900;
          line-height: .9;
        }
        .boardSpace.chance .spaceIcon {
          color: #e96732;
          font-size: clamp(.78rem, 2.1vw, 2.25rem);
          transform: rotate(-12deg);
        }
        .corner .spaceName {
          font-size: clamp(.34rem, .9vw, .95rem);
          line-height: .95;
        }
        .corner .spaceIcon {
          font-size: clamp(.8rem, 2.25vw, 2.3rem);
        }
        .corner.go .spaceIcon {
          color: #d52b2f;
          transform: rotate(-12deg);
        }
        .mortgageMark {
          position: absolute;
          inset: 30% 16%;
          z-index: 4;
          display: grid;
          place-items: center;
          border: 2px solid #991b1b;
          color: #991b1b;
          background: rgba(255,255,255,.86);
          font-weight: 1000;
          transform: rotate(var(--rotation, 0deg));
        }
        .buildingMark {
          position: absolute;
          z-index: 5;
          top: 2px;
          left: 50%;
          color: #166534;
          font-size: clamp(6px, .72vw, 12px);
          letter-spacing: -1px;
          transform: translateX(-50%) rotate(var(--rotation, 0deg));
          white-space: nowrap;
        }
        .buildingMark.b5 { color: #b91c1c; font-size: clamp(8px, .95vw, 15px); }
        .spaceTokens {
          position: absolute;
          z-index: 12;
          right: 2px;
          bottom: 2px;
          display: flex;
          flex-wrap: wrap-reverse;
          justify-content: flex-end;
          max-width: 72%;
          pointer-events: none;
        }
        .spaceTokens > span {
          width: clamp(14px, 1.65vw, 28px);
          height: clamp(14px, 1.65vw, 28px);
          display: grid;
          place-items: center;
          margin: -4px 0 0 -5px;
          overflow: hidden;
          border: 2px solid;
          border-radius: 50%;
          background: rgba(255,255,255,.7);
        }
        .spaceTokens .activeToken {
          box-shadow: 0 0 0 2px #facc15, 0 0 12px #facc15;
        }
        @media (max-width: 620px) {
          .spaceName { font-size: clamp(.17rem, 1vw, .4rem); }
          .spacePrice { font-size: clamp(.16rem, .9vw, .36rem); }
          .spaceIcon { font-size: clamp(.38rem, 2vw, .9rem); }
        }
      `}</style>
    </section>
  )
}
