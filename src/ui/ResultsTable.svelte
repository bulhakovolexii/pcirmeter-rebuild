<script lang="ts">
  // Store перекладу імпортовано як `t`: ім'я `tr` у шаблоні з <tr> Svelte сприймає як компонент
  import { locale, tr as t } from '../i18n'
  import { formatNumber, formatTemperature, LENGTH_SYMBOL, TEMPERATURE_SYMBOL } from './format'
  import { displayValue, PARAM_FIELDS, paramDigits } from './params'
  import type { ResultRow } from './results'
  import { units } from './settings'

  interface Props {
    results: readonly ResultRow[]
    selectedId: number | null
    onselect: (id: number) => void
    onexport: () => void
  }

  let { results, selectedId, onselect, onexport }: Props = $props()

  /** Видимих рядків таблиці. */
  const ROWS = 7

  const tUnit = $derived(TEMPERATURE_SYMBOL[$units.temperature])
  const fmt = (c: number) => formatTemperature(c, $locale, $units.temperature)
</script>

<section class="results">
  <div class="head">
    <h2>{$t('results.title')}</h2>
    <button type="button" disabled={results.length === 0} onclick={onexport}>{$t('results.export')}</button>
  </div>
  <!-- Висота стала — заголовок і 7 рядків (далі — прокрутка): додавання об'єктів не зсуває решту інтерфейсу -->
  <div class="table-wrap" style:--rows={ROWS}>
    <table>
      <thead>
        <tr>
          <th>{$t('results.object')}</th>
          <th>{$t('results.value')}</th>
          <th>{$t('results.max')}</th>
          <th>{$t('results.min')}</th>
          <th>{$t('results.emissivity')}</th>
          <th>{$t('results.reflectedTemp')}, {tUnit}</th>
          <th>{$t('results.airTemp')}, {tUnit}</th>
          <th>{$t('results.humidity')}, %</th>
          <th>{$t('results.distance')}, {LENGTH_SYMBOL[$units.length][$locale]}</th>
        </tr>
      </thead>
      <tbody>
        {#each results as r (r.object.id)}
          {@const point = r.object.shape.kind === 'point'}
          {@const reason =
            r.status === 'ok'
              ? undefined
              : $t(r.status === 'out-of-range' ? 'cursor.outOfRange' : 'cursor.noCalibration')}
          <!-- Клік по рядку — для миші; з клавіатури вибір — кнопкою з назвою об'єкта -->
          <tr class:selected={r.object.id === selectedId} onclick={() => onselect(r.object.id)}>
            <th scope="row">
              <button type="button" class="name" aria-pressed={r.object.id === selectedId}
                >{r.object.name}</button
              >
              {#if r.ownParams}<span class="own" title={$t('results.ownParams')}>*</span>{/if}
            </th>
            <td class:flag={reason} title={reason}>{fmt(r.value)}</td>
            <td class:flag={reason && !point} title={point ? undefined : reason}>
              {point ? '' : fmt(r.stats.max)}
            </td>
            <td class:flag={reason && !point} title={point ? undefined : reason}>
              {point ? '' : fmt(r.stats.min)}
            </td>
            {#each PARAM_FIELDS as k (k)}
              <td>{formatNumber(displayValue(k, r.params[k], $units), $locale, paramDigits(k))}</td>
            {/each}
          </tr>
        {/each}
      </tbody>
    </table>
    {#if results.length === 0}
      <p class="muted empty">{$t('results.empty')}</p>
    {/if}
  </div>
  <!-- Рядок примітки зарезервовано, щоб її поява не змінювала висоту -->
  <p class="note">{results.some((r) => r.status !== 'ok') ? $t('results.flagNote') : ''}</p>
</section>

<style>
  .results {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  h2 {
    margin: 0 0 4px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  p {
    margin: 2px 0;
    font-size: 0.85rem;
  }
  .note {
    min-height: 1lh;
  }
  .muted,
  .note {
    color: var(--muted);
  }
  .table-wrap {
    --row: 24px;
    position: relative;
    box-sizing: content-box;
    height: calc((var(--rows) + 1) * var(--row));
    flex-shrink: 0;
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }
  .empty {
    position: absolute;
    inset: var(--row) 0 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 0 12px;
    text-align: center;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
    font-variant-numeric: tabular-nums;
  }
  tr {
    height: var(--row);
  }
  th,
  td {
    box-sizing: border-box;
    padding: 0 8px;
    text-align: right;
    white-space: nowrap;
    border-bottom: 1px solid var(--border);
  }
  thead th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface-alt);
    color: var(--muted);
    font-weight: 600;
  }
  tbody th {
    text-align: left;
  }
  tbody tr {
    cursor: pointer;
  }
  tbody tr:hover {
    background: color-mix(in srgb, var(--accent) 8%, transparent);
  }
  tbody tr.selected {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .name {
    border: none;
    background: none;
    padding: 0;
    font-weight: 600;
  }
  td.flag {
    color: var(--warn);
    font-weight: 600;
  }
  .own {
    color: var(--accent);
  }
</style>
