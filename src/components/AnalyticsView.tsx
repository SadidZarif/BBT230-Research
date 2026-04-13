import { useEffect, useState } from 'react'
import ReactECharts from 'echarts-for-react'
import type { DailyRow } from '../types'
import { pearsonCorrelation, linearRegression } from '../analytics'
import { computeLifestylePca } from '../pca'
import { round2 } from '../scoring'

function fmtShort(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(d)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

function shoutGroupLabel(shoutCount: number) {
  if (shoutCount <= 3) return 'Low shout'
  if (shoutCount <= 6) return 'Moderate shout'
  return 'High shout'
}

export function AnalyticsView({ rows, theme }: { rows: DailyRow[]; theme: 'light' | 'dark' }) {
  const [isMobile, setIsMobile] = useState(false)
  const isDark = theme === 'dark'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)')
    const sync = () => setIsMobile(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const completed = rows.filter(
    (r) =>
      r.shoutCount != null &&
      r.stress != null &&
      r.sleepHours != null &&
      r.studyMinutes != null &&
      r.food != null &&
      r.social != null,
  )
  const sorted = [...completed].sort((a, b) => a.dateISO.localeCompare(b.dateISO))
  const labels = sorted.map((r) => fmtShort(r.dateISO))
  const shoutCounts = sorted.map((r) => r.shoutCount as number)
  const wellBeing = sorted.map((r) => round2(r.wellBeingScore))

  const r = pearsonCorrelation(shoutCounts, wellBeing)
  const { slope, intercept } = linearRegression(shoutCounts, wellBeing)
  const pca = computeLifestylePca(sorted)

  const scatter = sorted.map((d) => [d.shoutCount as number, round2(d.wellBeingScore)])
  const xMin = 0
  const xMax = 10
  const regLine = [
    [xMin, clamp(slope * xMin + intercept, 0, 5)],
    [xMax, clamp(slope * xMax + intercept, 0, 5)],
  ]

  const pcaScatter =
    pca?.points.map((point) => ({
      value: [point.pc1, point.pc2, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
      shoutCount: point.shoutCount,
      group: shoutGroupLabel(point.shoutCount),
    })) ?? []
  const pcaScatterPc3 =
    pca?.points.map((point) => ({
      value: [point.pc1, point.pc3, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
      shoutCount: point.shoutCount,
      group: shoutGroupLabel(point.shoutCount),
    })) ?? []
  const pcaScatterPc2Pc3 =
    pca?.points.map((point) => ({
      value: [point.pc2, point.pc3, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
      shoutCount: point.shoutCount,
      group: shoutGroupLabel(point.shoutCount),
    })) ?? []
  const pcaScatterLow = pcaScatter.filter((point) => point.group === 'Low shout')
  const pcaScatterModerate = pcaScatter.filter((point) => point.group === 'Moderate shout')
  const pcaScatterHigh = pcaScatter.filter((point) => point.group === 'High shout')
  const pcaScatterPc3Low = pcaScatterPc3.filter((point) => point.group === 'Low shout')
  const pcaScatterPc3Moderate = pcaScatterPc3.filter((point) => point.group === 'Moderate shout')
  const pcaScatterPc3High = pcaScatterPc3.filter((point) => point.group === 'High shout')
  const pcaScatterPc2Pc3Low = pcaScatterPc2Pc3.filter((point) => point.group === 'Low shout')
  const pcaScatterPc2Pc3Moderate = pcaScatterPc2Pc3.filter((point) => point.group === 'Moderate shout')
  const pcaScatterPc2Pc3High = pcaScatterPc2Pc3.filter((point) => point.group === 'High shout')
  const pc1Scores = pca?.points.map((point) => point.pc1) ?? []
  const shoutVsPc1Scatter =
    pca?.points.map((point) => ({
      value: [point.pc1, point.shoutCount, point.dayNumber],
      dateLabel: fmtShort(point.dateISO),
    })) ?? []
  const pc1Range = pc1Scores.length > 0 ? [Math.min(...pc1Scores), Math.max(...pc1Scores)] : [-1, 1]
  const shoutVsPc1 = linearRegression(pc1Scores, pca?.points.map((point) => point.shoutCount) ?? [])
  const shoutVsPc1Line = [
    [pc1Range[0], clamp(shoutVsPc1.slope * pc1Range[0] + shoutVsPc1.intercept, 0, 10)],
    [pc1Range[1], clamp(shoutVsPc1.slope * pc1Range[1] + shoutVsPc1.intercept, 0, 10)],
  ]
  const loadings = pca?.loadings ?? []

  const axisLabelStyle = { color: isDark ? '#94a3b8' : '#64748b' }
  const splitLineStyle = { lineStyle: { color: isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.08)' } }
  const axisLineStyle = { lineStyle: { color: isDark ? 'rgba(148,163,184,0.25)' : 'rgba(0,0,0,0.12)' } }
  const tooltipStyle = {
    backgroundColor: isDark ? 'rgba(15,23,42,0.94)' : 'rgba(255,255,255,0.95)',
    borderColor: isDark ? 'rgba(99,102,241,0.35)' : 'rgba(99,102,241,0.2)',
    textStyle: { color: isDark ? '#e2e8f0' : '#1e293b' },
  }
  const legendTextStyle = isDark ? { color: '#cbd5e1' } : { color: '#475569' }
  const legendTextStyleMobile = isDark ? { color: '#cbd5e1', fontSize: 10 } : { color: '#475569', fontSize: 10 }
  const lineChartHeight = isMobile ? 260 : 320
  const scatterChartHeight = isMobile ? 300 : 360
  const chartGrid = isMobile
    ? { left: 34, right: 12, top: 24, bottom: 34 }
    : { left: 40, right: 20, top: 30, bottom: 40 }
  const scatterGrid = isMobile
    ? { left: 42, right: 12, top: 28, bottom: 44 }
    : { left: 55, right: 20, top: 30, bottom: 50 }
  const axisNameTextStyle = isMobile
    ? { color: isDark ? '#cbd5e1' : '#475569', fontSize: 11 }
    : { color: isDark ? '#cbd5e1' : '#475569' }
  const categoryAxisLabel = isMobile
    ? { ...axisLabelStyle, fontSize: 10, hideOverlap: true }
    : axisLabelStyle
  const valueAxisLabel = isMobile ? { ...axisLabelStyle, fontSize: 10 } : axisLabelStyle

  return (
    <section className="w-full max-w-[1600px] px-3 sm:px-4 pb-10 md:pb-12 z-10">
      <div className="glass-panel w-full rounded-[28px] p-4 sm:p-6 md:p-8 ring-1 ring-slate-200/50 dark:ring-white/10 shadow-2xl shadow-black/10 dark:shadow-black/50 overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-5 md:mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Analytics
            </h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 leading-6 max-w-2xl">
              Trend + correlation between shouting and well-being over 40 days.
            </p>
          </div>

          <div className="grid w-full md:w-auto grid-cols-2 md:flex gap-3">
            <Kpi label="Pearson r" value={r.toFixed(3)} glowClass="shadow-neon-accent" isDark={isDark} />
            <Kpi label="Slope" value={slope.toFixed(3)} glowClass="shadow-neon" isDark={isDark} />
            <Kpi
              label="PC1 Variance"
              value={pca ? `${(pca.explainedVariance.pc1 * 100).toFixed(1)}%` : '--'}
              glowClass="shadow-[0_0_25px_rgba(16,185,129,0.25)]"
              isDark={isDark}
            />
            <Kpi
              label="PC2 Variance"
              value={pca ? `${(pca.explainedVariance.pc2 * 100).toFixed(1)}%` : '--'}
              glowClass="shadow-[0_0_25px_rgba(236,72,153,0.22)]"
              isDark={isDark}
            />
            <Kpi
              label="PC3 Variance"
              value={pca ? `${(pca.explainedVariance.pc3 * 100).toFixed(1)}%` : '--'}
              glowClass="shadow-[0_0_25px_rgba(249,115,22,0.22)]"
              isDark={isDark}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5 md:mb-6">
          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 xl:col-span-2">
            <h3 className="text-slate-900 dark:text-white font-bold">PCA interpretation</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 leading-6">
              <span className="text-slate-700 dark:text-slate-200 font-semibold">PC1</span> represents the main overall lifestyle /
              well-being pattern formed from stress, sleep, study, food, and social behavior.{' '}
              <span className="text-slate-700 dark:text-slate-200 font-semibold">PC2</span> represents the secondary variation pattern that
              captures a different combination of those same lifestyle variables.{' '}
              <span className="text-slate-700 dark:text-slate-200 font-semibold">PC3</span> captures the next layer of variation after PC1
              and PC2.
            </p>
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-3 leading-5">
              Before PCA, stress is reversed so that higher values always mean a better condition, then all five
              lifestyle variables are converted to z-scores. That way PCA compares them on the same scale.
            </p>
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5">
            <h3 className="text-slate-900 dark:text-white font-bold mb-3">Explained Variance</h3>
            <VarianceRow label="PC1" value={pca?.explainedVariance.pc1 ?? 0} colorClass="from-emerald-500 to-cyan-400" isDark={isDark} />
            <VarianceRow label="PC2" value={pca?.explainedVariance.pc2 ?? 0} colorClass="from-pink-500 to-purple-400" isDark={isDark} />
            <VarianceRow label="PC3" value={pca?.explainedVariance.pc3 ?? 0} colorClass="from-orange-500 to-amber-300" isDark={isDark} />
            <p className="text-slate-400 dark:text-slate-500 text-xs mt-4">
              Higher explained variance means that component captures more of the overall lifestyle pattern.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-3">Well-Being Score (0–5)</h3>
            <ReactECharts
              style={{ height: lineChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: chartGrid,
                xAxis: {
                  type: 'category',
                  data: labels,
                  axisLabel: categoryAxisLabel,
                  axisLine: axisLineStyle,
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 5,
                  axisLabel: valueAxisLabel,
                  splitLine: splitLineStyle,
                },
                tooltip: { trigger: 'axis', ...tooltipStyle },
                series: [
                  {
                    type: 'line',
                    data: wellBeing,
                    smooth: true,
                    symbol: 'circle',
                    symbolSize: 6,
                    lineStyle: { width: 3, color: '#06b6d4' },
                    itemStyle: { color: '#06b6d4' },
                    areaStyle: { color: 'rgba(6,182,212,0.12)' },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-3">Shout Count (0–10)</h3>
            <ReactECharts
              style={{ height: lineChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: chartGrid,
                xAxis: {
                  type: 'category',
                  data: labels,
                  axisLabel: categoryAxisLabel,
                  axisLine: axisLineStyle,
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 10,
                  axisLabel: valueAxisLabel,
                  splitLine: splitLineStyle,
                },
                tooltip: { trigger: 'axis', ...tooltipStyle },
                series: [
                  {
                    type: 'bar',
                    data: shoutCounts,
                    barWidth: '60%',
                    itemStyle: {
                      borderRadius: [8, 8, 0, 0],
                      color: {
                        type: 'linear',
                        x: 0,
                        y: 0,
                        x2: 0,
                        y2: 1,
                        colorStops: [
                          { offset: 0, color: '#a855f7' },
                          { offset: 1, color: 'rgba(168,85,247,0.2)' },
                        ],
                      },
                    },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 xl:col-span-2 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-3">Shout Count vs Well-Being (scatter)</h3>
            <ReactECharts
              style={{ height: scatterChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: scatterGrid,
                xAxis: {
                  type: 'value',
                  min: 0,
                  max: 10,
                  name: 'Shout Count',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 26 : 32,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 5,
                  name: 'Well-Being Score',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 32 : 42,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                tooltip: {
                  trigger: 'item',
                  ...tooltipStyle,
                  formatter: (params: { value?: [number, number] }) =>
                    `Shout Count: ${params.value?.[0] ?? '--'}<br/>Well-Being: ${params.value?.[1] ?? '--'}`,
                },
                series: [
                  {
                    name: 'Days',
                    type: 'scatter',
                    data: scatter,
                    symbolSize: 10,
                    itemStyle: { color: '#6366f1', opacity: 0.9 },
                  },
                  {
                    name: 'Trend',
                    type: 'line',
                    data: regLine,
                    showSymbol: false,
                    lineStyle: { width: 3, color: '#06b6d4' },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-1">PCA Plot (PC1 vs PC2)</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">
              Each point is one day after PCA on stress, sleep, study, food, and social variables.
            </p>
            <ReactECharts
              style={{ height: scatterChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: {
                  left: isMobile ? 40 : 55,
                  right: isMobile ? 10 : 20,
                  top: isMobile ? 56 : 30,
                  bottom: isMobile ? 40 : 50,
                },
                legend: {
                  top: 0,
                  itemWidth: 12,
                  itemHeight: 12,
                  data: ['Low shout', 'Moderate shout', 'High shout'],
                  itemGap: isMobile ? 10 : 18,
                  textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
                },
                xAxis: {
                  type: 'value',
                  name: 'PC1',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 26 : 32,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                yAxis: {
                  type: 'value',
                  name: 'PC2',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 30 : 42,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                tooltip: {
                  trigger: 'item',
                  ...tooltipStyle,
                  formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string; shoutCount?: number } }) =>
                    `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC1: ${params.data?.value?.[0] ?? '--'}<br/>PC2: ${params.data?.value?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
                },
                series: [
                  {
                    name: 'Low shout',
                    type: 'scatter',
                    data: pcaScatterLow,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#22c55e',
                      shadowBlur: 18,
                      shadowColor: 'rgba(34,197,94,0.35)',
                      opacity: 0.95,
                    },
                  },
                  {
                    name: 'Moderate shout',
                    type: 'scatter',
                    data: pcaScatterModerate,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#f59e0b',
                      shadowBlur: 18,
                      shadowColor: 'rgba(245,158,11,0.35)',
                      opacity: 0.95,
                    },
                  },
                  {
                    name: 'High shout',
                    type: 'scatter',
                    data: pcaScatterHigh,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#ef4444',
                      shadowBlur: 18,
                      shadowColor: 'rgba(239,68,68,0.35)',
                      opacity: 0.95,
                    },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-1">Shout Count vs PC1</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">
              This compares the outcome variable (<code className="font-mono">shoutCount</code>) with the main PCA
              lifestyle pattern (PC1).
            </p>
            <ReactECharts
              style={{ height: scatterChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: scatterGrid,
                xAxis: {
                  type: 'value',
                  name: 'PC1',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 26 : 32,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 10,
                  name: 'Shout Count',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 32 : 42,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                tooltip: {
                  trigger: 'item',
                  ...tooltipStyle,
                  formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string } }) =>
                    `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC1: ${params.data?.value?.[0] ?? '--'}<br/>Shout Count: ${params.data?.value?.[1] ?? '--'}`,
                },
                series: [
                  {
                    name: 'Days',
                    type: 'scatter',
                    data: shoutVsPc1Scatter,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#a855f7',
                      shadowBlur: 18,
                      shadowColor: 'rgba(168,85,247,0.35)',
                    },
                  },
                  {
                    name: 'Trend',
                    type: 'line',
                    data: shoutVsPc1Line,
                    showSymbol: false,
                    lineStyle: { width: 3, color: '#f472b6' },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-1">PCA Plot (PC1 vs PC3)</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">
              This shows the third PCA direction after PC1 and PC2, grouped by shout level.
            </p>
            <ReactECharts
              style={{ height: scatterChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: {
                  left: isMobile ? 40 : 55,
                  right: isMobile ? 10 : 20,
                  top: isMobile ? 56 : 30,
                  bottom: isMobile ? 40 : 50,
                },
                legend: {
                  top: 0,
                  itemWidth: 12,
                  itemHeight: 12,
                  data: ['Low shout', 'Moderate shout', 'High shout'],
                  itemGap: isMobile ? 10 : 18,
                  textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
                },
                xAxis: {
                  type: 'value',
                  name: 'PC1',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 26 : 32,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                yAxis: {
                  type: 'value',
                  name: 'PC3',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 30 : 42,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                tooltip: {
                  trigger: 'item',
                  ...tooltipStyle,
                  formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string; shoutCount?: number } }) =>
                    `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC1: ${params.data?.value?.[0] ?? '--'}<br/>PC3: ${params.data?.value?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
                },
                series: [
                  {
                    name: 'Low shout',
                    type: 'scatter',
                    data: pcaScatterPc3Low,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#22c55e',
                      shadowBlur: 18,
                      shadowColor: 'rgba(34,197,94,0.35)',
                      opacity: 0.95,
                    },
                  },
                  {
                    name: 'Moderate shout',
                    type: 'scatter',
                    data: pcaScatterPc3Moderate,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#f59e0b',
                      shadowBlur: 18,
                      shadowColor: 'rgba(245,158,11,0.35)',
                      opacity: 0.95,
                    },
                  },
                  {
                    name: 'High shout',
                    type: 'scatter',
                    data: pcaScatterPc3High,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#ef4444',
                      shadowBlur: 18,
                      shadowColor: 'rgba(239,68,68,0.35)',
                      opacity: 0.95,
                    },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-1">PCA Plot (PC2 vs PC3)</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">
              This compares the second and third PCA directions, grouped by shout level.
            </p>
            <ReactECharts
              style={{ height: scatterChartHeight }}
              option={{
                backgroundColor: 'transparent',
                grid: {
                  left: isMobile ? 40 : 55,
                  right: isMobile ? 10 : 20,
                  top: isMobile ? 56 : 30,
                  bottom: isMobile ? 40 : 50,
                },
                legend: {
                  top: 0,
                  itemWidth: 12,
                  itemHeight: 12,
                  data: ['Low shout', 'Moderate shout', 'High shout'],
                  itemGap: isMobile ? 10 : 18,
                  textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
                },
                xAxis: {
                  type: 'value',
                  name: 'PC2',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 26 : 32,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                yAxis: {
                  type: 'value',
                  name: 'PC3',
                  nameLocation: 'middle',
                  nameGap: isMobile ? 30 : 42,
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                tooltip: {
                  trigger: 'item',
                  ...tooltipStyle,
                  formatter: (params: { data?: { value?: [number, number, number]; dateLabel?: string; shoutCount?: number } }) =>
                    `Day ${params.data?.value?.[2] ?? '--'} (${params.data?.dateLabel ?? '--'})<br/>PC2: ${params.data?.value?.[0] ?? '--'}<br/>PC3: ${params.data?.value?.[1] ?? '--'}<br/>Shout Count: ${params.data?.shoutCount ?? '--'}`,
                },
                series: [
                  {
                    name: 'Low shout',
                    type: 'scatter',
                    data: pcaScatterPc2Pc3Low,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#22c55e',
                      shadowBlur: 18,
                      shadowColor: 'rgba(34,197,94,0.35)',
                      opacity: 0.95,
                    },
                  },
                  {
                    name: 'Moderate shout',
                    type: 'scatter',
                    data: pcaScatterPc2Pc3Moderate,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#f59e0b',
                      shadowBlur: 18,
                      shadowColor: 'rgba(245,158,11,0.35)',
                      opacity: 0.95,
                    },
                  },
                  {
                    name: 'High shout',
                    type: 'scatter',
                    data: pcaScatterPc2Pc3High,
                    symbolSize: 12,
                    itemStyle: {
                      color: '#ef4444',
                      shadowBlur: 18,
                      shadowColor: 'rgba(239,68,68,0.35)',
                      opacity: 0.95,
                    },
                  },
                ],
              }}
            />
          </div>

          <div className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-200/50 dark:border-white/5 xl:col-span-2 min-w-0">
            <h3 className="text-slate-900 dark:text-white font-bold mb-1">PC1, PC2 and PC3 Loadings</h3>
            <p className="text-slate-500 dark:text-slate-400 text-xs mb-3">
              These loadings show how strongly each lifestyle variable contributes to PC1, PC2, and PC3.
            </p>
            <ReactECharts
              style={{ height: scatterChartHeight }}
              option={{
                backgroundColor: 'transparent',
                legend: {
                  top: 0,
                  itemGap: isMobile ? 10 : 18,
                  textStyle: isMobile ? legendTextStyleMobile : legendTextStyle,
                },
                grid: {
                  left: isMobile ? 34 : 45,
                  right: isMobile ? 12 : 20,
                  top: isMobile ? 54 : 40,
                  bottom: isMobile ? 34 : 45,
                },
                xAxis: {
                  type: 'category',
                  data: loadings.map((item) => item.variable),
                  axisLabel: categoryAxisLabel,
                  axisLine: axisLineStyle,
                },
                yAxis: {
                  type: 'value',
                  min: -1,
                  max: 1,
                  name: 'Loading',
                  nameTextStyle: axisNameTextStyle,
                  axisLabel: valueAxisLabel,
                  axisLine: axisLineStyle,
                  splitLine: splitLineStyle,
                },
                tooltip: { trigger: 'axis', ...tooltipStyle },
                series: [
                  {
                    name: 'PC1 Loadings',
                    type: 'bar',
                    data: loadings.map((item) => item.pc1),
                    barMaxWidth: 28,
                    itemStyle: {
                      borderRadius: [6, 6, 0, 0],
                      color: '#10b981',
                    },
                  },
                  {
                    name: 'PC2 Loadings',
                    type: 'bar',
                    data: loadings.map((item) => item.pc2),
                    barMaxWidth: 28,
                    itemStyle: {
                      borderRadius: [6, 6, 0, 0],
                      color: '#ec4899',
                    },
                  },
                  {
                    name: 'PC3 Loadings',
                    type: 'bar',
                    data: loadings.map((item) => item.pc3),
                    barMaxWidth: 28,
                    itemStyle: {
                      borderRadius: [6, 6, 0, 0],
                      color: '#f97316',
                    },
                  },
                ],
              }}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function Kpi({
  label,
  value,
  glowClass,
  isDark,
}: {
  label: string
  value: string
  glowClass: string
  isDark: boolean
}) {
  return (
    <div className={`min-w-0 px-3 sm:px-4 py-3 rounded-2xl bg-white/60 dark:bg-slate-900/60 border border-slate-200 dark:border-white/10 ${isDark ? glowClass : ''}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">{label}</div>
      <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white font-mono leading-none mt-1">{value}</div>
    </div>
  )
}

function VarianceRow({
  label,
  value,
  colorClass,
  isDark: _isDark,
}: {
  label: string
  value: number
  colorClass: string
  isDark: boolean
}) {
  const pct = clamp(value * 100, 0, 100)
  return (
    <div className="mb-4 last:mb-0">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{label}</span>
        <span className="text-sm font-mono text-slate-900 dark:text-white">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-900/70 border border-slate-300/50 dark:border-white/5 overflow-hidden">
        <div className={`h-full rounded-full bg-gradient-to-r ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
