'use client'

import tokenSprite from '../assets/token-sprite.png'
import { TOKENS } from '../gameData'
import type { TokenId } from '../_types'

const spriteUrl =
  typeof tokenSprite === 'string' ? tokenSprite : tokenSprite.src

export function TokenPiece({
  tokenId,
  size = 42,
  label,
}: {
  tokenId: TokenId
  size?: number
  label?: string
}) {
  const token = TOKENS.find((item) => item.id === tokenId) ?? TOKENS[0]
  return (
    <span
      role="img"
      aria-label={label ?? token.label}
      title={label ?? token.label}
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        backgroundImage: `url("${spriteUrl}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '400% 200%',
        backgroundPosition: `${token.spriteColumn * 33.333333}% ${token.spriteRow * 100}%`,
        filter: 'drop-shadow(0 3px 3px rgba(0,0,0,.5))',
      }}
    />
  )
}
