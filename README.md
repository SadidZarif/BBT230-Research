# BBT230 Research — Shouting vs Well‑Being (40 days)

A premium UI web app to log **daily shouting frequency** and compute a **Well‑Being Score (0–5)** across a fixed **40‑day study**.

## Permissions

**Copyright (c) 2026 S M Sadid Zarif Prinon and Samia Chowdhury Ridheeka. All rights reserved.**

This repository is **not open-source**. You may not copy, modify, redistribute, or reuse this project (including the UI/design) without **prior written permission**.

## Study schedule

- **Day 1**: 2026‑02‑20  
- **Day 40**: 2026‑03‑31  

## Data entry rules

- Each day has 6 inputs: `ShoutCount`, `Stress`, `SleepHours`, `StudyMinutes`, `Food`, `Social`.
- A row is **locked** until the **previous day is completed**.
- **View Score** is disabled until **all 6 values are set** for that day.
- Header shows **Study Active: Day n of 40** where \(n\) = consecutive completed days from Day 1.

## Well‑Being score

**Well‑Being Score** = `Stress + Sleep + Study + Food + Social` → range **0–5**.

### Stress (1–10) — reverse scale

| Stress | Score |
|---:|---:|
| 1 | 1.00 |
| 2 | 0.89 |
| 3 | 0.78 |
| 4 | 0.67 |
| 5 | 0.56 |
| 6 | 0.44 |
| 7 | 0.33 |
| 8 | 0.22 |
| 9 | 0.11 |
| 10 | 0.00 |

### Sleep (0–8 hours)

`SleepScore = SleepHours × 0.125`

### Study (minutes/day)

| Minutes | Score |
|---:|---:|
| 0 | 0.00 |
| 30 | 0.17 |
| 60 | 0.33 |
| 90 | 0.50 |
| 120 | 0.67 |
| 150 | 0.83 |
| 180+ | 1.00 |

### Food (1–10)

| Food | Score |
|---:|---:|
| 1 | 0.10 |
| 2 | 0.20 |
| 3 | 0.30 |
| 4 | 0.40 |
| 5 | 0.50 |
| 6 | 0.60 |
| 7 | 0.70 |
| 8 | 0.80 |
| 9 | 0.90 |
| 10 | 1.00 |

### Social (1–10)

Same as Food.

## Tech

- React + TypeScript + Vite
- TailwindCSS
- ECharts (analytics)
- Framer Motion (modal animations)

## Run locally

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
npm run preview
```

## Export

Use the **Export to CSV** link in the UI to store the data in your local machine.
