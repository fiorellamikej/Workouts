const DB_NAME = 'sword-shield-workouts-v1';
const STORES = ['packs', 'drafts', 'queue', 'settings'];
async function database() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => STORES.forEach(name => request.result.createObjectStore(name, { keyPath: 'id' }));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Device storage is unavailable. Keep this page open and save online.'));
    });
}
export async function allLocal(store) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    }
    finally {
        db.close();
    }
}
export async function getLocal(store, id) {
    const db = await database();
    try {
        return await new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).get(id); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
    }
    finally {
        db.close();
    }
}
export async function putLocal(store, row) {
    const db = await database();
    try {
        await new Promise((resolve, reject) => {
            // Usage check and write share one transaction, including concurrent tabs.
            const tx = db.transaction([...STORES], 'readwrite');
            const totals = {};
            let remaining = STORES.length;
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(new Error('Could not save on this device. Free space, keep this page open, and retry.'));
            tx.onabort = () => reject(new Error('Offline storage reached its 20 MB limit. Sync workouts or remove downloaded programs, then retry.'));
            STORES.forEach(name => {
                const request = tx.objectStore(name).getAll();
                request.onsuccess = () => {
                    totals[name] = request.result;
                    if (--remaining)
                        return;
                    const bytes = new TextEncoder().encode(JSON.stringify(row)).length;
                    const used = Object.entries(totals).reduce((n, [name, rows]) => n + rows.filter(r => !(name === store && r.id === row.id)).reduce((sum, r) => sum + (r.bytes || new TextEncoder().encode(JSON.stringify(r)).length), 0), 0);
                    if (bytes > 5 * 1024 * 1024 || used + bytes > 20 * 1024 * 1024) {
                        tx.abort();
                        return;
                    }
                    tx.objectStore(store).put({ ...row, bytes });
                };
            });
        });
    }
    finally {
        db.close();
    }
}
export async function deleteLocal(store, id) {
    const db = await database();
    try {
        await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    }
    finally {
        db.close();
    }
}
export async function setOfflineUser(userId) { await putLocal('settings', { id: 'active-user', userId: userId || '', updatedAt: new Date().toISOString() }); }
export async function offlineUser() { return (await getLocal('settings', 'active-user'))?.userId || null; }
export async function syncQueue(userId) {
    const rows = (await allLocal('queue')).filter(r => r.userId === userId).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const outcomes = [];
    for (const row of rows) {
        const response = await fetch('/api/workout-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation: row.id, userId, event: row.event }), credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) {
            await putLocal('queue', { ...row, error: data.error || 'Sync failed' });
            throw new Error(data.error || 'Sync failed. Your local workout is preserved.');
        }
        await putLocal('settings', { id: `receipt:${row.id}`, userId, updatedAt: new Date().toISOString(), data });
        await deleteLocal('queue', row.id);
        if (typeof row.draftId === 'string')
            await deleteLocal('drafts', row.draftId);
        outcomes.push({ id: row.id, data, draftId: typeof row.draftId === 'string' ? row.draftId : undefined });
    }
    return outcomes;
}
