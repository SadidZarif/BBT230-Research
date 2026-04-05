import type { DailyRow } from './types'

export type PcaVariableName = 'stress' | 'sleep' | 'study' | 'food' | 'social'

export type PcaPoint = {
  dayNumber: number
  dateISO: string
  shoutCount: number
  pc1: number
  pc2: number
}

export type PcaResult = {
  variables: PcaVariableName[]
  points: PcaPoint[]
  loadings: Array<{
    variable: PcaVariableName
    pc1: number
    pc2: number
  }>
  explainedVariance: {
    pc1: number
    pc2: number
  }
  eigenvalues: {
    pc1: number
    pc2: number
  }
  means: Record<PcaVariableName, number>
  standardDeviations: Record<PcaVariableName, number>
  correlationMatrix: number[][]
}

type NumericLifestyleRow = {
  dayNumber: number
  dateISO: string
  shoutCount: number
  stress: number
  sleep: number
  study: number
  food: number
  social: number
}

const PCA_VARIABLES: PcaVariableName[] = ['stress', 'sleep', 'study', 'food', 'social']

function mean(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((sum, x) => sum + x, 0) / xs.length
}

function sampleStd(xs: number[]) {
  if (xs.length < 2) return 1
  const m = mean(xs)
  let sumSquares = 0
  for (const x of xs) {
    const diff = x - m
    sumSquares += diff * diff
  }
  const variance = sumSquares / (xs.length - 1)
  const sd = Math.sqrt(variance)
  return sd > 0 ? sd : 1
}

function dot(a: number[], b: number[]) {
  let total = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) total += (a[i] ?? 0) * (b[i] ?? 0)
  return total
}

function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => dot(row, vector))
}

function vectorLength(vector: number[]) {
  return Math.sqrt(dot(vector, vector))
}

function normalizeVector(vector: number[]) {
  const len = vectorLength(vector)
  if (len === 0) return vector.map(() => 0)
  return vector.map((x) => x / len)
}

function outerProduct(vector: number[]) {
  return vector.map((a) => vector.map((b) => a * b))
}

function subtractMatrices(a: number[][], b: number[][]) {
  return a.map((row, i) => row.map((value, j) => value - (b[i]?.[j] ?? 0)))
}

function scaleMatrix(matrix: number[][], factor: number) {
  return matrix.map((row) => row.map((value) => value * factor))
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

function buildIdentityVector(size: number, index: number) {
  const out = new Array<number>(size).fill(0)
  out[index] = 1
  return out
}

function powerIterationSymmetric(matrix: number[][], maxIterations = 200) {
  const size = matrix.length
  let vector = normalizeVector(new Array<number>(size).fill(1))

  // Repeatedly multiply by the matrix, then normalize.
  // For a symmetric matrix this converges to the dominant eigenvector.
  for (let i = 0; i < maxIterations; i++) {
    const next = normalizeVector(multiplyMatrixVector(matrix, vector))
    const delta = next.reduce((sum, value, idx) => sum + Math.abs(value - (vector[idx] ?? 0)), 0)
    vector = next
    if (delta < 1e-10) break
  }

  let eigenvalue = dot(vector, multiplyMatrixVector(matrix, vector))
  if (!Number.isFinite(eigenvalue) || eigenvalue < 0) {
    // Tiny or negative numerical results can happen from floating-point noise.
    eigenvalue = 0
  }

  // Pick a stable sign so charts/readouts do not randomly flip direction.
  const largestAbsIndex = vector.reduce(
    (best, value, idx) => (Math.abs(value) > Math.abs(vector[best] ?? 0) ? idx : best),
    0,
  )
  if ((vector[largestAbsIndex] ?? 0) < 0) {
    vector = vector.map((x) => -x)
  }

  return { eigenvalue, eigenvector: vector }
}

function extractTopTwoComponents(matrix: number[][]) {
  const first = powerIterationSymmetric(matrix)
  const deflated = subtractMatrices(matrix, scaleMatrix(outerProduct(first.eigenvector), first.eigenvalue))
  let second = powerIterationSymmetric(deflated)

  // If the matrix has too little variation, fall back to a simple basis vector.
  if (vectorLength(second.eigenvector) === 0) {
    second = { eigenvalue: 0, eigenvector: buildIdentityVector(matrix.length, 1) }
  }

  return { first, second }
}

function correlationMatrixFromZScores(zRows: number[][]) {
  const columnCount = zRows[0]?.length ?? 0
  const matrix = Array.from({ length: columnCount }, () => Array<number>(columnCount).fill(0))

  // Because every variable is z-scored first, the covariance matrix becomes
  // the same as the correlation matrix. That makes the PCA fair across scales.
  for (let i = 0; i < columnCount; i++) {
    for (let j = 0; j < columnCount; j++) {
      let total = 0
      for (const row of zRows) total += (row[i] ?? 0) * (row[j] ?? 0)
      matrix[i][j] = zRows.length > 1 ? total / (zRows.length - 1) : 0
    }
  }

  return matrix
}

function getNumericRows(rows: DailyRow[]): NumericLifestyleRow[] {
  return rows
    .filter(
      (row) =>
        row.shoutCount != null &&
        row.stress != null &&
        row.sleepHours != null &&
        row.studyMinutes != null &&
        row.food != null &&
        row.social != null,
    )
    .map((row) => ({
      dayNumber: row.dayNumber,
      dateISO: row.dateISO,
      shoutCount: row.shoutCount as number,
      stress: row.stress as number,
      sleep: row.sleepHours as number,
      study: row.studyMinutes as number,
      food: row.food as number,
      social: row.social as number,
    }))
}

export function computeLifestylePca(rows: DailyRow[]): PcaResult | null {
  const numericRows = getNumericRows(rows)
  if (numericRows.length < 2) return null

  // First we reverse stress so that higher values always mean better condition.
  // Original stress scale: 1 = best, 10 = worst
  // Reversed scale:       10 = best, 1 = worst
  const transformedRows = numericRows.map((row) => ({
    ...row,
    stress: 11 - row.stress,
  }))

  const columns = {
    stress: transformedRows.map((row) => row.stress),
    sleep: transformedRows.map((row) => row.sleep),
    study: transformedRows.map((row) => row.study),
    food: transformedRows.map((row) => row.food),
    social: transformedRows.map((row) => row.social),
  } satisfies Record<PcaVariableName, number[]>

  const means = {
    stress: mean(columns.stress),
    sleep: mean(columns.sleep),
    study: mean(columns.study),
    food: mean(columns.food),
    social: mean(columns.social),
  } satisfies Record<PcaVariableName, number>

  const standardDeviations = {
    stress: sampleStd(columns.stress),
    sleep: sampleStd(columns.sleep),
    study: sampleStd(columns.study),
    food: sampleStd(columns.food),
    social: sampleStd(columns.social),
  } satisfies Record<PcaVariableName, number>

  // Now we standardize the variables so different scales can be compared fairly.
  // Example: study is measured in minutes, while food/social are 1..10 ratings.
  const zRows = transformedRows.map((row) =>
    PCA_VARIABLES.map((variable) => (row[variable] - means[variable]) / standardDeviations[variable]),
  )

  const correlationMatrix = correlationMatrixFromZScores(zRows)
  const { first, second } = extractTopTwoComponents(correlationMatrix)

  const totalVariance = correlationMatrix.reduce((sum, row, i) => sum + (row[i] ?? 0), 0) || PCA_VARIABLES.length

  // These loadings show how strongly each variable contributes to PC1 and PC2.
  // For standardized PCA, loading = eigenvector * sqrt(eigenvalue).
  const loadings = PCA_VARIABLES.map((variable, index) => ({
    variable,
    pc1: round4((first.eigenvector[index] ?? 0) * Math.sqrt(first.eigenvalue)),
    pc2: round4((second.eigenvector[index] ?? 0) * Math.sqrt(second.eigenvalue)),
  }))

  // PC scores place each day onto the PCA axes.
  // PC1 = the main combined lifestyle pattern
  // PC2 = the secondary lifestyle pattern
  const points = transformedRows.map((row, index) => {
    const z = zRows[index] ?? []
    return {
      dayNumber: row.dayNumber,
      dateISO: row.dateISO,
      shoutCount: row.shoutCount,
      pc1: round4(dot(z, first.eigenvector)),
      pc2: round4(dot(z, second.eigenvector)),
    }
  })

  return {
    variables: PCA_VARIABLES,
    points,
    loadings,
    explainedVariance: {
      pc1: clamp01(first.eigenvalue / totalVariance),
      pc2: clamp01(second.eigenvalue / totalVariance),
    },
    eigenvalues: {
      pc1: round4(first.eigenvalue),
      pc2: round4(second.eigenvalue),
    },
    means,
    standardDeviations,
    correlationMatrix: correlationMatrix.map((row) => row.map(round4)),
  }
}

