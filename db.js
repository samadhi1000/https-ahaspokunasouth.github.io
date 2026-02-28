/**
 * db.js - Firebase Firestore Database Layer
 * Ahaspokuna South Family Data Management System
 *
 * ════════════════════════════════════════════════════════════
 *  SETUP INSTRUCTIONS (do this once before deploying):
 *
 *  1. Go to https://console.firebase.google.com
 *  2. Click "Add project" → name it "ahaspokuna-db" → Create
 *  3. In the left sidebar click "Firestore Database"
 *     → "Create database" → choose "Start in test mode" → Next → Enable
 *  4. Click the ⚙️ gear icon → "Project settings"
 *  5. Scroll to "Your apps" → click the Web icon (</>)
 *  6. Register the app (any nickname is fine) → copy the firebaseConfig object
 *  7. Paste it below, replacing the placeholder values
 * ════════════════════════════════════════════════════════════
 */

// ▼▼▼ PASTE YOUR FIREBASE CONFIG HERE ▼▼▼
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
// ▲▲▲ PASTE YOUR FIREBASE CONFIG HERE ▲▲▲

/* ─── Collection names (mirrors the old IndexedDB stores) ─── */
const COL_FAMILIES = 'families';
const COL_USERS = 'users';
const COL_LOG = 'activityLog';

/* ─── SHA-256 (same as before – no library needed) ─── */
async function hashPassword(plain) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(plain));
    return Array.from(new Uint8Array(buf))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ─── Firestore DB reference (set during open()) ─── */
let _db = null;

class Database {
    constructor() { this.db = null; }

    /* ══════════════════════  INIT  ════════════════════════ */

    open() {
        return new Promise((resolve, reject) => {
            try {
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                _db = firebase.firestore();
                this.db = _db;

                // Enable offline persistence so the app works even with patchy connectivity
                _db.enablePersistence({ synchronizeTabs: true })
                    .catch(err => {
                        // Not critical – app still works online
                        if (err.code === 'failed-precondition') {
                            console.warn('Firestore offline persistence: multiple tabs open.');
                        } else if (err.code === 'unimplemented') {
                            console.warn('Firestore offline persistence not supported in this browser.');
                        }
                    });

                resolve(_db);
            } catch (e) {
                reject('Firebase init error: ' + e.message);
            }
        });
    }

    ensureOpen() {
        if (this.db) return Promise.resolve(this.db);
        return this.open();
    }

    /* ══════════════════════  FAMILY CRUD  ════════════════════════ */

    saveFamily(data) {
        return this.ensureOpen().then(db => {
            data.createdAt = data.createdAt || new Date().toISOString();
            data.updatedAt = new Date().toISOString();
            // Remove any legacy numeric id before saving
            const { id: _ignored, ...clean } = data;
            return db.collection(COL_FAMILIES).add(clean)
                .then(docRef => docRef.id);           // return Firestore doc id
        });
    }

    updateFamily(data) {
        return this.ensureOpen().then(db => {
            data.updatedAt = new Date().toISOString();
            const docId = String(data.id);
            const { id: _ignored, ...clean } = data;
            return db.collection(COL_FAMILIES).doc(docId).set(clean)
                .then(() => docId);
        });
    }

    getFamily(id) {
        return this.ensureOpen().then(db =>
            db.collection(COL_FAMILIES).doc(String(id)).get()
                .then(snap => snap.exists ? { id: snap.id, ...snap.data() } : null)
        );
    }

    getAllFamilies() {
        return this.ensureOpen().then(db =>
            db.collection(COL_FAMILIES)
                .orderBy('createdAt', 'asc')
                .get()
                .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }

    deleteFamily(id) {
        return this.ensureOpen().then(db =>
            db.collection(COL_FAMILIES).doc(String(id)).delete().then(() => true)
        );
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

    /* ══════════════════════  USER AUTH CRUD  ═════════════════════ */

    getUserCount() {
        return this.ensureOpen().then(db =>
            db.collection(COL_USERS).get()
                .then(snap => snap.size)
        );
    }

    getAllUsers() {
        return this.ensureOpen().then(db =>
            db.collection(COL_USERS).orderBy('createdAt', 'asc').get()
                .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }

    async createUser({ username, password, role }) {
        const passwordHash = await hashPassword(password);
        return this.ensureOpen().then(async db => {
            // Enforce unique username
            const existing = await db.collection(COL_USERS)
                .where('username', '==', username).get();
            if (!existing.empty) throw new Error('username_taken');

            return db.collection(COL_USERS).add({
                username,
                passwordHash,
                role,
                createdAt: new Date().toISOString()
            }).then(docRef => docRef.id);
        });
    }

    deleteUser(id) {
        return this.ensureOpen().then(db =>
            db.collection(COL_USERS).doc(String(id)).delete().then(() => true)
        );
    }

    async changePassword(userId, newPassword) {
        const passwordHash = await hashPassword(newPassword);
        return this.ensureOpen().then(db =>
            db.collection(COL_USERS).doc(String(userId))
                .update({ passwordHash })
                .then(() => true)
        );
    }

    async verifyUser(username, password) {
        const passwordHash = await hashPassword(password);
        return this.ensureOpen().then(db =>
            db.collection(COL_USERS)
                .where('username', '==', username)
                .get()
                .then(snap => {
                    if (snap.empty) return null;
                    const doc = snap.docs[0];
                    const user = doc.data();
                    if (user.passwordHash === passwordHash) {
                        return { id: doc.id, username: user.username, role: user.role };
                    }
                    return null;
                })
        );
    }

    /* ══════════════════════  ACTIVITY LOG  ═══════════════════════ */

    addLog(entry) {
        return this.ensureOpen().then(db =>
            db.collection(COL_LOG).add({
                ...entry,
                ts: new Date().toISOString()
            }).then(docRef => docRef.id)
        );
    }

    getRecentLogs(limit = 50) {
        return this.ensureOpen().then(db =>
            db.collection(COL_LOG)
                .orderBy('ts', 'desc')
                .limit(limit)
                .get()
                .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }
}

const db = new Database();
