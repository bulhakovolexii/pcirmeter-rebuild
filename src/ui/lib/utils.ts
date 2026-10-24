// Помічники компонентів shadcn-svelte (src/ui/lib/components/ui)
import { clsx, type ClassValue } from 'clsx'

/** Склеює класи. Без tailwind-merge (≈ 9 КБ gzip): конфліктні утиліти не перекриваються — вигляд
 *  змінюють варіантами компонентів (`variant`, `size`), а не класами з однаковою властивістю. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null }
