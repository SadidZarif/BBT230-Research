import ReactECharts from 'echarts-for-react'
import type { DailyRow } from '../types'
import { pearsonCorrelation, linearRegression } from '../analytics'
import { round2 } from '../scoring'

function fmtShort(iso: string) {
  const d = new Date(`${iso}T00:00:00`)
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(d)
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export function AnalyticsView({ rows }: { rows: DailyRow[] }) {
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

  const scatter = sorted.map((d) => [d.shoutCount as number, round2(d.wellBeingScore)])
  const xMin = 0
  const xMax = 10
  const regLine = [
    [xMin, clamp(slope * xMin + intercept, 0, 5)],
    [xMax, clamp(slope * xMax + intercept, 0, 5)],
  ]

  return (
    <section className="w-full max-w-[1600px] px-4 pb-12 z-10">
      <div className="glass-panel w-full rounded-3xl p-6 md:p-8 ring-1 ring-white/10 shadow-2xl shadow-black/50">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Analytics
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              Trend + correlation between shouting and well-being over 40 days.
            </p>
          </div>

          <div className="flex gap-3">
            <Kpi label="Pearson r" value={r.toFixed(3)} glowClass="shadow-neon-accent" />
            <Kpi label="Slope" value={slope.toFixed(3)} glowClass="shadow-neon" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="glass-card rounded-2xl p-4 border border-white/5">
            <h3 className="text-white font-bold mb-3">Well-Being Score (0–5)</h3>
            <ReactECharts
              style={{ height: 320 }}
              option={{
                backgroundColor: 'transparent',
                grid: { left: 40, right: 20, top: 30, bottom: 40 },
                xAxis: {
                  type: 'category',
                  data: labels,
                  axisLabel: { color: '#94a3b8' },
                  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 5,
                  axisLabel: { color: '#94a3b8' },
                  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
                },
                tooltip: { trigger: 'axis' },
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

          <div className="glass-card rounded-2xl p-4 border border-white/5">
            <h3 className="text-white font-bold mb-3">Shout Count (0–10)</h3>
            <ReactECharts
              style={{ height: 320 }}
              option={{
                backgroundColor: 'transparent',
                grid: { left: 40, right: 20, top: 30, bottom: 40 },
                xAxis: {
                  type: 'category',
                  data: labels,
                  axisLabel: { color: '#94a3b8' },
                  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 10,
                  axisLabel: { color: '#94a3b8' },
                  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
                },
                tooltip: { trigger: 'axis' },
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

          <div className="glass-card rounded-2xl p-4 border border-white/5 xl:col-span-2">
            <h3 className="text-white font-bold mb-3">Shout Count vs Well-Being (scatter)</h3>
            <ReactECharts
              style={{ height: 360 }}
              option={{
                backgroundColor: 'transparent',
                grid: { left: 50, right: 20, top: 30, bottom: 45 },
                xAxis: {
                  type: 'value',
                  min: 0,
                  max: 10,
                  axisLabel: { color: '#94a3b8' },
                  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
                },
                yAxis: {
                  type: 'value',
                  min: 0,
                  max: 5,
                  axisLabel: { color: '#94a3b8' },
                  axisLine: { lineStyle: { color: 'rgba(148,163,184,0.25)' } },
                  splitLine: { lineStyle: { color: 'rgba(148,163,184,0.15)' } },
                },
                tooltip: { trigger: 'item' },
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
        </div>
      </div>
    </section>
  )
}

function Kpi({
  label,
  value,
  glowClass,
}: {
  label: string
  value: string
  glowClass: string
}) {
  return (
    <div className={`px-4 py-3 rounded-2xl bg-slate-900/60 border border-white/10 ${glowClass}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{label}</div>
      <div className="text-lg font-extrabold text-white font-mono">{value}</div>
    </div>
  )
}

