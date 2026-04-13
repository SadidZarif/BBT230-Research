import type { DailyRow } from './types'

// These are the 5 lifestyle variables used inside PCA.
// Important: shoutCount is NOT part of PCA itself.
export type PcaVariableName = 'stress' | 'sleep' | 'study' | 'food' | 'social'

// PCA score for one completed day.
// pc1, pc2, and pc3 are the coordinates of that day on the PCA axes.
export type PcaPoint = {
  dayNumber: number
  dateISO: string
  shoutCount: number
  pc1: number
  pc2: number
  pc3: number
}

// Full PCA output returned to the analytics UI.
// This includes the day-wise scores, component loadings, explained variance,
// eigenvalues, and some useful debugging/statistical details.
export type PcaResult = {
  variables: PcaVariableName[]
  points: PcaPoint[]
  loadings: Array<{
    variable: PcaVariableName
    pc1: number
    pc2: number
    pc3: number
  }>
  explainedVariance: {
    pc1: number
    pc2: number
    pc3: number
  }
  eigenvalues: {
    pc1: number
    pc2: number
    pc3: number
  }
  means: Record<PcaVariableName, number>
  standardDeviations: Record<PcaVariableName, number>
  correlationMatrix: number[][]
}

// Internal row format used after we confirm that all PCA inputs are numeric.
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

// The fixed variable order matters because PCA works with vectors and matrices.
const PCA_VARIABLES: PcaVariableName[] = ['stress', 'sleep', 'study', 'food', 'social']

// Compute the arithmetic mean of a numeric array.
function mean(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((sum, x) => sum + x, 0) / xs.length
}

// Compute the sample standard deviation (uses n - 1).
// If we do not have enough data or the standard deviation becomes 0,
// we return 1 to avoid division by zero during z-score standardization.
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

// Standard dot product between two vectors.
function dot(a: number[], b: number[]) {
  let total = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) total += (a[i] ?? 0) * (b[i] ?? 0)
  return total
}

// Multiply a matrix by a vector.
function multiplyMatrixVector(matrix: number[][], vector: number[]) {
  return matrix.map((row) => dot(row, vector))
}

// Euclidean vector length (norm).
function vectorLength(vector: number[]) {
  return Math.sqrt(dot(vector, vector))
}

// Convert a vector into a unit vector so its length becomes 1.
function normalizeVector(vector: number[]) {
  const len = vectorLength(vector)
  if (len === 0) return vector.map(() => 0)
  return vector.map((x) => x / len)
}

// Outer product v * v^T.
// This is used in the matrix deflation step when extracting later PCs.
function outerProduct(vector: number[]) {
  return vector.map((a) => vector.map((b) => a * b))
}

// Subtract one matrix from another.
function subtractMatrices(a: number[][], b: number[][]) {
  return a.map((row, i) => row.map((value, j) => value - (b[i]?.[j] ?? 0)))
}

// Multiply every entry of a matrix by a scalar.
function scaleMatrix(matrix: number[][], factor: number) {
  return matrix.map((row) => row.map((value) => value * factor))
}

// Keep a variance ratio inside the valid [0, 1] range.
function clamp01(n: number) {
  return Math.min(1, Math.max(0, n))
}

// Round values to 4 decimal places for stable UI display.
function round4(n: number) {
  return Math.round(n * 10000) / 10000
}

// Build a simple basis vector like [0, 1, 0, 0, ...].
// This is used as a safe fallback if a PCA direction becomes degenerate.
function buildIdentityVector(size: number, index: number) {
  const out = new Array<number>(size).fill(0)
  out[index] = 1
  return out
}

// POWER ITERATION FOR A SYMMETRIC MATRIX
//
// Goal:
// Find the dominant eigenvector and eigenvalue of the PCA matrix.
//
// Why this works here:
// The correlation matrix is symmetric, so repeated multiplication + normalization
// converges to the main eigenvector (the direction of maximum variance).
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

// Extract the first N principal components using repeated deflation.
//
// Step 1: Find the dominant component of the current matrix.
// Step 2: Remove that component from the matrix.
// Step 3: Repeat until we collect the requested number of components.
function extractTopComponents(matrix: number[][], count: number) {
  const components: Array<{ eigenvalue: number; eigenvector: number[] }> = []
  let working = matrix.map((row) => [...row])

  for (let i = 0; i < count; i++) {
    let component = powerIterationSymmetric(working)

    // If the matrix has too little variation, fall back to a simple basis vector.
    if (vectorLength(component.eigenvector) === 0) {
      component = { eigenvalue: 0, eigenvector: buildIdentityVector(matrix.length, Math.min(i, matrix.length - 1)) }
    }

    components.push(component)
    working = subtractMatrices(working, scaleMatrix(outerProduct(component.eigenvector), component.eigenvalue))
  }

  return components
}

// Build the correlation matrix from z-score standardized rows.
//
// Because all variables are standardized first, the covariance matrix becomes
// equivalent to the correlation matrix for PCA purposes.
// This makes the comparison fair even though the original variables use
// different units/scales (for example, study minutes vs 1-10 ratings).
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

// Keep only completed rows and convert them into a clean numeric format.
// PCA should only run on days where all 5 lifestyle variables are present.
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

// MAIN PCA FUNCTION
//
// This function:
// 1) filters to completed rows,
// 2) reverses stress so higher always means better condition,
// 3) standardizes all 5 lifestyle variables using z-scores,
// 4) builds the correlation matrix,
// 5) extracts PC1, PC2, and PC3,
// 6) computes day-wise PCA scores, loadings, eigenvalues, and explained variance.
//
// Important:
// - PCA uses ONLY stress, sleep, study, food, and social
// - shoutCount is not included in PCA itself
// - shoutCount is carried along only for later comparison with PC1
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

  // Compute the mean of each PCA variable.
  const means = {
    stress: mean(columns.stress),
    sleep: mean(columns.sleep),
    study: mean(columns.study),
    food: mean(columns.food),
    social: mean(columns.social),
  } satisfies Record<PcaVariableName, number>

  // Compute the sample standard deviation of each PCA variable.
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
  const [first, second, third] = extractTopComponents(correlationMatrix, 3)

  // Total variance is the trace (diagonal sum) of the correlation matrix.
  // Since this is PCA on standardized variables, total variance is approximately
  // equal to the number of variables (here: 5).
  const totalVariance = correlationMatrix.reduce((sum, row, i) => sum + (row[i] ?? 0), 0) || PCA_VARIABLES.length

  // These loadings show how strongly each variable contributes to PC1, PC2, and PC3.
  // For standardized PCA, loading = eigenvector * sqrt(eigenvalue).
  const loadings = PCA_VARIABLES.map((variable, index) => ({
    variable,
    pc1: round4((first.eigenvector[index] ?? 0) * Math.sqrt(first.eigenvalue)),
    pc2: round4((second.eigenvector[index] ?? 0) * Math.sqrt(second.eigenvalue)),
    pc3: round4((third.eigenvector[index] ?? 0) * Math.sqrt(third.eigenvalue)),
  }))

  // PC scores place each day onto the PCA axes.
  // PC1 = the main combined lifestyle pattern
  // PC2 = the secondary lifestyle pattern
  // PC3 = the third major variation pattern after PC1 and PC2
  const points = transformedRows.map((row, index) => {
    const z = zRows[index] ?? []
    return {
      dayNumber: row.dayNumber,
      dateISO: row.dateISO,
      shoutCount: row.shoutCount,
      pc1: round4(dot(z, first.eigenvector)),
      pc2: round4(dot(z, second.eigenvector)),
      pc3: round4(dot(z, third.eigenvector)),
    }
  })

  // Return everything needed by the analytics UI.
  return {
    variables: PCA_VARIABLES,
    points,
    loadings,
    explainedVariance: {
      pc1: clamp01(first.eigenvalue / totalVariance),
      pc2: clamp01(second.eigenvalue / totalVariance),
      pc3: clamp01(third.eigenvalue / totalVariance),
    },
    eigenvalues: {
      pc1: round4(first.eigenvalue),
      pc2: round4(second.eigenvalue),
      pc3: round4(third.eigenvalue),
    },
    means,
    standardDeviations,
    correlationMatrix: correlationMatrix.map((row) => row.map(round4)),
  }
}

