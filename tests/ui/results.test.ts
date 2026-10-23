import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { render } from 'svelte/server'
import { describe, expect, it } from 'vitest'
import { parseThermogram } from '../../src/core/parser'
import { frameTemperatures, temperatureModel } from '../../src/core/temperature'
import { uk } from '../../src/i18n/uk'
import { measureObjects, resultsCsv, rowNote, shapeCoords } from '../../src/ui/results'
import ResultsTable from '../../src/ui/ResultsTable.svelte'
import type { MeasureObject } from '../../src/ui/tools'

const sample = join(import.meta.dirname, '..', '..', 'samples', 'legacy-2013', '130604_0002T.jpg')
const ir = parseThermogram(new Uint8Array(readFileSync(sample))).ir
const t = (key: keyof typeof uk) => uk[key]

// Положення з частини Б (tests/golden/objects.json, F5): P1 = 34,6 °C, R1 = 29,7 / 34,5 / 26,7 °C
const objects: MeasureObject[] = [
  { id: 1, name: 'P1', shape: { kind: 'point', x: 48, y: 97 }, overrides: {} },
  { id: 2, name: 'R1', shape: { kind: 'rect', x0: 2, y0: 0, x1: 87, y1: 63 }, overrides: {} },
  { id: 3, name: 'P2', shape: { kind: 'point', x: 48, y: 97 }, overrides: { emissivity: 0.5 } },
]

describe('measureObjects', () => {
  const rows = measureObjects(ir, objects)

  it('точка й прямокутник — як в оригіналі', () => {
    expect(rows[0]!.value).toBeCloseTo(34.6, 1)
    expect(rows[1]!.value).toBeCloseTo(29.7, 1)
    expect(rows[1]!.stats.max).toBeCloseTo(34.5, 1)
    expect(rows[1]!.stats.min).toBeCloseTo(26.7, 1)
    expect(rows[1]!.stats.count).toBe(86 * 64)
    expect(rows.map((r) => r.status)).toEqual(['ok', 'ok', 'ok'])
  })

  it('власні параметри об’єкта — поверх параметрів кадру', () => {
    expect(rows[2]!.ownParams).toBe(true)
    expect(rows[2]!.params.emissivity).toBe(0.5)
    const expected = temperatureModel(ir, { emissivity: 0.5 }).toCelsius(ir.ad[97 * ir.width + 48]!)
    expect(rows[2]!.value).toBeCloseTo(expected, 4)
    // Зміна параметрів кадру діє на об'єкти без власних значень
    const warm = measureObjects(ir, objects, { reflectedTemp: 40, emissivity: 0.9 })
    expect(warm[0]!.params.reflectedTemp).toBe(40)
    expect(warm[2]!.params).toMatchObject({ reflectedTemp: 40, emissivity: 0.5 })
    const frame = frameTemperatures(ir, temperatureModel(ir, { reflectedTemp: 40, emissivity: 0.9 }))
    expect(warm[0]!.value).toBe(frame[97 * ir.width + 48])
  })

  it('позначка «поза діапазоном камери»', () => {
    // При ε = 0,1 і холодному відбитому фоні гарячі пікселі виходять за 150 °C
    const hot = measureObjects(ir, [{ ...objects[1]!, overrides: { emissivity: 0.1, reflectedTemp: -100 } }])
    expect(hot[0]!.stats.max).toBeGreaterThan(150)
    expect(hot[0]!.status).toBe('out-of-range')
  })
})

describe('resultsCsv', () => {
  const rows = measureObjects(ir, objects)

  it('UTF-8 BOM, «;», кома для uk, CRLF', () => {
    const csv = resultsCsv(rows, 'uk', { temperature: 'C', length: 'm' }, t)
    expect(csv.startsWith('﻿')).toBe(true)
    const lines = csv.slice(1).split('\r\n')
    expect(lines).toHaveLength(5)
    expect(lines.at(-1)).toBe('')
    expect(lines[0]).toBe(
      "Об'єкт;T / сер., °C;Max, °C;Min, °C;ε;T відб., °C;T пов., °C;RH, %;d, м;Координати (пікселі);Пікселів;Примітка",
    )
    expect(lines[1]).toBe('P1;34,6;;;0,95;25,0;25,0;60;5,0;48, 97;1;')
    expect(lines[2]).toBe('R1;29,7;34,5;26,7;0,95;25,0;25,0;60;5,0;2, 0 – 87, 63;5504;')
    expect(lines[3]!.split(';')[4]).toBe('0,50')
  })

  it('одиниці показу й крапка для en', () => {
    const csv = resultsCsv(rows, 'en', { temperature: 'F', length: 'ft' }, t)
    const [header, p1] = csv.slice(1).split('\r\n')
    expect(header).toContain('Max, °F')
    expect(header).toContain('d, ft')
    // 34,6 °C = 94,3 °F; 25 °C = 77 °F; 5 м = 16,4 фут
    expect(p1).toMatch(/^P1;94\.\d;;;0\.95;77\.0;77\.0;60;16\.4;/)
  })

  it('координати', () => {
    expect(shapeCoords({ kind: 'line', x0: 1, y0: 2, x1: 3, y1: 4 })).toBe('1, 2 – 3, 4')
  })
})

describe('ResultsTable', () => {
  it('порожня таблиця — підказка', () => {
    const { body } = render(ResultsTable, {
      props: { results: [], selectedId: null, onselect: () => {}, onexport: () => {} },
    })
    expect(body).toContain('Результати')
    expect(body).toContain('Додайте точку')
    // Таблиця зі сталою висотою рендериться й порожньою — поява першого об'єкта не зсуває інтерфейс
    expect(body).toContain('<table')
    expect(body).toContain('--rows: 7')
  })

  it('рядки об’єктів з температурами й параметрами', () => {
    const results = measureObjects(ir, objects)
    const { body } = render(ResultsTable, {
      props: { results, selectedId: 2, onselect: () => {}, onexport: () => {} },
    })
    expect(body).toContain('P1')
    expect(body).toContain('R1')
    expect(body).toContain('34,6 °C')
    expect(body).toContain('29,7 °C')
    expect(body).toContain('26,7 °C')
    expect(body).toContain('0,50')
    expect(body).toContain('власні параметри')
    expect(body).toMatch(/<tr class="[^"]*selected/)
  })

  it('колонка «Примітка» з текстом користувача', () => {
    const results = measureObjects(ir, [{ ...objects[0]!, note: 'кут укосу' }])
    const { body } = render(ResultsTable, {
      props: { results, selectedId: null, onselect: () => {}, onexport: () => {} },
    })
    expect(body).toContain('Примітка')
    expect(body).toMatch(/title="кут укосу"[^>]*>кут укосу</)
  })
})

describe('rowNote', () => {
  it('текст користувача й причина позначки', () => {
    const [row] = measureObjects(ir, [{ ...objects[0]!, note: '  кут укосу ' }])
    expect(rowNote(row!, t)).toBe('кут укосу')
    expect(rowNote({ ...row!, status: 'out-of-range' }, t)).toBe('кут укосу; поза діапазоном камери')
    expect(rowNote({ ...row!, object: { ...row!.object, note: '' }, status: 'no-calibration' }, t)).toBe(
      'поза калібруванням',
    )
    expect(rowNote({ ...row!, object: { ...row!.object, note: undefined } }, t)).toBe('')
  })
})
