const ECC_CODEWORDS_PER_BLOCK = [
  -1,
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26,
  30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
  28, 28, 28, 30, 30, 28, 30, 30, 30, 30,
  28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
]

const NUM_ERROR_CORRECTION_BLOCKS = [
  -1,
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5,
  5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
  17, 17, 18, 20, 21, 23, 25, 26, 28, 29,
  31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
]

const PENALTY_N1 = 3
const PENALTY_N2 = 3
const PENALTY_N3 = 40
const PENALTY_N4 = 10

function appendBits(target: number[], value: number, length: number) {
  if (length < 0 || length > 31 || value >>> length !== 0) {
    throw new RangeError('Invalid QR bit value')
  }
  for (let i = length - 1; i >= 0; i -= 1) target.push((value >>> i) & 1)
}

function getNumRawDataModules(version: number) {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const alignmentCount = Math.floor(version / 7) + 2
    result -= (25 * alignmentCount - 10) * alignmentCount - 55
    if (version >= 7) result -= 36
  }
  return result
}

function getNumDataCodewords(version: number) {
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[version] * NUM_ERROR_CORRECTION_BLOCKS[version]
  )
}

function reedSolomonMultiply(x: number, y: number) {
  let z = 0
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function reedSolomonComputeDivisor(degree: number) {
  const result = new Uint8Array(degree)
  result[degree - 1] = 1
  let root = 1

  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < result.length; j += 1) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}

function reedSolomonComputeRemainder(data: number[], divisor: Uint8Array) {
  const result = new Uint8Array(divisor.length)
  for (const byte of data) {
    const factor = byte ^ result[0]
    result.copyWithin(0, 1)
    result[result.length - 1] = 0
    for (let i = 0; i < result.length; i += 1) {
      result[i] ^= reedSolomonMultiply(divisor[i], factor)
    }
  }
  return Array.from(result)
}

function addErrorCorrection(data: number[], version: number) {
  const blockCount = NUM_ERROR_CORRECTION_BLOCKS[version]
  const errorCorrectionLength = ECC_CODEWORDS_PER_BLOCK[version]
  const rawCodewordCount = Math.floor(getNumRawDataModules(version) / 8)
  const shortBlockCount = blockCount - (rawCodewordCount % blockCount)
  const shortBlockLength = Math.floor(rawCodewordCount / blockCount)
  const shortDataLength = shortBlockLength - errorCorrectionLength
  const divisor = reedSolomonComputeDivisor(errorCorrectionLength)
  const blocks: number[][] = []
  let dataIndex = 0

  for (let block = 0; block < blockCount; block += 1) {
    const dataLength = shortDataLength + (block < shortBlockCount ? 0 : 1)
    const blockData = data.slice(dataIndex, dataIndex + dataLength)
    dataIndex += dataLength
    const errorCorrection = reedSolomonComputeRemainder(blockData, divisor)
    if (block < shortBlockCount) blockData.push(0)
    blocks.push(blockData.concat(errorCorrection))
  }

  const result: number[] = []
  for (let index = 0; index < blocks[0].length; index += 1) {
    for (let block = 0; block < blocks.length; block += 1) {
      if (index !== shortDataLength || block >= shortBlockCount) {
        result.push(blocks[block][index])
      }
    }
  }
  return result
}

function getAlignmentPatternPositions(version: number, size: number) {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step =
    version === 32
      ? 26
      : Math.floor((version * 4 + count * 2 + 1) / (count * 2 - 2)) * 2
  const result = [6]
  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position)
  }
  return result
}

function getMaskBit(mask: number, x: number, y: number) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      throw new RangeError('Invalid QR mask')
  }
}

function getPenaltyScore(modules: boolean[][]) {
  const size = modules.length
  let score = 0

  for (let y = 0; y < size; y += 1) {
    let runColor = modules[y][0]
    let runLength = 1
    for (let x = 1; x < size; x += 1) {
      if (modules[y][x] === runColor) {
        runLength += 1
        if (runLength === 5) score += PENALTY_N1
        else if (runLength > 5) score += 1
      } else {
        runColor = modules[y][x]
        runLength = 1
      }
    }
  }

  for (let x = 0; x < size; x += 1) {
    let runColor = modules[0][x]
    let runLength = 1
    for (let y = 1; y < size; y += 1) {
      if (modules[y][x] === runColor) {
        runLength += 1
        if (runLength === 5) score += PENALTY_N1
        else if (runLength > 5) score += 1
      } else {
        runColor = modules[y][x]
        runLength = 1
      }
    }
  }

  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const color = modules[y][x]
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        score += PENALTY_N2
      }
    }
  }

  const finderPatterns = ['00001011101', '10111010000']
  for (let y = 0; y < size; y += 1) {
    const row = modules[y].map((module) => (module ? '1' : '0')).join('')
    for (const pattern of finderPatterns) {
      let index = row.indexOf(pattern)
      while (index >= 0) {
        score += PENALTY_N3
        index = row.indexOf(pattern, index + 1)
      }
    }
  }
  for (let x = 0; x < size; x += 1) {
    const column = modules.map((row) => (row[x] ? '1' : '0')).join('')
    for (const pattern of finderPatterns) {
      let index = column.indexOf(pattern)
      while (index >= 0) {
        score += PENALTY_N3
        index = column.indexOf(pattern, index + 1)
      }
    }
  }

  const darkCount = modules.reduce(
    (total, row) => total + row.filter(Boolean).length,
    0,
  )
  const totalCount = size * size
  const balance = Math.floor(Math.abs(darkCount * 20 - totalCount * 10) / totalCount)
  score += balance * PENALTY_N4
  return score
}

export function createQrMatrix(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text))
  let version = 1

  for (; version <= 40; version += 1) {
    const countBits = version < 10 ? 8 : 16
    const requiredBits = 4 + countBits + bytes.length * 8
    if (bytes.length < 2 ** countBits && requiredBits <= getNumDataCodewords(version) * 8) {
      break
    }
  }
  if (version > 40) throw new RangeError('Text is too long for a QR code')

  const dataCapacityBits = getNumDataCodewords(version) * 8
  const bits: number[] = []
  appendBits(bits, 0x4, 4)
  appendBits(bits, bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) appendBits(bits, byte, 8)
  appendBits(bits, 0, Math.min(4, dataCapacityBits - bits.length))
  while (bits.length % 8 !== 0) bits.push(0)

  const dataCodewords: number[] = []
  for (let index = 0; index < bits.length; index += 8) {
    dataCodewords.push(
      bits
        .slice(index, index + 8)
        .reduce((value, bit) => (value << 1) | bit, 0),
    )
  }
  for (let pad = 0xec; dataCodewords.length < getNumDataCodewords(version); pad ^= 0xec ^ 0x11) {
    dataCodewords.push(pad)
  }

  const codewords = addErrorCorrection(dataCodewords, version)
  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  const isFunction = Array.from({ length: size }, () => Array<boolean>(size).fill(false))

  function setFunctionModule(x: number, y: number, dark: boolean) {
    modules[y][x] = dark
    isFunction[y][x] = true
  }

  function drawFinderPattern(centerX: number, centerY: number) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = centerX + dx
        const y = centerY + dy
        if (x < 0 || x >= size || y < 0 || y >= size) continue
        const distance = Math.max(Math.abs(dx), Math.abs(dy))
        setFunctionModule(x, y, distance !== 2 && distance !== 4)
      }
    }
  }

  function drawAlignmentPattern(centerX: number, centerY: number) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        setFunctionModule(
          centerX + dx,
          centerY + dy,
          Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
        )
      }
    }
  }

  function drawFormatBits(mask: number) {
    const data = mask // Error correction level M has format bits 00.
    let remainder = data
    for (let i = 0; i < 10; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
    }
    const formatBits = ((data << 10) | remainder) ^ 0x5412
    const bit = (index: number) => ((formatBits >>> index) & 1) !== 0

    for (let i = 0; i <= 5; i += 1) setFunctionModule(8, i, bit(i))
    setFunctionModule(8, 7, bit(6))
    setFunctionModule(8, 8, bit(7))
    setFunctionModule(7, 8, bit(8))
    for (let i = 9; i < 15; i += 1) setFunctionModule(14 - i, 8, bit(i))

    for (let i = 0; i < 8; i += 1) setFunctionModule(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i += 1) setFunctionModule(8, size - 15 + i, bit(i))
    setFunctionModule(8, size - 8, true)
  }

  function applyMask(mask: number) {
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        if (!isFunction[y][x] && getMaskBit(mask, x, y)) {
          modules[y][x] = !modules[y][x]
        }
      }
    }
  }

  for (let index = 0; index < size; index += 1) {
    setFunctionModule(6, index, index % 2 === 0)
    setFunctionModule(index, 6, index % 2 === 0)
  }
  drawFinderPattern(3, 3)
  drawFinderPattern(size - 4, 3)
  drawFinderPattern(3, size - 4)

  const alignmentPositions = getAlignmentPatternPositions(version, size)
  const lastAlignment = alignmentPositions.length - 1
  for (let yIndex = 0; yIndex < alignmentPositions.length; yIndex += 1) {
    for (let xIndex = 0; xIndex < alignmentPositions.length; xIndex += 1) {
      const overlapsFinder =
        (xIndex === 0 && yIndex === 0) ||
        (xIndex === lastAlignment && yIndex === 0) ||
        (xIndex === 0 && yIndex === lastAlignment)
      if (!overlapsFinder) {
        drawAlignmentPattern(alignmentPositions[xIndex], alignmentPositions[yIndex])
      }
    }
  }

  drawFormatBits(0)
  if (version >= 7) {
    let remainder = version
    for (let i = 0; i < 12; i += 1) {
      remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
    }
    const versionBits = (version << 12) | remainder
    for (let i = 0; i < 18; i += 1) {
      const dark = ((versionBits >>> i) & 1) !== 0
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunctionModule(a, b, dark)
      setFunctionModule(b, a, dark)
    }
  }

  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical += 1) {
      const y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset
        if (isFunction[y][x] || bitIndex >= codewords.length * 8) continue
        modules[y][x] =
          ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
        bitIndex += 1
      }
    }
  }

  let bestMask = 0
  let bestScore = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(mask)
    drawFormatBits(mask)
    const score = getPenaltyScore(modules)
    if (score < bestScore) {
      bestMask = mask
      bestScore = score
    }
    applyMask(mask)
  }
  applyMask(bestMask)
  drawFormatBits(bestMask)
  return modules
}
