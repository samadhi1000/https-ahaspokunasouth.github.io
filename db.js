/**
 * db.js - IndexedDB Abstraction Layer v2
 * Ahaspokuna South Family Data Management System
 * v2: Added users store + auth methods with SHA-256 hashing
 */

const DB_NAME = 'AhaspokunaDB';
const DB_VERSION = 2;               // bumped from 1 → 2 to add users + log stores
const STORE_FAMILIES = 'families';
const STORE_USERS = 'users';
const STORE_LOG = 'activityLog';

/* ─── SHA-256 via SubtleCrypto (no library needed) ─── */
async function hashPassword(plain) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(plain));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

class Database {
    constructor() { this.db = null; }

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // -- families store (unchanged) --
                if (!db.objectStoreNames.contains(STORE_FAMILIES)) {
                    const store = db.createObjectStore(STORE_FAMILIES, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('nic', 'headOfHousehold.nic', { unique: false });
                    store.createIndex('name', 'headOfHousehold.fullName', { unique: false });
                    store.createIndex('createdAt', 'createdAt', { unique: false });
                }
                // -- users store (NEW in v2) --
                if (!db.objectStoreNames.contains(STORE_USERS)) {
                    const us = db.createObjectStore(STORE_USERS, { keyPath: 'id', autoIncrement: true });
                    us.createIndex('username', 'username', { unique: true });
                }
                // -- activity log store (NEW in v2) --
                if (!db.objectStoreNames.contains(STORE_LOG)) {
                    const ls = db.createObjectStore(STORE_LOG, { keyPath: 'id', autoIncrement: true });
                    ls.createIndex('ts', 'ts', { unique: false });
                }
            };

            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onerror = (e) => reject('Database error: ' + e.target.errorCode);
        });
    }

    ensureOpen() {
        if (this.db) return Promise.resolve(this.db);
        return this.open();
    }

    /* ══════════════════════  FAMILY CRUD  ════════════════════════ */

    saveFamily(data) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            data.createdAt = data.createdAt || new Date().toISOString();
            data.updatedAt = new Date().toISOString();
            const req = db.transaction([STORE_FAMILIES], 'readwrite').objectStore(STORE_FAMILIES).add(data);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    updateFamily(data) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            data.updatedAt = new Date().toISOString();
            const req = db.transaction([STORE_FAMILIES], 'readwrite').objectStore(STORE_FAMILIES).put(data);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    getFamily(id) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_FAMILIES], 'readonly').objectStore(STORE_FAMILIES).get(id);
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    getAllFamilies() {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_FAMILIES], 'readonly').objectStore(STORE_FAMILIES).getAll();
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    deleteFamily(id) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_FAMILIES], 'readwrite').objectStore(STORE_FAMILIES).delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = e => reject(e.target.error);
        }));
    }

    searchFamilies(query) {
        return this.getAllFamilies().then(families => {
            if (!query) return families;
            const q = query.toLowerCase().trim();
            return families.filter(f => {
                const name = (f.headOfHousehold?.fullName || '').toLowerCase();
                const nic = (f.headOfHousehold?.nic || '').toLowerCase();
                const address = (f.headOfHousehold?.address || '').toLowerCase();
                return name.includes(q) || nic.includes(q) || address.includes(q);
            });
        });
    }

    getStats() {
        return this.getAllFamilies().then(families => {
            let totalMembers = 0, aidRecipients = 0;
            families.forEach(f => {
                const members = f.members || [];
                totalMembers += 1 + members.length;
                const aid = f.stateAid || {};
                if (aid.aswasuma || aid.elders || aid.mahajanadara || aid.mahapola ||
                    aid.scholarship5 || aid.medical || aid.disability) aidRecipients++;
                members.forEach(m => {
                    const ma = m.stateAid || {};
                    if (ma.aswasuma || ma.elders || ma.mahajanadara || ma.mahapola ||
                        ma.scholarship5 || ma.medical || ma.disability) aidRecipients++;
                });
            });
            return { totalFamilies: families.length, totalMembers, aidRecipients };
        });
    }

    /* ══════════════════════  BACKUP / RESTORE  ═══════════════════ */

    async exportDatabaseJSON() {
        const db = await this.ensureOpen();
        return new Promise(async (resolve, reject) => {
            try {
                // Get all families, users, and logs
                const families = await this.getAllFamilies();
                const users = await this.getAllUsers();
                const logs = await this.ensureOpen().then(db => new Promise((res, rej) => {
                    const req = db.transaction([STORE_LOG], 'readonly').objectStore(STORE_LOG).getAll();
                    req.onsuccess = e => res(e.target.result);
                    req.onerror = e => rej(e.target.error);
                }));

                const backupData = {
                    version: DB_VERSION,
                    timestamp: new Date().toISOString(),
                    families,
                    users,
                    logs
                };
                resolve(JSON.stringify(backupData, null, 2));
            } catch (err) {
                reject(err);
            }
        });
    }

    async importDatabaseJSON(jsonStr) {
        return new Promise(async (resolve, reject) => {
            try {
                const data = JSON.parse(jsonStr);
                if (!data || !Array.isArray(data.families) || !Array.isArray(data.users)) {
                    throw new Error("Invalid backup format. Must contain valid 'families' and 'users' arrays.");
                }

                const db = await this.ensureOpen();

                // Start a readwrite transaction for all stores
                const tx = db.transaction([STORE_FAMILIES, STORE_USERS, STORE_LOG], 'readwrite');

                tx.oncomplete = () => resolve(true);
                tx.onerror = (e) => reject(e.target.error);

                const familyStore = tx.objectStore(STORE_FAMILIES);
                const userStore = tx.objectStore(STORE_USERS);
                const logStore = tx.objectStore(STORE_LOG);

                // Option: We could clear the stores first, or just overwrite by ID.
                // Re-importing by completely clearing first to ensure an exact mirror.
                familyStore.clear();
                userStore.clear();
                logStore.clear();

                for (const f of data.families) familyStore.put(f);
                for (const u of data.users) userStore.put(u);
                if (Array.isArray(data.logs)) {
                    for (const l of data.logs) logStore.put(l);
                }

            } catch (err) {
                reject(err);
            }
        });
    }

    /* ══════════════════════  USER AUTH CRUD  ═════════════════════ */

    /** Returns count of users (0 = first run) */
    getUserCount() {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_USERS], 'readonly').objectStore(STORE_USERS).count();
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    getAllUsers() {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_USERS], 'readonly').objectStore(STORE_USERS).getAll();
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    /** Create a new user. Throws if username taken. */
    async createUser({ username, password, role }) {
        const passwordHash = await hashPassword(password);
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_USERS], 'readwrite').objectStore(STORE_USERS).add({
                username, passwordHash, role,
                createdAt: new Date().toISOString()
            });
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(
                e.target.error?.name === 'ConstraintError'
                    ? new Error('username_taken')
                    : e.target.error
            );
        }));
    }

    deleteUser(id) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_USERS], 'readwrite').objectStore(STORE_USERS).delete(id);
            req.onsuccess = () => resolve(true);
            req.onerror = e => reject(e.target.error);
        }));
    }

    async changePassword(userId, newPassword) {
        const passwordHash = await hashPassword(newPassword);
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const store = db.transaction([STORE_USERS], 'readwrite').objectStore(STORE_USERS);
            const get = store.get(userId);
            get.onsuccess = e => {
                const user = e.target.result;
                if (!user) return reject(new Error('User not found'));
                user.passwordHash = passwordHash;
                const put = store.put(user);
                put.onsuccess = () => resolve(true);
                put.onerror = ev => reject(ev.target.error);
            };
            get.onerror = e => reject(e.target.error);
        }));
    }

    /** Returns user object if credentials valid, null otherwise */
    async verifyUser(username, password) {
        const passwordHash = await hashPassword(password);
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const idx = db.transaction([STORE_USERS], 'readonly')
                .objectStore(STORE_USERS)
                .index('username');
            const req = idx.get(username);
            req.onsuccess = e => {
                const user = e.target.result;
                if (user && user.passwordHash === passwordHash) {
                    resolve({ id: user.id, username: user.username, role: user.role });
                } else {
                    resolve(null);
                }
            };
            req.onerror = e => reject(e.target.error);
        }));
    }

    /* ══════════════════════  ACTIVITY LOG  ═══════════════════════ */

    addLog(entry) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_LOG], 'readwrite').objectStore(STORE_LOG).add({
                ...entry,
                ts: new Date().toISOString()
            });
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        }));
    }

    getRecentLogs(limit = 50) {
        return this.ensureOpen().then(db => new Promise((resolve, reject) => {
            const req = db.transaction([STORE_LOG], 'readonly').objectStore(STORE_LOG).getAll();
            req.onsuccess = e => {
                const all = e.target.result;
                resolve(all.slice(-limit).reverse()); // newest first
            };
            req.onerror = e => reject(e.target.error);
        }));
    }
}

const db = new Database();
