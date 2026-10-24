<script lang="ts">
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import * as Table from '$lib/components/ui/table'
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
    /** Зміна примітки об'єкта (клітинка «Примітка» — поле введення). */
    onnote: (id: number, note: string) => void
    onexport: () => void
  }

  let { results, selectedId, onselect, onnote, onexport }: Props = $props()

  const tUnit = $derived(TEMPERATURE_SYMBOL[$units.temperature])
  const fmt = (c: number) => formatTemperature(c, $locale, $units.temperature)
</script>

<section class="results">
  <div class="head">
    <h2>{$t('results.title')}</h2>
    <!-- Примітка — у рядку заголовка, щоб її поява не змінювала висоту блоку -->
    {#if results.some((r) => r.status !== 'ok')}
      <span class="note" title={$t('results.flagNote')}>{$t('results.flagNote')}</span>
    {:else}
      <span class="note"></span>
    {/if}
    <Button variant="outline" class="shrink-0" disabled={results.length === 0} onclick={onexport}
      >{$t('results.export')}</Button
    >
  </div>
  <!-- Висоту задає нижня смуга (межу тягнуть); далі — прокрутка: додавання об'єктів не зсуває решту інтерфейсу -->
  <div class="table-wrap">
    <Table.Root>
      <Table.Header>
        <Table.Row>
          <Table.Head>{$t('results.object')}</Table.Head>
          <Table.Head class="text-end">{$t('results.value')}</Table.Head>
          <Table.Head class="text-end">{$t('results.max')}</Table.Head>
          <Table.Head class="text-end">{$t('results.min')}</Table.Head>
          <Table.Head class="text-end">{$t('results.emissivity')}</Table.Head>
          <Table.Head class="text-end">{$t('results.reflectedTemp')}, {tUnit}</Table.Head>
          <Table.Head class="text-end">{$t('results.airTemp')}, {tUnit}</Table.Head>
          <Table.Head class="text-end">{$t('results.humidity')}, %</Table.Head>
          <Table.Head class="text-end"
            >{$t('results.distance')}, {LENGTH_SYMBOL[$units.length][$locale]}</Table.Head
          >
          <Table.Head class="note-col">{$t('results.note')}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {#each results as r (r.object.id)}
          {@const point = r.object.shape.kind === 'point'}
          {@const reason =
            r.status === 'ok'
              ? undefined
              : $t(r.status === 'out-of-range' ? 'cursor.outOfRange' : 'cursor.noCalibration')}
          <!-- Клік по рядку — для миші; з клавіатури вибір — кнопкою з назвою об'єкта -->
          <Table.Row
            class="group/row cursor-pointer"
            data-state={r.object.id === selectedId ? 'selected' : undefined}
            onclick={() => onselect(r.object.id)}
          >
            <Table.Head scope="row" class="h-auto">
              <button type="button" class="name" aria-pressed={r.object.id === selectedId}
                >{r.object.name}</button
              >
              {#if r.ownParams}<span class="own" title={$t('results.ownParams')}>*</span>{/if}
            </Table.Head>
            <Table.Cell class={['text-end', reason && 'flag']} title={reason}>{fmt(r.value)}</Table.Cell>
            <Table.Cell class={['text-end', reason && !point && 'flag']} title={point ? undefined : reason}>
              {point ? '' : fmt(r.stats.max)}
            </Table.Cell>
            <Table.Cell class={['text-end', reason && !point && 'flag']} title={point ? undefined : reason}>
              {point ? '' : fmt(r.stats.min)}
            </Table.Cell>
            {#each PARAM_FIELDS as k (k)}
              <Table.Cell class="text-end"
                >{formatNumber(displayValue(k, r.params[k], $units), $locale, paramDigits(k))}</Table.Cell
              >
            {/each}
            <Table.Cell class="note-col py-0">
              <!-- Поле «вбудоване» в рядок: рамка й підказка — лише при наведенні на рядок або у фокусі -->
              <Input
                class="h-7 truncate border-transparent bg-transparent shadow-none group-hover/row:border-input group-hover/row:bg-background placeholder:opacity-0 group-hover/row:placeholder:opacity-100 focus-visible:placeholder:opacity-100 dark:bg-transparent"
                type="text"
                maxlength={200}
                value={r.object.note ?? ''}
                title={r.object.note || undefined}
                placeholder={$t('objectNote.hint')}
                aria-label="{$t('objectNote.title')} {r.object.name}"
                oninput={(e) => onnote(r.object.id, e.currentTarget.value)}
              />
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
    {#if results.length === 0}
      <p class="muted empty">{$t('results.empty')}</p>
    {/if}
  </div>
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
    gap: 8px;
    margin-bottom: 6px;
  }
  h2 {
    flex-shrink: 0;
    white-space: nowrap;
  }
  h2 {
    margin: 0;
    font-size: 0.744rem;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  p {
    margin: 2px 0;
    font-size: 0.744rem;
  }
  .note {
    flex: 1;
    min-width: 0;
    font-size: 0.744rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .muted,
  .note {
    color: var(--muted);
  }
  .table-wrap {
    --row: 40px;
    position: relative;
    box-sizing: content-box;
    flex: 1 1 0;
    min-height: var(--row);
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
  /* Таблиця — shadcn Table; прокрутка (і липкий заголовок) — у .table-wrap, а не в контейнері таблиці */
  .table-wrap :global([data-slot='table-container']) {
    overflow: visible;
  }
  .table-wrap :global([data-slot='table']) {
    font-variant-numeric: tabular-nums;
  }
  .table-wrap :global([data-slot='table-header'] [data-slot='table-head']) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--surface);
    box-shadow: inset 0 -1px 0 var(--border);
  }
  .table-wrap :global(.flag) {
    color: var(--warn);
    font-weight: 600;
  }
  .name {
    font-weight: 600;
  }
  .results :global(.note-col) {
    min-width: 180px;
  }
  .own {
    color: var(--accent);
  }
</style>
