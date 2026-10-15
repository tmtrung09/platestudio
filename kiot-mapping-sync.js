/* Per-SKU immutable outbox. IndexedDB transaction completion is the local ACK. */
(() => {
  let opening, adapter, timer, running, restoredScope = '', lastError = '';
  const entries = new Map(), saving = new Set();
  function database() {
    if (!opening) opening = new Promise((resolve, reject) => {
      const request = indexedDB.open('plate-studio-kiot-mapping-v1', 2);
      request.onupgradeneeded = () => { for (const name of ['pending', 'confirmed']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath: 'key' }).createIndex('scope', 'scope'); };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
      request.onerror = () => { opening = null; reject(request.error); };
      request.onblocked = () => { opening = null; reject(new Error('Kho ghép SKU đang bận. Giữ bản nháp và thử lại.')); };
    });
    return opening;
  }
  async function transaction(mode, run, names = 'pending') {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode); let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('Không lưu được ghép SKU trên máy.'));
      run(Array.isArray(names) ? Object.fromEntries(names.map(name => [name, tx.objectStore(name)])) : tx.objectStore(names), value => { result = value; });
    });
  }
  const scope = () => adapter?.scope() || '';
  const pending = () => [...entries.values()].filter(entry => entry.scope === scope());
  function changed() { adapter?.changed(); }
  function overlay() { for (const entry of pending()) adapter.apply(entry.sku, entry.desired, entry.expectedRevision, false); }
  async function restore() {
    const owner = scope(); if (!owner) return;
    const saved = await transaction('readonly', (stores, done) => {
      const result = {}; let count = 0;
      for (const name of ['pending', 'confirmed']) { const req = stores[name].index('scope').getAll(owner); req.onsuccess = () => { result[name] = req.result; if (++count === 2) done(result); }; }
    }, ['pending', 'confirmed']);
    if (owner !== scope()) return;
    // Preserve operations currently being persisted by this tab until their transaction completes.
    for (const [key, entry] of entries) if (entry.scope === owner && !saving.has(owner + ':' + entry.sku)) entries.delete(key);
    for (const row of saved.confirmed) if (BigInt(row.revision || '0') >= BigInt(adapter.state(row.sku).revision || '0')) adapter.apply(row.sku, row.state, row.revision);
    for (const row of saved.pending) entries.set(row.key, row);
    restoredScope = owner; overlay(); changed();
  }
  async function save(sku, desired, expected) {
    const owner = scope(), lock = owner + ':' + sku;
    if (!owner) throw new Error('Cần đăng nhập đúng xưởng trước khi ghép SKU.');
    if (saving.has(lock)) throw new Error('SKU đang được lưu trên máy.');
    saving.add(lock);
    let duplicate = false;
    try {
      // Read/check/insert in ONE transaction so two tabs cannot enqueue competing edits to one SKU.
      const entry = { key: owner + ':' + crypto.randomUUID(), scope: owner, sku,
        requestId: crypto.randomUUID(), desired: structuredClone(desired),
        expectedRevision: expected.revision || null, expectedState: { mapping: expected.mapping || null, skipped: expected.skipped || null } };
      await transaction('readwrite', store => {
        const req = store.index('scope').getAll(owner);
        req.onsuccess = () => {
          if (req.result.some(row => row.sku === sku)) { duplicate = true; store.transaction.abort(); return; }
          store.put(entry);
        };
      });
      entries.set(entry.key, entry);
      if (owner !== scope()) return { scopeChanged: true };
      adapter.apply(sku, desired, entry.expectedRevision, false); lastError = ''; changed();
      void retry(); return { savedLocal: true };
    } catch (error) {
      throw new Error(duplicate ? 'SKU còn bản chờ đồng bộ. Thử lại hoặc xử lý xung đột trước khi lưu bản khác.' : 'Chưa lưu được ghép SKU trên máy: ' + error.message);
    } finally { saving.delete(lock); }
  }
  async function retry() {
    if (running) return running;
    const owner = scope(); if (!owner || !adapter.ready()) return;
    running = (async () => {
      await restore();
      for (const entry of pending()) {
        if (owner !== scope() || !adapter.ready()) break;
        if (entry.conflict) continue;
        try {
          const state = await adapter.commit(entry);
          // Atomically retain the acknowledged payload before removing the operation. This also
          // protects an offline reload when the aggregate localStorage cache is still full/stale.
          await transaction('readwrite', stores => {
            const key = entry.scope + ':' + entry.sku, get = stores.confirmed.get(key);
            get.onsuccess = () => {
              if (!get.result || BigInt(get.result.revision || '0') <= BigInt(state.revision || '0')) stores.confirmed.put({ key, scope: entry.scope, sku: entry.sku, state, revision: state.revision });
              stores.pending.delete(entry.key);
            };
          }, ['pending', 'confirmed']); entries.delete(entry.key);
          if (owner !== scope()) continue;
          if (BigInt(state.revision || '0') >= BigInt(adapter.state(entry.sku).revision || '0')) adapter.apply(entry.sku, state, state.revision);
          lastError = '';
          adapter.notify('Đã lưu cloud: ' + entry.sku + '.'); changed();
        } catch (error) {
          entry.attempts = (entry.attempts || 0) + 1;
          entry.conflict = error.code === '40001';
          entry.error = entry.conflict ? 'SKU đã đổi ở phiên khác; bản của bạn vẫn được giữ.' : error.code === 'PGRST202' ? 'Máy chủ chưa có bản cập nhật lưu ghép SKU.' : error.code === '42501' ? 'Chưa có quyền lưu cloud; bản ghép vẫn được giữ trên máy.' : /^(22|23)/.test(error.code || '') ? 'Máy chủ từ chối dữ liệu ghép; bản trên máy vẫn được giữ để kiểm tra.' : 'Chưa kết nối được cloud; bản ghép đã lưu trên máy.';
          await transaction('readwrite', store => store.put(entry));
          if (owner === scope()) { lastError = entry.error; changed(); }
        }
      }
    })().catch(error => { if (owner === scope()) { lastError = error.message; changed(); } }).finally(() => {
      running = null; clearTimeout(timer);
      if (pending().some(entry => !entry.conflict) && adapter.ready()) {
        const attempts = Math.max(1, ...pending().map(entry => entry.attempts || 0));
        timer = setTimeout(() => void retry(), Math.min(60000, 1000 * 2 ** Math.min(attempts, 6)));
      }
    });
    return running;
  }
  async function resolveConflict(key, useLocal) {
    const entry = entries.get(key), owner = scope();
    if (!entry || !entry.conflict || entry.scope !== owner) return;
    if (saving.has(owner + ':' + entry.sku)) return;
    saving.add(owner + ':' + entry.sku);
    try {
      const state = await adapter.readRemote(entry.sku);
      if (owner !== scope()) return;
      const next = useLocal ? { ...entry, key: owner + ':' + crypto.randomUUID(), requestId: crypto.randomUUID(),
        expectedRevision: state.revision || null, expectedState: { mapping: state.mapping || null, skipped: state.skipped || null }, conflict: false, attempts: 0, error: '' } : null;
      await transaction('readwrite', store => { store.delete(key); if (next) store.put(next); });
      entries.delete(key); if (next) entries.set(next.key, next);
      if (owner !== scope()) return;
      adapter.apply(entry.sku, next?.desired || state, state.revision, !next); lastError = ''; changed();
    } catch (error) { if (owner === scope()) { lastError = 'Chưa đọc được bản cloud: ' + error.message; changed(); } }
    finally { saving.delete(owner + ':' + entry.sku); }
    void retry();
  }
  window.KiotMappingSync = {
    configure(value) { adapter = value; }, save, restore, retry, overlay, resolveConflict,
    has(sku) { return pending().some(entry => entry.sku === sku); },
    status() { const rows = pending(); return { pending: rows, error: restoredScope && restoredScope !== scope() ? '' : lastError || rows.find(row => row.error)?.error || '' }; },
  };
  addEventListener('online', () => void retry());
  addEventListener('focus', () => void retry());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void retry(); });
  window.initKiotMappingSync?.();
  void retry(); // Also resume when this optional script arrives after the cloud session is already ready.
})();
