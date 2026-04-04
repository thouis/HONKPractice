// IndexedDB-backed local score library.
//
// DB: TrombonePractice  v1
//   store "library"  – imported scores { id (auto), title, xml, addedAt }
//   store "meta"     – key/value (used for persisting FS directory handle)

export interface LibraryEntry {
  id: number
  title: string
  xml: string
  addedAt: number
}

let _db: IDBDatabase | null = null

function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('TrombonePractice', 1)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains('library')) {
        db.createObjectStore('library', { keyPath: 'id', autoIncrement: true })
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta')
      }
    }
    req.onsuccess = () => { _db = req.result; resolve(req.result) }
    req.onerror  = () => reject(req.error)
  })
}

function tx(storeName: string, mode: IDBTransactionMode) {
  return openDb().then(db => db.transaction(storeName, mode).objectStore(storeName))
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror  = () => reject(req.error)
  })
}

export async function addScore(title: string, xml: string): Promise<number> {
  const store = await tx('library', 'readwrite')
  return wrap(store.add({ title, xml, addedAt: Date.now() })) as Promise<number>
}

export async function listScores(): Promise<LibraryEntry[]> {
  const store = await tx('library', 'readonly')
  return wrap(store.getAll())
}

export async function deleteScore(id: number): Promise<void> {
  const store = await tx('library', 'readwrite')
  await wrap(store.delete(id))
}

export async function saveMeta(key: string, value: unknown): Promise<void> {
  const store = await tx('meta', 'readwrite')
  await wrap(store.put(value, key))
}

export async function loadMeta<T>(key: string): Promise<T | null> {
  const store = await tx('meta', 'readonly')
  const val = await wrap(store.get(key))
  return (val ?? null) as T | null
}
