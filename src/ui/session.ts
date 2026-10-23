/**
 * Відкриті файли переживають перезавантаження вкладки браузера: байти зберігаються в IndexedDB під ідентифікатором
 * сеансу вкладки (він — у `sessionStorage`), запис зникає, коли файл закривають. Файли не вміщаються в
 * `sessionStorage` (~5 МБ, лише рядки), тому там тільки ідентифікатор.
 *
 * Кожна вкладка тримає Web Lock свого сеансу до закриття. Сеанси без утримуваного замка — від закритих вкладок
 * браузера — видаляються під час запуску. Дубльована вкладка (копія `sessionStorage`) бачить замок зайнятим і
 * переносить файли в новий сеанс, щоб закриття файлу в одній вкладці не зачіпало іншу.
 */

import { planSync, type OpenedFile, type StoredFile } from './files'

const DB_NAME = 'pcirmeter-session'
const STORE = 'files'
const SESSION_KEY = 'pcirmeter.session'
const ACTIVE_KEY = 'pcirmeter.activeFile'
const LOCK_PREFIX = 'pcirmeter-session:'

interface Row extends StoredFile {
  session: string
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
  const req = indexedDB.open(DB_NAME, 1)
  req.onupgradeneeded = () => {
    req.result.createObjectStore(STORE, { keyPath: ['session', 'id'] }).createIndex('session', 'session')
  }
  return done(req).then(() => req.result)
}

async function rowsOf(db: IDBDatabase, session: string): Promise<Row[]> {
  const req = db.transaction(STORE).objectStore(STORE).index('session').getAll(session)
  await done(req)
  return req.result as Row[]
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
}

/** Сеанс вкладки; `null`, якщо сховища недоступні (Node, приватний режим, заборона) — тоді нічого не зберігається. */
export async function openTabSession(): Promise<TabSession | null> {
  const ss = storage()
  if (!ss || typeof indexedDB === 'undefined' || !('locks' in navigator)) return null
  try {
    const db = await openDb()
    const previous = ss.getItem(SESSION_KEY)
    let session = previous ?? crypto.randomUUID()
    let rows = previous ? await rowsOf(db, previous) : []
    if (!(await holdLock(session))) {
      // Дубльована вкладка (або попередня сторінка ще не відпустила замок) — копія файлів у новий сеанс
      session = crypto.randomUUID()
      await holdLock(session)
      rows = rows.map((r) => ({ ...r, session }))
      const tx = db.transaction(STORE, 'readwrite')
      for (const r of rows) tx.objectStore(STORE).put(r)
      await done(tx)
    }
    ss.setItem(SESSION_KEY, session)
    await dropOrphans(db, session)

    const saved = new Set(rows.map((r) => r.id))
    const active = Number(ss.getItem(ACTIVE_KEY))
    let queue = Promise.resolve()
    return {
      files: rows.map(({ id, name, bytes }) => ({ id, name, bytes })),
      activeId: saved.has(active) ? active : null,
      sync(files, activeId) {
        ss.setItem(ACTIVE_KEY, String(activeId ?? ''))
        const { add, remove } = planSync(saved, files)
        if (add.length === 0 && remove.length === 0) return
        for (const id of add) saved.add(id)
        for (const id of remove) saved.delete(id)
        const rows = files
          .filter((f) => add.includes(f.id))
          .map((f): Row => ({ session, id: f.id, name: f.name, bytes: f.bytes }))
        // Записи по черзі: кожна зміна — окрема транзакція; переповнення сховища — файл просто не збережеться
        queue = queue
          .then(() => {
            const tx = db.transaction(STORE, 'readwrite')
            for (const id of remove) tx.objectStore(STORE).delete([session, id])
            for (const r of rows) tx.objectStore(STORE).put(r)
            return done(tx)
          })
          .catch((e: unknown) => console.warn('Файли вкладки не збережено:', e))
      },
    }
  } catch (e) {
    console.warn('Сеанс вкладки недоступний:', e)
    return null
  }
}

/** Видаляє файли сеансів, чий замок ніхто не тримає (вкладки браузера закрито). */
async function dropOrphans(db: IDBDatabase, own: string) {
  const held = new Set((await navigator.locks.query()).held?.map((l) => l.name) ?? [])
  const tx = db.transaction(STORE, 'readwrite')
  const req = tx.objectStore(STORE).index('session').openKeyCursor(null, 'nextunique')
  req.onsuccess = () => {
    const cursor = req.result
    if (!cursor) return
    const session = cursor.key as string
    if (session !== own && !held.has(LOCK_PREFIX + session)) {
      tx.objectStore(STORE).delete(IDBKeyRange.bound([session, -Infinity], [session, Infinity]))
    }
    cursor.continue()
  }
  await done(tx)
}
