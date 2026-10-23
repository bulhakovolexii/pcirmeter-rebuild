<script lang="ts">
  import { untrack } from 'svelte'
  import { PARAM_LIMITS, type EditableParam, type ObjectParams } from '../core/temperature'
  import { locale, tr } from '../i18n'
  import { formatNumber, LENGTH_SYMBOL, TEMPERATURE_SYMBOL } from './format'
  import {
    displayLimits,
    displayValue,
    isChanged,
    PARAM_FIELDS,
    paramDigits,
    paramsForm,
    paramStep,
    parseParam,
    type Units,
  } from './params'
  import { units } from './settings'

  interface Props {
    title: string
    /** Значення, коли поле не змінено (параметри з файлу або параметри кадру для об'єкта). */
    base: ObjectParams
    /** Змінені користувачем параметри (поверх `base`). */
    overrides: Partial<ObjectParams>
    onchange: (overrides: Partial<ObjectParams>) => void
    /** Підпис значення `base` біля зміненого поля. */
    baseLabel: string
    resetLabel: string
    /** Пропускання атмосфери для поточних параметрів. */
    tau: number
  }

  let { title, base, overrides, onchange, baseLabel, resetLabel, tau }: Props = $props()

  const params = $derived({ ...base, ...overrides })
  const changed = $derived(PARAM_FIELDS.some((k) => isChanged(k, params[k], base[k], $units)))

  /** Значення полів в одиницях показу; модель змінюється лише при введенні, не при зміні одиниць. */
  let input = $state<Record<EditableParam, number | null>>(untrack(() => paramsForm(params, $units)))

  // Поле, введене значення якого вже не відповідає моделі (змінились одиниці або `base`), — перезаписати.
  // Поля з коректним введенням не чіпаємо, щоб не заважати набору (наприклад, «25,0» → «25»).
  $effect(() => {
    const u = $units
    const p = params
    untrack(() => {
      for (const key of PARAM_FIELDS) {
        const typed = parseParam(key, input[key], u)
        if (typed !== null && isChanged(key, typed, p[key], u)) input[key] = displayValue(key, p[key], u)
      }
    })
  })

  function setParam(key: EditableParam, value: number) {
    const parsed = parseParam(key, value, $units)
    if (parsed !== null) onchange({ ...overrides, [key]: parsed })
  }

  function reset() {
    onchange({})
    input = paramsForm(base, $units)
  }

  function unitOf(key: EditableParam, u: Units): string {
    switch (key) {
      case 'emissivity':
        return ''
      case 'humidity':
        return '%'
      case 'distance':
        return LENGTH_SYMBOL[u.length][$locale]
      default:
        return TEMPERATURE_SYMBOL[u.temperature]
    }
  }
</script>

<fieldset class="params">
  <legend>{title}</legend>
  {#each PARAM_FIELDS as key (key)}
    {@const unit = unitOf(key, $units)}
    {@const invalid = parseParam(key, input[key], $units) === null}
    {@const fieldChanged = isChanged(key, params[key], base[key], $units)}
    {@const show = (v: number) =>
      `${formatNumber(displayValue(key, v, $units), $locale, paramDigits(key))}${unit ? ` ${unit}` : ''}`}
    <label class="field" class:changed={fieldChanged}>
      <span>{$tr(`params.${key}`)}{unit ? `, ${unit}` : ''}</span>
      <input
        type="number"
        min={displayLimits(key, $units).min}
        max={displayLimits(key, $units).max}
        step={paramStep(key)}
        aria-invalid={invalid}
        bind:value={input[key]}
        oninput={(e) => setParam(key, e.currentTarget.valueAsNumber)}
      />
    </label>
    {#if invalid}
      <p class="warning" role="alert">
        {$tr('params.allowed')}: {show(PARAM_LIMITS[key].min)} … {show(PARAM_LIMITS[key].max)}
      </p>
    {:else if fieldChanged}
      <p class="note">{baseLabel}: {show(base[key])}</p>
    {/if}
  {/each}
  <p class="note">{$tr('params.tau')} = {formatNumber(tau, $locale, 3)}</p>
  <button type="button" disabled={!changed} onclick={reset}>{resetLabel}</button>
</fieldset>

<style>
  fieldset {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    padding: 8px 10px 10px;
    margin: 0;
  }
  legend {
    font-size: 0.9rem;
    font-weight: 600;
    padding: 0 4px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.9rem;
  }
  input {
    width: 100%;
    box-sizing: border-box;
  }
  .changed span {
    font-weight: 600;
  }
  .changed input {
    border-color: var(--accent);
  }
  .warning,
  .note {
    margin: -2px 0 2px;
    font-size: 0.8rem;
  }
  .warning {
    color: var(--warn);
  }
  .note {
    color: var(--muted);
  }
  button {
    align-self: flex-start;
  }
</style>
