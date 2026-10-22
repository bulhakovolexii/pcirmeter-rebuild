import { derived, writable } from 'svelte/store'
import { en } from './en'
import { uk, type MessageKey } from './uk'

export type Locale = 'uk' | 'en'

const messages: Record<Locale, Record<MessageKey, string>> = { uk, en }

export const locale = writable<Locale>('uk')

/** Реактивна функція перекладу: у шаблоні Svelte — `{$tr('app.title')}`. */
export const tr = derived(locale, ($locale) => (key: MessageKey) => messages[$locale][key])
