import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import { linePoints } from '../../src/core/objects'
import { parseThermogram } from '../../src/core/parser'
import { palette } from '../../src/core/palettes'
import { temperatureModel } from '../../src/core/temperature'
import { uk } from '../../src/i18n/uk'
import { niceTicks, tickDigits } from '../../src/ui/chart'
import Histogram from '../../src/ui/Histogram.svelte'
import IsothermPanel from '../../src/ui/IsothermPanel.svelte'
import { defaultIsotherms, hexToRgb, isothermBand, type IsothermState } from '../../src/ui/isotherms'
import ProfileChart from '../../src/ui/ProfileChart.svelte'
import { lineProfile, measureObjects, profileCsv } from '../../src/ui/results'
import { units } from '../../src/ui/settings'
import type { MeasureObject } from '../../src/ui/tools'

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')
const ir = parseThermogram(new Uint8Array(readFileSync(sample))).ir
const t = (key: keyof typeof uk) => uk[key]

const line: MeasureObject = {
  id: 1,
  name: 'L1',
  shape: { kind: 'line', x0: 10, y0: 20, x1: 80, y1: 50 },
  overrides: {},
}

describe('профіль лінії', () => {
  const profile = lineProfile(ir, line)

  it('точки — піксели лінії від початку до кінця, статистика — як у таблиці', () => {
    expect(profile.map((p) => [p.x, p.y])).toEqual(linePoints(10, 20, 80, 50))
    const [row] = measureObjects(ir, [line])
    const temps = profile.map((p) => p.t)
    expect(Math.max(...temps)).toBeCloseTo(row!.stats.max, 4)
    expect(Math.min(...temps)).toBeCloseTo(row!.stats.min, 4)
    expect(temps.reduce((a, b) => a + b, 0) / temps.length).toBeCloseTo(row!.stats.avg, 4)
  })

  it('з параметрами об’єкта поверх параметрів кадру', () => {
    const own = lineProfile(ir, { ...line, overrides: { emissivity: 0.5 } }, { reflectedTemp: 10 })
    const model = temperatureModel(ir, { reflectedTemp: 10, emissivity: 0.5 })
    expect(own[3]!.t).toBeCloseTo(model.toCelsius(ir.ad[own[3]!.y * ir.width + own[3]!.x]!), 4)
  })

  it('CSV: №, x, y, T в одиницях показу', () => {
    const points = [
      { x: 1, y: 2, t: 25.04 },
      { x: 2, y: 2, t: NaN },
    ]
    expect(profileCsv(points, 'uk', 'C', t)).toBe('﻿№;x;y;T, °C\r\n1;1;2;25,0\r\n2;2;2;\r\n')
    expect(profileCsv(points.slice(0, 1), 'en', 'F', t)).toContain('1;1;2;77.1\r\n')
  })
})

describe('поділки осі', () => {
  it('круглий крок 1 / 2 / 5', () => {
    expect(niceTicks(0, 10, 5)).toEqual([0, 2, 4, 6, 8, 10])
    expect(niceTicks(25.3, 34.8, 5)).toEqual([26, 28, 30, 32, 34])
    expect(niceTicks(0.1, 0.4, 3)).toEqual([0.1, 0.2, 0.3, 0.4])
    expect(niceTicks(-3, 3, 4)).toEqual([-2, 0, 2])
    expect(niceTicks(5, 5)).toEqual([5])
    expect(niceTicks(NaN, 1)).toEqual([])
  })

  it('знаки після коми — за кроком', () => {
    expect(tickDigits([0, 2, 4])).toBe(0)
    expect(tickDigits([0.5, 1, 1.5])).toBe(1)
    expect(tickDigits([0.1, 0.2])).toBe(1)
    expect(tickDigits([0.05, 0.1])).toBe(2)
  })
})

describe('стан ізотерм', () => {
  it('за замовчуванням вимкнені, від шкали: 1 — вище верхньої чверті, 2 — нижче нижньої; кольори оригіналу', () => {
    const [a, b] = defaultIsotherms({ min: 20, max: 40 })
    expect(a).toMatchObject({ enabled: false, mode: 'above', from: 35, color: '#008000' })
    expect(b).toMatchObject({ enabled: false, mode: 'below', to: 25, color: '#0000ff' })
  })

  it('колір і смуга на шкалі', () => {
    expect(hexToRgb('#1f6FEB')).toEqual([31, 111, 235])
    const iso: IsothermState = { enabled: true, mode: 'between', from: 25, to: 30, color: '#000000' }
    expect(isothermBand(iso, { min: 20, max: 40 })).toEqual({ lo: 0.25, hi: 0.5 })
    expect(isothermBand({ ...iso, mode: 'above' }, { min: 20, max: 40 })).toEqual({ lo: 0.25, hi: 1 })
    expect(isothermBand({ ...iso, mode: 'below', to: 10 }, { min: 20, max: 40 })).toBeNull()
  })
})

describe('компоненти аналізу (смоук)', () => {
  it('графік профілю: назва, кількість точок, CSV', () => {
    const { body } = render(ProfileChart, {
      props: {
        name: 'L1',
        points: lineProfile(ir, line),
        hoverIndex: null,
        onhover: () => {},
        onexport: () => {},
      },
    })
    expect(body).toContain('Профіль L1')
    expect(body).toContain('71 точок')
    expect(body).toContain('Зберегти профіль CSV')
    expect(body).toMatch(/<path class="line[^"]*" d="M[\d.]+ [\d.]+ L/)
  })

  it('графік профілю: значення під курсором у вибраних одиницях', () => {
    units.set({ temperature: 'K', length: 'm' })
    try {
      const points = [
        { x: 3, y: 4, t: 20 },
        { x: 4, y: 4, t: 21 },
      ]
      const { body } = render(ProfileChart, {
        props: { name: 'L2', points, hoverIndex: 1, onhover: () => {}, onexport: () => {} },
      })
      expect(body).toContain('№ 2 (4, 4)')
      expect(body).toContain('294,2 K')
    } finally {
      units.set({ temperature: 'C', length: 'm' })
    }
  })

  it('панель ізотерми: режим, межі, частка кадру, попередження', () => {
    const value: IsothermState = { enabled: true, mode: 'between', from: 25, to: 30, color: '#008000' }
    const { body } = render(IsothermPanel, { props: { index: 1, value, onchange: () => {}, share: 0.123 } })
    expect(body).toContain('Ізотерма 1')
    expect(body).toContain('Між межами')
    expect(body).toContain('Від, °C')
    expect(body).toContain('value="25"')
    expect(body).toContain('Частка кадру: 12,3 %')
    const bad = render(IsothermPanel, {
      props: { index: 2, value: { ...value, from: 31 }, onchange: () => {}, share: 0 },
    }).body
    expect(bad).toContain('Нижня межа має бути меншою')
  })

  it('гістограма: стовпці кольорами палітри і смуги ізотерм', () => {
    const bins = new Uint32Array(256)
    bins[0] = 1000
    bins[100] = 10
    bins[200] = 5
    const { body } = render(Histogram, {
      props: {
        bins,
        rgb: palette('grey'),
        bands: [{ lo: 0.5, hi: 1, color: '#008000' }],
        minLabel: '20,0 °C',
        maxLabel: '40,0 °C',
      },
    })
    // Крайній стовпець обрізано верхом, внутрішні — відносно найвищого внутрішнього
    expect(body).toMatch(/<rect x="0" y="0" width="1" height="100"/)
    expect(body).toMatch(/<rect x="200" y="50" width="1" height="50"/)
    expect(body).toContain('fill="#008000"')
    expect(body).toContain('40,0 °C')
  })
})
