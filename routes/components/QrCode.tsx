'use client'

import { useMemo } from 'react'
import { createQrMatrix } from './qr'

const QUIET_ZONE = 4

export function QrCode({
  value,
  className,
  label,
}: {
  value: string
  className?: string
  label: string
}) {
  const { modules, size } = useMemo(() => {
    const matrix = createQrMatrix(value)
    const darkModules: Array<{ x: number; y: number }> = []

    for (let y = 0; y < matrix.length; y += 1) {
      for (let x = 0; x < matrix.length; x += 1) {
        if (matrix[y][x]) {
          darkModules.push({
            x: x + QUIET_ZONE,
            y: y + QUIET_ZONE,
          })
        }
      }
    }

    return {
      modules: darkModules,
      size: matrix.length + QUIET_ZONE * 2,
    }
  }, [value])

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect x="0" y="0" width={size} height={size} fill="#fff" />
      <g fill="#000">
        {modules.map((module) => (
          <rect
            key={`${module.x}-${module.y}`}
            x={module.x}
            y={module.y}
            width="1"
            height="1"
          />
        ))}
      </g>
    </svg>
  )
}
