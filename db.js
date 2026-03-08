/**
 * db.js - Firebase Firestore Migration v3
 * Ahaspokuna South Family Data Management System
 * This version replaces IndexedDB with Firebase Cloud Firestore for multi-device sync.
 */

// ─── FIREBASE CONFIGURATION ───
// මචං, මෙතනට ඔයාගේ Firebase Project එකේ Config එක දාන්න.
const firebaseConfig = {
    apiKey: "AIzaSyBPLRRY20Sc039T46I4lfCRz4frtWN5wxY",
    authDomain: "ahaspokuna-db.firebaseapp.com",
    projectId: "ahaspokuna-db",
    storageBucket: "ahaspokuna-db.firebasestorage.app",
    messagingSenderId: "934510823567",
    appId: "1:934510823567:web:f17224e0abfe2f102008fa",
    measurementId: "G-HEV0Y6W42R"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const fs = firebase.firestore();

// Collections
const COL_FAMILIES = 'families';
const COL_USERS = 'users';
const COL_LOG = 'activityLog';

/* ─── SHA-256 via SubtleCrypto ─── */
async function hashPassword(plain) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(plain));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

class Database {
    constructor() { }

    // Mock open for compatibility with app.js
    async open() { return true; }

    /* ══════════════════════  FAMILY CRUD  ════════════════════════ */

    async saveFamily(data) {
        data.createdAt = data.createdAt || new Date().toISOString();
        data.updatedAt = new Date().toISOString();
        // Add to Firestore and get the ID
        const docRef = await fs.collection(COL_FAMILIES).add(data);
        // We'll also store the firestore ID inside the data for easier access
        await docRef.update({ id: docRef.id });
        return docRef.id;
    }

    async updateFamily(data) {
        if (!data.id) throw new Error("ID missing for update");
        data.updatedAt = new Date().toISOString();
        const id = data.id.toString(); // Ensure string
        await fs.collection(COL_FAMILIES).doc(id).set(data, { merge: true });
        return id;
    }

    async getFamily(id) {
        const doc = await fs.collection(COL_FAMILIES).doc(id.toString()).get();
        return doc.exists ? doc.data() : null;
    }

    async getAllFamilies() {
        const snapshot = await fs.collection(COL_FAMILIES).get();
        return snapshot.docs.map(doc => doc.data());
    }

    async deleteFamily(id) {
        await fs.collection(COL_FAMILIES).doc(id.toString()).delete();
        return true;
    }

    async searchFamilies(query) {
        const families = await this.getAllFamilies();
        if (!query) return families;
        const q = query.toLowerCase().trim();
        return families.filter(f => {
            const name = (f.headOfHousehold?.fullName || '').toLowerCase();
            const nic = (f.headOfHousehold?.nic || '').toLowerCase();
            const address = (f.headOfHousehold?.address || '').toLowerCase();
            return name.includes(q) || nic.includes(q) || address.includes(q);
        });
    }

    async getStats() {
        const families = await this.getAllFamilies();
        let totalMembers = 0, aidRecipients = 0;
        families.forEach(f => {
            const members = f.members || [];
            totalMembers += 1 + members.length;
            const aid = f.stateAid || {};
            const keys = ['aswasuma', 'elders', 'mahajanadara', 'mahapola', 'scholarship5', 'medical', 'disability'];
            if (keys.some(k => aid[k])) aidRecipients++;
            members.forEach(m => {
                const ma = m.stateAid || {};
                if (keys.some(k => ma[k])) aidRecipients++;
            });
        });
        return { totalFamilies: families.length, totalMembers, aidRecipients };
    }

    /* ══════════════════════  BACKUP / RESTORE  ═══════════════════ */

    async exportDatabaseJSON() {
        const families = await this.getAllFamilies();
        const users = await this.getAllUsers();
        const logsSnapshot = await fs.collection(COL_LOG).get();
        const logs = logsSnapshot.docs.map(d => d.data());

        const backupData = {
            version: 'Firebase-v1',
            timestamp: new Date().toISOString(),
            families,
            users,
            logs
        };
        return JSON.stringify(backupData, null, 2);
    }

    async importDatabaseJSON(jsonStr) {
        const data = JSON.parse(jsonStr);
        if (!data || !Array.isArray(data.families) || !Array.isArray(data.users)) {
            throw new Error("Invalid format");
        }

        // Import families
        const batch = fs.batch();
        for (const f of data.families) {
            const ref = fs.collection(COL_FAMILIES).doc(f.id ? f.id.toString() : undefined);
            batch.set(ref, f);
        }
        // Import users
        for (const u of data.users) {
            const ref = fs.collection(COL_USERS).doc(u.id ? u.id.toString() : u.username);
            batch.set(ref, u);
        }
        await batch.commit();
        return true;
    }

    /* ══════════════════════  USER AUTH CRUD  ═════════════════════ */

    async getUserCount() {
        const snapshot = await fs.collection(COL_USERS).get();
        return snapshot.size;
    }

    async getAllUsers() {
        const snapshot = await fs.collection(COL_USERS).get();
        return snapshot.docs.map(doc => doc.data());
    }

    async createUser({ username, password, role }) {
        const passwordHash = await hashPassword(password);
        // Check if exists
        const existing = await fs.collection(COL_USERS).where('username', '==', username).get();
        if (!existing.empty) throw new Error('username_taken');

        const docRef = await fs.collection(COL_USERS).add({
            username, passwordHash, role,
            createdAt: new Date().toISOString()
        });
        await docRef.update({ id: docRef.id });
        return docRef.id;
    }

    async deleteUser(id) {
        await fs.collection(COL_USERS).doc(id.toString()).delete();
        return true;
    }

    async verifyUser(username, password) {
        const passwordHash = await hashPassword(password);
        const snapshot = await fs.collection(COL_USERS).where('username', '==', username).get();
        if (snapshot.empty) return null;
        const user = snapshot.docs[0].data();
        if (user.passwordHash === passwordHash) {
            return { id: snapshot.docs[0].id, username: user.username, role: user.role };
        }
        return null;
    }

    async updateUser(id, { username, password, role }) {
        const data = { role, updatedAt: new Date().toISOString() };
        if (username) data.username = username;
        if (password) {
            data.passwordHash = await hashPassword(password);
        }
        await fs.collection(COL_USERS).doc(id.toString()).update(data);
        return true;
    }

    async changePassword(id, newPassword) {
        const passwordHash = await hashPassword(newPassword);
        await fs.collection(COL_USERS).doc(id.toString()).update({
            passwordHash,
            updatedAt: new Date().toISOString()
        });
        return true;
    }

    /* ══════════════════════  ACTIVITY LOG  ═══════════════════════ */

    async addLog(entry) {
        const log = { ...entry, ts: new Date().toISOString() };
        await fs.collection(COL_LOG).add(log);
        return true;
    }

    async getRecentLogs(limitCount = 50) {
        const snapshot = await fs.collection(COL_LOG).orderBy('ts', 'desc').limit(limitCount).get();
        return snapshot.docs.map(doc => doc.data());
    }

    /* ══════════════════════  MIGRATION HELPER  ═══════════════════ */
    /** මචං, මේක run කළොත් ඔයාගේ computer එකේ තියෙන පරණ දත්ත ටික Firebase එකට යවන්න පුළුවන් */
    async migrateFromIndexedDB() {
        console.log("Migration started from IndexedDB...");
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('AhaspokunaDB');
            request.onsuccess = async (e) => {
                const idb = e.target.result;
                const tx = idb.transaction(['families', 'users', 'activityLog'], 'readonly');

                const families = await new Promise(res => tx.objectStore('families').getAll().onsuccess = ev => res(ev.target.result));
                const users = await new Promise(res => tx.objectStore('users').getAll().onsuccess = ev => res(ev.target.result));
                const logs = await new Promise(res => tx.objectStore('activityLog').getAll().onsuccess = ev => res(ev.target.result));

                console.log(`Found: ${families.length} families, ${users.length} users.`);

                // Upload to Firebase
                for (const f of families) await this.saveFamily(f);
                for (const u of users) {
                    await fs.collection(COL_USERS).doc(u.username).set(u);
                }
                for (const l of logs) await this.addLog(l);

                console.log("Migration complete!");
                resolve(true);
            };
            request.onerror = e => reject(e);
        });
    }
}

const db = new Database();
