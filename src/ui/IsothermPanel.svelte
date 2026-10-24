<script lang="ts">
  import { untrack } from 'svelte'
  import { isValidIsotherm } from '../core/isotherms'
  import { fromCelsius, toCelsius } from '../core/units'
  import { locale, tr } from '../i18n'
  import { formatShare, TEMPERATURE_SYMBOL } from './format'
  import { ISOTHERM_MODES, toIsotherm, type IsothermState } from './isotherms'
  import { units } from './settings'

  interface Props {
    /** Номер ізотерми (1, 2). */
    index: number
    value: IsothermState
    onchange: (value: IsothermState) => void
    /** Частка пікселів кадру в межах ізотерми (0…1). */
    share: number | null
  }

  let { index, value, onchange, share }: Props = $props()

  const show = (c: number) => Math.round(fromCelsius(c, $units.temperature) * 10) / 10

  /** Межі в одиницях показу; модель змінюється лише при введенні (як у ручній шкалі). */
  let input = $state(untrack(() => ({ from: show(value.from), to: show(value.to) })))

  // Перезаписати поле, лише якщо введене вже не відповідає значенню (зміна одиниць тощо)
  $effect(() => {
    const u = $units.temperature
    const v = { from: value.from, to: value.to }
    untrack(() => {
      for (const key of ['from', 'to'] as const) {
        const typed = input[key]
        if (typed === null || !Number.isFinite(typed) || Math.abs(toCelsius(typed, u) - v[key]) > 1e-6) {
          input[key] = Math.round(fromCelsius(v[key], u) * 10) / 10
        }
      }
    })
  })

  function setLimit(key: 'from' | 'to', typed: number) {
    if (Number.isFinite(typed)) onchange({ ...value, [key]: toCelsius(typed, $units.temperature) })
  }

  const valid = $derived(isValidIsotherm(toIsotherm(value)))
  const unit = $derived(TEMPERATURE_SYMBOL[$units.temperature])
</script>

<div class="isotherm">
  <div class="row">
    <label class="check">
      <input
        type="checkbox"
        checked={value.enabled}
        onchange={(e) => onchange({ ...value, enabled: e.currentTarget.checked })}
      />
      {`${$tr('isotherm.title')} ${index}`}
    </label>
    <input
      type="color"
      value={value.color}
      title={$tr('isotherm.color')}
      aria-label="{$tr('isotherm.color')} {index}"
      oninput={(e) => onchange({ ...value, color: e.currentTarget.value })}
    />
  </div>
  {#if value.enabled}
    <select
      aria-label="{$tr('isotherm.mode')} {index}"
      value={value.mode}
      onchange={(e) => onchange({ ...value, mode: e.currentTarget.value as IsothermState['mode'] })}
    >
      {#each ISOTHERM_MODES as m (m)}
        <option value={m}>{$tr(`isotherm.${m}`)}</option>
      {/each}
    </select>
    <div class="limits">
      {#if value.mode !== 'below'}
        <label class="field">
          <span>{$tr(value.mode === 'between' ? 'isotherm.from' : 'isotherm.threshold')}, {unit}</span>
          <input
            type="number"
            step="0.1"
            bind:value={input.from}
            oninput={(e) => setLimit('from', e.currentTarget.valueAsNumber)}
          />
        </label>
      {/if}
      {#if value.mode !== 'above'}
        <label class="field">
          <span>{$tr(value.mode === 'between' ? 'isotherm.to' : 'isotherm.threshold')}, {unit}</span>
          <input
            type="number"
            step="0.1"
            bind:value={input.to}
            oninput={(e) => setLimit('to', e.currentTarget.valueAsNumber)}
          />
        </label>
      {/if}
    </div>
    {#if !valid}
      <p class="warning" role="alert">{$tr('isotherm.invalid')}</p>
    {:else if share !== null}
      <p class="muted">{$tr('isotherm.share')}: {formatShare(share, $locale)}</p>
    {/if}
  {/if}
</div>

<style>
  .isotherm {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .check {
    display: flex;
    gap: 6px;
    align-items: center;
    font-size: 0.9rem;
  }
  input[type='color'] {
    width: 32px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: none;
  }
  .limits {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .limits input {
    width: 100%;
    box-sizing: border-box;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.85rem;
  }
  p {
    margin: 0;
    font-size: 0.85rem;
  }
  .muted {
    color: var(--muted);
  }
  .warning {
    color: var(--warn);
  }
</style>
