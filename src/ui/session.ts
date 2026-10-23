/**
 * Відкриті файли переживають перезавантаження вкладки браузера: байти зберігаються в IndexedDB під ідентифікатором
 * сеансу вкладки (він — у `sessionStorage`), запис зникає, коли файл закривають. Файли не вміщаються в
 * `sessionStorage` (~5 МБ, лише рядки), тому там тільки ідентифікатор.
 *
 * Кожна вкладка тримає Web Lock свого сеансу до закриття. Сеанси без утримуваного замка — від закритих вкладок
 * браузера — видаляються під час запуску. Дубльована вкладка (копія `sessionStorage`) бачить замок зайнятим і
 * переносить файли в новий сеанс, щоб закриття файлу в одній вкладці не зачіпало іншу.
 *
 * Демо-сторінка (`demo.ts`) має окремий сеанс у тій самій вкладці: її зразки не з'являються в звичайному режимі,
 * а файли звичайного режиму не губляться після переходу в демо й назад. Тому прибирання не чіпає сеанси, на які
 * посилається `sessionStorage` цієї вкладки (будь-якого режиму).
 *
 * Розмітка файлу (параметри кадру, об'єкти) — в окремому сховищі: вона змінюється часто (перетягування), а байти
 * файлу переписувати щоразу не варто. Запис відкладається на `MARKUP_DELAY` мс після останньої зміни.
 */

import { planSync, type FileMarkup, type OpenedFile, type StoredFile } from './files'

const DB_NAME = 'pcirmeter-session'
const STORE = 'files'
const MARKUP = 'markup'
const STORES = [STORE, MARKUP]
const MARKUP_DELAY = 300
const KEY_PREFIX = 'pcirmeter.'
const SESSION_KEY = 'session'
const ACTIVE_KEY = 'activeFile'

export type SessionMode = 'main' | 'demo'

/** Ключ `sessionStorage` режиму: `pcirmeter.session` (звичайний), `pcirmeter.demo.session`. */
const keyOf = (mode: SessionMode, name: string) => KEY_PREFIX + (mode === 'main' ? '' : mode + '.') + name
const LOCK_PREFIX = 'pcirmeter-session:'

interface Row {
  session: string
  id: number
  name: string
  bytes: Uint8Array
}

interface MarkupRow {
  session: string
  id: number
  markup: FileMarkup
}

const done = (r: IDBRequest | IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    if (r instanceof IDBTransaction) {
      r.oncomplete = () => resolve()
      r.onerror = r.onabort = () => reject(r.error ?? new Error('IndexedDB transaction aborted'))
    } else {
      r.onsuccess = () => resolve()
      r.onerror = () => reject(r.error)
    }
  })

function openDb(): Promise<IDBDatabase> {
  const req = indexedDB.open(DB_NAME, 2)
  req.onupgradeneeded = () => {
    for (const name of STORES) {
      if (!req.result.objectStoreNames.contains(name)) {
        req.result.createObjectStore(name, { keyPath: ['session', 'id'] }).createIndex('session', 'session')
      }
    }
  }
  return done(req).then(() => req.result)
}

async function rowsOf<T>(db: IDBDatabase, store: string, session: string): Promise<T[]> {
  const req = db.transaction(store).objectStore(store).index('session').getAll(session)
  await done(req)
  return req.result as T[]
}

/** Тримає замок до закриття вкладки; `false` — його вже тримає інша вкладка. */
function holdLock(session: string): Promise<boolean> {
  return new Promise((resolve) => {
    void navigator.locks.request(LOCK_PREFIX + session, { ifAvailable: true }, (lock) => {
      resolve(lock !== null)
      return lock ? new Promise<never>(() => {}) : undefined
    })
  })
}

function storage(): Storage | undefined {
  try {
    return globalThis.sessionStorage
  } catch {
    return undefined
  }
}

export interface TabSession {
  /** Файли, відкриті в цій вкладці до перезавантаження. */
  files: StoredFile[]
  /** Активна вкладка файлу до перезавантаження. */
  activeId: number | null
  /** Привести збережене до відкритих файлів. */
  sync(files: readonly OpenedFile[], activeId: number | null): void
  /** Зберегти розмітку відкритого файлу (із затримкою). */
  saveMarkup(id: number, markup: FileMarkup): void
}

/** Сеанс вкладки; `null`, якщо сховища недоступні (Node, приватний режим, заборона) — тоді нічого не зберігається. */
export async function openTabSession(mode: SessionMode = 'main'): Promise<TabSession | null> {
  const ss = storage()
  if (!ss || typeof indexedDB === 'undefined' || !('locks' in navigator)) return null
  try {
    const db = await openDb()
    const previous = ss.getItem(keyOf(mode, SESSION_KEY))
    let session = previous ?? crypto.randomUUID()
    let rows = previous ? await rowsOf<Row>(db, STORE, previous) : []
    let markups = previous ? await rowsOf<MarkupRow>(db, MARKUP, previous) : []
    if (!(await holdLock(session))) {
      // Дубльована вкладка (або попередня сторінка ще не відпустила замок) — копія файлів у новий сеанс
      session = crypto.randomUUID()
      await holdLock(session)
      rows = rows.map((r) => ({ ...r, session }))
      markups = markups.map((r) => ({ ...r, session }))
      const tx = db.transaction(STORES, 'readwrite')
      for (const r of rows) tx.objectStore(STORE).put(r)
      for (const r of markups) tx.objectStore(MARKUP).put(r)
      await done(tx)
    }
    ss.setItem(keyOf(mode, SESSION_KEY), session)
    await dropOrphans(db, tabSessions(ss))

    const saved = new Set(rows.map((r) => r.id))
    const active = Number(ss.getItem(keyOf(mode, ACTIVE_KEY)))
    const markupOf = new Map(markups.map((r) => [r.id, r.markup]))
    let queue = Promise.resolve()
    /** Записи по черзі: кожна зміна — окрема транзакція; переповнення сховища — запис просто не збережеться. */
    const write = (stores: string[], fill: (tx: IDBTransaction) => void) => {
      queue = queue
        .then(() => {
          const tx = db.transaction(stores, 'readwrite')
          fill(tx)
          return done(tx)
        })
        .catch((e: unknown) => console.warn('Сеанс вкладки не збережено:', e))
    }
    const pending = new Map<number, ReturnType<typeof setTimeout>>()
    return {
      files: rows.map(({ id, name, bytes }) => {
        const markup = markupOf.get(id)
        return markup ? { id, name, bytes, markup } : { id, name, bytes }
      }),
      activeId: saved.has(active) ? active : null,
      sync(files, activeId) {
        ss.setItem(keyOf(mode, ACTIVE_KEY), String(activeId ?? ''))
        const { add, remove } = planSync(saved, files)
        if (add.length === 0 && remove.length === 0) return
        for (const id of add) saved.add(id)
        for (const id of remove) {
          saved.delete(id)
          clearTimeout(pending.get(id))
          pending.delete(id)
        }
        const rows = files
          .filter((f) => add.includes(f.id))
          .map((f): Row => ({ session, id: f.id, name: f.name, bytes: f.bytes }))
        write(STORES, (tx) => {
          for (const id of remove) {
            tx.objectStore(STORE).delete([session, id])
            tx.objectStore(MARKUP).delete([session, id])
          }
          for (const r of rows) tx.objectStore(STORE).put(r)
        })
      },
      saveMarkup(id, markup) {
        clearTimeout(pending.get(id))
        pending.set(
          id,
          setTimeout(() => {
            pending.delete(id)
            // Файл тим часом закрили — розмітка вже не потрібна
            if (!saved.has(id)) return
            const row: MarkupRow = { session, id, markup }
            write([MARKUP], (tx) => tx.objectStore(MARKUP).put(row))
          }, MARKUP_DELAY),
        )
      },
    }
  } catch (e) {
    console.warn('Сеанс вкладки недоступний:', e)
    return null
  }
}

/** Сеанси всіх режимів, на які посилається ця вкладка. */
function tabSessions(ss: Storage): Set<string> {
  const ids = new Set<string>()
  for (let i = 0; i < ss.length; i++) {
    const key = ss.key(i)
    if (key?.startsWith(KEY_PREFIX) && key.endsWith('.' + SESSION_KEY)) ids.add(ss.getItem(key)!)
  }
  return ids
}

/** Видаляє файли й розмітку сеансів, чий замок ніхто не тримає і які не належать цій вкладці (вкладки закрито). */
async function dropOrphans(db: IDBDatabase, own: Set<string>) {
  const held = new Set((await navigator.locks.query()).held?.map((l) => l.name) ?? [])
  const tx = db.transaction(STORES, 'readwrite')
  for (const store of STORES) {
    const req = tx.objectStore(store).index('session').openKeyCursor(null, 'nextunique')
    req.onsuccess = () => {
      const cursor = req.result
      if (!cursor) return
      const session = cursor.key as string
      if (!own.has(session) && !held.has(LOCK_PREFIX + session)) {
        tx.objectStore(store).delete(IDBKeyRange.bound([session, -Infinity], [session, Infinity]))
      }
      cursor.continue()
    }
  }
  await done(tx)
}
