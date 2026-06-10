'use client'

import type { CSSProperties, ReactNode } from 'react'
import type { Player, PropertyState } from '../_types'
import { BOARD } from '../gameData'
import { TokenPiece } from './TokenPiece'

function getGridArea(index: number) {
  if (index <= 10) return `11 / ${11 - index} / 12 / ${12 - index}`
  if (index <= 20) return `${21 - index} / 1 / ${22 - index} / 2`
  if (index <= 30) return `1 / ${index - 19} / 2 / ${index - 18}`
  return `${index - 29} / 11 / ${index - 28} / 12`
}

function rotation(index: number) {
  if (index > 10 && index < 20) return '90deg'
  if (index > 20 && index < 30) return '180deg'
  if (index > 30) return '-90deg'
  return '0deg'
}

function money(value?: number) {
  return typeof value === 'number' ? `$${value}` : ''
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
          <div className="deck chanceDeck">?</div>
          <div className="deck chestDeck">★</div>
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
          return (
            <article
              key={space.index}
              className={`boardSpace ${space.type} ${
                owner ? 'ownedSpace' : ''
              }`}
              style={{
                gridArea: getGridArea(space.index),
                '--space-rotation': rotation(space.index),
                '--owner-color': owner?.color ?? 'transparent',
              } as CSSProperties}
              title={space.name}
            >
              {space.color ? (
                <div
                  className="colorBand"
                  style={{ backgroundColor: space.color }}
                />
              ) : null}
              <div className="spaceInner">
                <strong>{space.name}</strong>
                {space.icon ? <b className="spaceIcon">{space.icon}</b> : null}
                {space.price ? <span>{money(space.price)}</span> : null}
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
        }
        .monopolyBoard {
          width: 100%;
          height: 100%;
          display: grid;
          grid-template-columns: 1.48fr repeat(9, 1fr) 1.48fr;
          grid-template-rows: 1.48fr repeat(9, 1fr) 1.48fr;
          overflow: hidden;
          border: clamp(3px, .42vw, 7px) solid #111;
          background: #c9dfca;
          box-shadow: 0 2rem 4rem rgba(0,0,0,.48);
          color: #151515;
          box-sizing: border-box;
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
            linear-gradient(135deg, rgba(255,255,255,.15), transparent 48%),
            #c9dfca;
        }
        .deck {
          position: absolute;
          display: grid;
          place-items: center;
          width: 20%;
          aspect-ratio: 1.55;
          border: 2px solid #161616;
          box-shadow: .3rem .4rem 0 rgba(0,0,0,.15);
          color: #151515;
          font-family: Georgia, serif;
          font-size: clamp(12px, 2.4vw, 36px);
          font-weight: 900;
          transform: rotate(55deg);
        }
        .chanceDeck { top: 14%; right: 11%; background: #f6a33b; }
        .chestDeck { bottom: 14%; left: 11%; background: #86c9da; }
        .boardSpace {
          --owner-color: transparent;
          position: relative;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
          border: .5px solid #3e3e3e;
          background: #e9f2e7;
          box-shadow: inset 0 0 0 0 var(--owner-color);
        }
        .boardSpace.ownedSpace {
          box-shadow: inset 0 0 0 3px var(--owner-color);
        }
        .colorBand {
          position: absolute;
          inset: 0 0 auto;
          height: 24%;
          border-bottom: 1px solid #222;
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
          justify-content: space-around;
          gap: 2%;
          padding: 25% 5% 5%;
          box-sizing: border-box;
          text-align: center;
          transform: translate(-50%, -50%) rotate(var(--space-rotation));
        }
        .boardSpace:not(.street) .spaceInner { padding-top: 7%; }
        .spaceInner strong {
          max-width: 100%;
          font-size: clamp(5px, .58vw, 10px);
          font-weight: 900;
          line-height: 1.02;
          text-transform: uppercase;
          overflow-wrap: anywhere;
        }
        .spaceInner span {
          font-size: clamp(5px, .52vw, 9px);
          line-height: 1;
        }
        .spaceIcon {
          font-family: Georgia, serif;
          font-size: clamp(9px, 1.35vw, 22px);
          line-height: .9;
        }
        .go .spaceInner strong,
        .jail .spaceInner strong,
        .parking .spaceInner strong,
        .go_to_jail .spaceInner strong {
          font-size: clamp(6px, .72vw, 13px);
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
          transform: rotate(var(--space-rotation));
        }
        .buildingMark {
          position: absolute;
          z-index: 5;
          top: 2px;
          left: 50%;
          color: #166534;
          font-size: clamp(6px, .72vw, 12px);
          letter-spacing: -1px;
          transform: translateX(-50%) rotate(var(--space-rotation));
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
        @media (max-width: 760px) {
          .spaceInner strong { font-size: clamp(3px, 1vw, 7px); }
          .spaceInner span { font-size: clamp(3px, .9vw, 6px); }
          .spaceIcon { font-size: clamp(6px, 2vw, 14px); }
        }
      `}</style>
    </section>
  )
}
