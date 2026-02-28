function mean(xs: number[]) {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

export function pearsonCorrelation(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return 0
  const x = xs.slice(0, n)
  const y = ys.slice(0, n)
  const mx = mean(x)
  const my = mean(y)

  let num = 0
  let dx = 0
  let dy = 0
  for (let i = 0; i < n; i++) {
    const a = x[i]! - mx
    const b = y[i]! - my
    num += a * b
    dx += a * a
    dy += b * b
  }
  const den = Math.sqrt(dx * dy)
  return den === 0 ? 0 : num / den
}

export function linearRegression(xs: number[], ys: number[]) {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return { slope: 0, intercept: 0 }
  const x = xs.slice(0, n)
  const y = ys.slice(0, n)
  const mx = mean(x)
  const my = mean(y)

  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    const a = x[i]! - mx
    num += a * (y[i]! - my)
    den += a * a
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx
  return { slope, intercept }
}

