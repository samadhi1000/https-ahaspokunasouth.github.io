/**
 * app.js - Main Application Logic
 * Ahaspokuna South Family Data Management System
 */

'use strict';

/* ═══════════════════════════════════════
   AUTH - Login / Session / Role System
═══════════════════════════════════════ */
const Auth = {
    currentUser: null,  // { id, username, role }
    SESSION_KEY: 'ahaspokuna_session',

    /** Call once at app start */
    async init() {
        await db.open();
        // Restore session from sessionStorage
        const saved = sessionStorage.getItem(Auth.SESSION_KEY);
        if (saved) {
            try {
                Auth.currentUser = JSON.parse(saved);
                Auth.showApp();
                return;
            } catch { sessionStorage.removeItem(Auth.SESSION_KEY); }
        }
        // First-run check
        const count = await db.getUserCount();
        if (count === 0) {
            Auth.showSetup();
        } else {
            Auth.showLogin();
        }
    },

    showLogin() {
        const overlay = document.getElementById('auth-overlay');
        const loginCard = document.getElementById('auth-login-card');
        const setupCard = document.getElementById('auth-setup-card');
        overlay.classList.remove('hidden', 'hiding');
        loginCard.style.display = '';
        if (setupCard) setupCard.style.display = 'none';
        setTimeout(() => document.getElementById('login-username')?.focus(), 100);
    },

    showSetup() {
        const overlay = document.getElementById('auth-overlay');
        const loginCard = document.getElementById('auth-login-card');
        const setupCard = document.getElementById('auth-setup-card');
        overlay.classList.remove('hidden', 'hiding');
        loginCard.style.display = 'none';
        if (setupCard) setupCard.style.display = '';
        setTimeout(() => document.getElementById('setup-password')?.focus(), 100);
    },

    showApp() {
        // Hide auth overlay
        const overlay = document.getElementById('auth-overlay');
        overlay.classList.add('hiding');
        setTimeout(() => overlay.classList.add('hidden'), 400);
        // Show user badge
        const u = Auth.currentUser;
        const badge = document.getElementById('user-badge');
        const badgeName = document.getElementById('badge-username');
        const badgeRole = document.getElementById('badge-role');
        const logoutBtn = document.getElementById('btn-logout');
        if (badge) badge.style.display = 'flex';
        if (badgeName) badgeName.textContent = '👤 ' + u.username;
        if (badgeRole) { badgeRole.textContent = u.role === 'admin' ? 'Admin' : 'Operator'; badgeRole.className = 'role-tag ' + u.role; }
        if (logoutBtn) logoutBtn.style.display = '';
        // Apply role-based UI
        Auth.applyRoleUI();
        // Load data
        loadRecords();
        updateStats();
        if (u.role === 'admin') loadAdminPanel();
        // Check for ?view=ID in URL
        const urlParams = new URLSearchParams(window.location.search);
        const viewId = urlParams.get('view');
        if (viewId) {
            setTimeout(() => viewRecord(viewId), 500);
            // Clean up URL without reload
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    },

    applyRoleUI() {
        const isAdmin = Auth.currentUser?.role === 'admin';
        // Admin panel visibility
        const adminPanel = document.getElementById('admin-panel');
        if (adminPanel) adminPanel.style.display = isAdmin ? '' : 'none';
        // Delete buttons: hide for operators
        // (re-applied after each loadRecords via renderDeleteBtns)
        Auth._patchDeleteButtons();
    },

    _patchDeleteButtons() {
        // Called after records are rendered
        const isAdmin = Auth.currentUser?.role === 'admin';
        document.querySelectorAll('.btn-danger').forEach(btn => {
            btn.style.display = isAdmin ? '' : 'none';
        });
    },

    isAdmin() { return Auth.currentUser?.role === 'admin'; },

    async login(event) {
        event.preventDefault();
        const errEl = document.getElementById('login-error');
        const btn = document.getElementById('login-btn');
        const username = document.getElementById('login-username')?.value?.trim();
        const password = document.getElementById('login-password')?.value;
        if (!username || !password) { Auth._showAuthError(errEl, 'username සහ password ඇතුළත් කරන්න'); return; }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ පරීක්ෂා කරමින්...'; }
        try {
            const user = await db.verifyUser(username, password);
            if (user) {
                Auth.currentUser = user;
                sessionStorage.setItem(Auth.SESSION_KEY, JSON.stringify(user));
                db.addLog({ username: user.username, action: 'login', detail: 'ලොගින් විය' });
                Auth.showApp();
            } else {
                Auth._showAuthError(errEl, '❌ username හෝ password වැරදිය. නැවත උත්සාහ කරන්න.');
                document.getElementById('login-password').value = '';
                document.getElementById('login-password').focus();
            }
        } catch (e) {
            Auth._showAuthError(errEl, 'දෝෂයක් සිදු විය: ' + e);
        }
        if (btn) { btn.disabled = false; btn.textContent = '🔓 ලොගින් වන්න'; }
    },

    async setupAdmin(event) {
        event.preventDefault();
        const errEl = document.getElementById('setup-error');
        const btn = document.getElementById('setup-btn');
        const username = document.getElementById('setup-username')?.value?.trim() || 'admin';
        const password = document.getElementById('setup-password')?.value;
        const confirm = document.getElementById('setup-confirm')?.value;
        if (!password || password.length < 4) { Auth._showAuthError(errEl, 'මුරපදය අවම අකුරු 4ක් විය යුතුය'); return; }
        if (password !== confirm) { Auth._showAuthError(errEl, 'මුරපද දෙක ගැළපෙන්නේ නැත'); return; }
        if (btn) { btn.disabled = true; btn.textContent = '⏳ සාදමින්...'; }
        try {
            await db.createUser({ username, password, role: 'admin' });
            // Auto login
            Auth.currentUser = { username, role: 'admin' };
            sessionStorage.setItem(Auth.SESSION_KEY, JSON.stringify(Auth.currentUser));
            db.addLog({ username, action: 'login', detail: 'Admin ගිණුම සාදා ලොගින් විය' });
            Auth.showApp();
        } catch (e) {
            Auth._showAuthError(errEl, 'ගිණුම සැදීමට අසමත් විය: ' + e);
        }
        if (btn) { btn.disabled = false; btn.textContent = '✅ Admin ගිණුම සාදන්න'; }
    },

    logout() {
        sessionStorage.removeItem(Auth.SESSION_KEY);
        Auth.currentUser = null;
        location.reload();
    },

    _showAuthError(el, msg) {
        if (!el) return;
        el.textContent = msg;
        el.classList.add('visible');
        setTimeout(() => el.classList.remove('visible'), 5000);
    },
};

/* ═══════════════════════════════════════
   ADMIN PANEL FUNCTIONS
═══════════════════════════════════════ */
function switchAdminTab(name, btn) {
    document.querySelectorAll('.admin-tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('admin-tab-' + name);
    if (panel) panel.classList.add('active');
    if (btn) btn.classList.add('active');
    if (name === 'log') loadActivityLog();
}

async function loadAdminPanel() {
    if (!Auth.isAdmin()) return;
    // Load users
    try {
        const users = await db.getAllUsers();
        const tbody = document.getElementById('users-table-body');
        if (tbody) {
            if (users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted)">පරිශීලකයන් නොමැත</td></tr>';
            } else {
                tbody.innerHTML = users.map(u => `<tr>
                    <td><strong style="color:var(--text-primary)">${u.username}</strong></td>
                    <td><span class="role-tag ${u.role}">${u.role === 'admin' ? 'Admin' : 'Operator'}</span></td>
                    <td class="text-muted">${u.createdAt ? new Date(u.createdAt).toLocaleDateString('si-LK') : '—'}</td>
                    <td>${u.username !== Auth.currentUser?.username
                        ? `<div style="display:flex;gap:6px">
                            <button class="btn btn-secondary btn-sm" onclick="openEditUser('${u.id}','${u.username}','${u.role}')">✏️ Edit</button>
                            <button class="btn btn-danger btn-sm" onclick="deleteUser('${u.id}','${u.username}')">🗑️ ඉවත් කරන්න</button>
                          </div>`
                        : '<span class="text-muted" style="font-size:11px">(ඔබ)</span>'
                    }</td>
                </tr>`).join('');
            }
        }
    } catch (e) { console.error('loadAdminPanel users:', e); }
}

async function loadActivityLog() {
    try {
        const logs = await db.getRecentLogs(50);
        const tbody = document.getElementById('log-table-body');
        if (!tbody) return;
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:16px;color:var(--text-muted)">ක්‍රියාකාරකම් නොමැත</td></tr>';
            return;
        }
        const actionLabels = { login: '🔐 ලොගින්', add: '➕ එකතු', edit: '✏️ සංස්කරණ', delete: '🗑️ ඉවත්', user_add: '👤 User', user_del: '❌ User' };
        tbody.innerHTML = logs.map(l => {
            const dt = l.ts ? new Date(l.ts).toLocaleString('si-LK') : '—';
            return `<tr>
                <td class="text-muted" style="white-space:nowrap;font-size:11px">${dt}</td>
                <td style="color:var(--text-primary);font-weight:500">${l.username || '—'}</td>
                <td><span class="log-action ${l.action}">${actionLabels[l.action] || l.action}</span></td>
                <td>${l.detail || ''}</td>
            </tr>`;
        }).join('');
    } catch (e) { console.error('loadActivityLog:', e); }
}

async function addUser() {
    if (!Auth.isAdmin()) return;
    const errEl = document.getElementById('add-user-error');
    const username = document.getElementById('new-username')?.value?.trim();
    const role = document.getElementById('new-role')?.value;
    const password = document.getElementById('new-password')?.value;
    const confirm = document.getElementById('new-password-confirm')?.value;

    if (!username) { Auth._showAuthError(errEl, 'පරිශීලක නාමය ඇතුළු කරන්න'); return; }
    if (!password || password.length < 4) { Auth._showAuthError(errEl, 'මුරපදය අවම අකුරු 4ක් විය යුතුය'); return; }
    if (password !== confirm) { Auth._showAuthError(errEl, 'මුරපද දෙක ගැළපෙන්නේ නැත'); return; }

    try {
        await db.createUser({ username, password, role });
        document.getElementById('new-username').value = '';
        document.getElementById('new-password').value = '';
        document.getElementById('new-password-confirm').value = '';
        db.addLog({ username: Auth.currentUser?.username, action: 'user_add', detail: `${username} (${role}) එකතු කරන ලදී` });
        showToast(`✅ "${username}" සාර්ථකව එකතු කරන ලදී`, 'success');
        loadAdminPanel();
    } catch (e) {
        if (e?.message === 'username_taken') {
            Auth._showAuthError(errEl, `"${username}" දැනටමත් ඇත. වෙනත් නමක් භාවිත කරන්න.`);
        } else {
            Auth._showAuthError(errEl, 'ගිණුම සැදීමට අසමත් විය: ' + e);
        }
    }
}

async function deleteUser(id, username) {
    if (!Auth.isAdmin()) return;
    showConfirm('User ඉවත් කරන්නද?',
        `"${username}" – මෙම ගිණුම ස්ථිරවම ඉවත් කෙරේ.`,
        async () => {
            try {
                await db.deleteUser(id);
                db.addLog({ username: Auth.currentUser?.username, action: 'user_del', detail: `${username} ඉවත් කරන ලදී` });
                showToast(`"${username}" ඉවත් කරන ලදී`, 'info');
                loadAdminPanel();
            } catch (e) { showToast('ඉවත් කිරීමට අසමත් විය', 'error'); }
        }
    );
}

function openEditUser(id, username, role) {
    if (!Auth.isAdmin()) return;
    $('edit-user-id').value = id;
    $('edit-user-username').value = username;
    $('edit-user-role').value = role;
    $('edit-user-password').value = '';
    $('edit-user-confirm').value = '';
    $('edit-user-error').textContent = '';
    $('edit-user-modal').classList.add('active');
}

async function saveUserEdit() {
    if (!Auth.isAdmin()) return;
    const id = $('edit-user-id').value;
    const username = $('edit-user-username').value.trim();
    const role = $('edit-user-role').value;
    const password = $('edit-user-password').value;
    const confirm = $('edit-user-confirm').value;
    const errEl = $('edit-user-error');

    if (!username) { Auth._showAuthError(errEl, 'පරිශීලක නාමය ඇතුළු කරන්න'); return; }
    if (password && password.length < 4) { Auth._showAuthError(errEl, 'මුරපදය අවම අකුරු 4ක් විය යුතුය'); return; }
    if (password !== confirm) { Auth._showAuthError(errEl, 'මුරපද දෙක ගැළපෙන්නේ නැත'); return; }

    try {
        await db.updateUser(id, { username, password: password || null, role });
        db.addLog({ username: Auth.currentUser?.username, action: 'edit', detail: `පරිශීලක ${username} ගේ තොරතුරු සංස්කරණය කරන ලදී` });
        showToast('✅ පරිශීලක තොරතුරු සුරැකින ලදී', 'success');
        $('edit-user-modal').classList.remove('active');
        loadAdminPanel();
    } catch (e) {
        Auth._showAuthError(errEl, 'සුරැකීමට අසමත් විය: ' + e);
    }
}

async function changeMyPassword() {
    const errEl = document.getElementById('cp-error');
    const current = document.getElementById('cp-current')?.value;
    const newPwd = document.getElementById('cp-new')?.value;
    const confirm = document.getElementById('cp-confirm')?.value;
    if (!current) { Auth._showAuthError(errEl, 'වර්තමාන මුරපදය ඇතුළු කරන්න'); return; }
    if (!newPwd || newPwd.length < 4) { Auth._showAuthError(errEl, 'නව මුරපදය අවම අකුරු 4ක් විය යුතුය'); return; }
    if (newPwd !== confirm) { Auth._showAuthError(errEl, 'නව මුරපද ගැළපෙන්නේ නැත'); return; }
    // Verify current
    const verified = await db.verifyUser(Auth.currentUser.username, current);
    if (!verified) { Auth._showAuthError(errEl, 'වර්තමාන මුරපදය වැරදිය'); return; }
    try {
        await db.changePassword(Auth.currentUser.id, newPwd);
        ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        db.addLog({ username: Auth.currentUser.username, action: 'edit', detail: 'මුරපදය වෙනස් කරන ලදී' });
        showToast('✅ මුරපදය සාර්ථකව වෙනස් කරන ලදී', 'success');
    } catch (e) { Auth._showAuthError(errEl, 'දෝෂයකි: ' + e); }
}

/* ─── State ─── */
const App = {
    currentEditId: null,
    members: [],           // [{id, label, data:{...all tabs...}}]
    activeMemberIdx: 0,    // 0 = head of household
    activeTab: 0,
    tabCount: 9,
};

/* ─── DOM Helpers ─── */
const $ = id => document.getElementById(id);
const $$ = s => document.querySelectorAll(s);

function showToast(msg, type = 'success') {
    const container = $('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
}

function showConfirm(title, message, onConfirm) {
    $('confirm-title').textContent = title;
    $('confirm-message').textContent = message;
    $('confirm-dialog').classList.add('active');
    $('confirm-yes').onclick = () => {
        $('confirm-dialog').classList.remove('active');
        onConfirm();
    };
    $('confirm-no').onclick = () => $('confirm-dialog').classList.remove('active');
}

/* ─── Validation ─── */
const Validators = {
    nic(val) {
        if (!val) return false;
        return /^[0-9]{9}[vVxX]$/.test(val) || /^[0-9]{12}$/.test(val);
    },
    phone(val) {
        if (!val) return true; // optional
        return /^0[0-9]{9}$/.test(val);
    },
    required(val) {
        return val !== null && val !== undefined && String(val).trim() !== '';
    },
    ageResidency(dob, years) {
        if (!dob || !years) return true;
        const age = Math.floor((new Date() - new Date(dob)) / (365.25 * 24 * 3600 * 1000));
        return parseInt(years) <= age;
    }
};

function setFieldState(fieldId, isValid, errorMsg) {
    const field = $(fieldId);
    const error = $(`${fieldId}-error`);
    if (!field) return;
    field.classList.toggle('error', !isValid);
    field.classList.toggle('success', isValid && field.value !== '');
    if (error) {
        error.style.display = isValid ? 'none' : 'block';
        if (!isValid && errorMsg) error.textContent = errorMsg;
    }
}

function validateField(fieldId, value, rules) {
    for (const rule of rules) {
        if (rule.type === 'required' && !Validators.required(value)) {
            setFieldState(fieldId, false, rule.msg || 'අනිවාර්ය ක්ෂේත්‍රය');
            return false;
        }
        if (rule.type === 'nic' && value && !Validators.nic(value)) {
            setFieldState(fieldId, false, rule.msg || 'වලංගු නොවන හැඳුනුම්පත් අංකයකි (9+V/X හෝ 12 ඉලක්කම්)');
            return false;
        }
        if (rule.type === 'phone' && !Validators.phone(value)) {
            setFieldState(fieldId, false, rule.msg || 'දුරකථන අංකය 0 න් ආරම්භ කර ඉලක්කම් 10ක් තිබිය යුතුය');
            return false;
        }
    }
    setFieldState(fieldId, true);
    return true;
}

/* ─── Tab Navigation ─── */
function switchTab(idx) {
    App.activeTab = idx;
    $$('.tab-btn').forEach((btn, i) => btn.classList.toggle('active', i === idx));
    $$('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
    updateProgress();
    // Scroll tab button into view
    const activeBtn = document.querySelectorAll('.tab-btn')[idx];
    if (activeBtn) activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

function updateProgress() {
    const pct = Math.round(((App.activeTab + 1) / App.tabCount) * 100);
    $('progress-fill').style.width = pct + '%';
    $('progress-text').textContent = `පියවර ${App.activeTab + 1} / ${App.tabCount}`;
}

function nextTab() {
    if (App.activeTab < App.tabCount - 1) switchTab(App.activeTab + 1);
}
function prevTab() {
    if (App.activeTab > 0) switchTab(App.activeTab - 1);
}

/* ─── Member Management ─── */
function initMembers() {
    App.members = [{ id: 0, label: 'ගෙදර මූලිකයා', data: {} }];
    App.activeMemberIdx = 0;
    renderMemberTabs();
}

function addMember() {
    const idx = App.members.length;
    App.members.push({ id: idx, label: `සාමාජිකයා ${idx}`, data: {} });
    renderMemberTabs();
    switchMember(idx);
}

function removeMember(idx) {
    if (idx === 0) return; // cannot remove head
    App.members.splice(idx, 1);
    // Re-label
    App.members.forEach((m, i) => {
        if (i > 0) m.label = `සාමාජිකයා ${i}`;
    });
    App.activeMemberIdx = Math.min(App.activeMemberIdx, App.members.length - 1);
    renderMemberTabs();
    switchMember(App.activeMemberIdx);
}

function switchMember(idx) {
    // Save current member data before switching
    if (App.members[App.activeMemberIdx]) {
        App.members[App.activeMemberIdx].data = collectFormData();
    }
    App.activeMemberIdx = idx;
    fillFormData(App.members[idx].data || {});
    renderMemberTabs();
}

function renderMemberTabs() {
    const container = $('member-tabs');
    container.innerHTML = '';
    App.members.forEach((m, i) => {
        const btn = document.createElement('button');
        btn.className = `member-tab-btn${i === App.activeMemberIdx ? ' active' : ''}`;
        btn.textContent = m.label;
        btn.onclick = () => switchMember(i);
        // Remove button (not for head)
        if (i > 0) {
            const rmBtn = document.createElement('span');
            rmBtn.innerHTML = ' ✕';
            rmBtn.style.cssText = 'margin-left:4px;cursor:pointer;opacity:0.6;font-size:10px;';
            rmBtn.onclick = (e) => { e.stopPropagation(); removeMember(i); };
            btn.appendChild(rmBtn);
        }
        container.appendChild(btn);
    });
    // Add button
    const addBtn = document.createElement('button');
    addBtn.className = 'add-member-btn';
    addBtn.innerHTML = '+ සාමාජිකයෙකු එකතු කරන්න';
    addBtn.onclick = addMember;
    container.appendChild(addBtn);
}

/* ─── Data Collection ─── */
function getFieldValue(fieldId) {
    const el = $(fieldId);
    if (!el) return null;
    if (el.type === 'checkbox') return el.checked;
    return el.value;
}

function getRadioValue(name) {
    const el = document.querySelector(`input[name="${name}"]:checked`);
    return el ? el.value : null;
}

function getCheckboxValues(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(e => e.value);
}

function getLandRows() {
    const rows = [];
    document.querySelectorAll('#land-rows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input, select');
        if (inputs.length) {
            rows.push({
                type: inputs[0]?.value,
                number: inputs[1]?.value,
                extent: inputs[2]?.value,
                unit: inputs[3]?.value,
                use: inputs[4]?.value,
            });
        }
    });
    return rows;
}

function getLivestockRows() {
    const rows = [];
    document.querySelectorAll('#livestock-rows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input, select');
        if (inputs.length) {
            rows.push({
                type: inputs[0]?.value,
                female: inputs[1]?.value,
                male: inputs[2]?.value,
            });
        }
    });
    return rows;
}

function getVehicleRows() {
    const rows = [];
    document.querySelectorAll('#vehicle-rows tr').forEach(tr => {
        const inputs = tr.querySelectorAll('input, select');
        if (inputs.length) {
            rows.push({
                type: inputs[0]?.value,
                number: inputs[1]?.value,
                ownership: inputs[2]?.value,
            });
        }
    });
    return rows;
}

function collectFormData() {
    return {
        // Tab 1 - Personal
        fullName: getFieldValue('fullName'),
        address: getFieldValue('address'),
        phoneMobile: getFieldValue('phoneMobile'),
        phoneOffice: getFieldValue('phoneOffice'),
        phoneWhatsapp: getFieldValue('phoneWhatsapp'),
        email: getFieldValue('email'),
        tin: getFieldValue('tin'),
        nic: getFieldValue('nic'),
        gender: getRadioValue('gender'),
        dob: getFieldValue('dob'),
        religion: getFieldValue('religion'),
        ethnicity: getFieldValue('ethnicity'),
        maritalStatus: getRadioValue('maritalStatus'),
        residencyType: getRadioValue('residencyType'),
        residencyYears: getFieldValue('residencyYears'),
        citizenship: getRadioValue('citizenship'),
        // Location
        latitude: getFieldValue('latitude'),
        longitude: getFieldValue('longitude'),
        mapsUrl: getFieldValue('mapsUrl'),
        gpsAccuracy: getFieldValue('gpsAccuracy'),
        // Tab 2 - Education
        eduLevel: getFieldValue('eduLevel'),
        eduStatus: getRadioValue('eduStatus'),
        eduInstitutionType: getRadioValue('eduInstitutionType'),
        eduInstitution: getFieldValue('eduInstitution'),
        // Tab 3 - Economic
        employmentType: getRadioValue('employmentType'),
        employmentNature: getFieldValue('employmentNature'),
        employmentLocation: getFieldValue('employmentLocation'),
        employmentOrganization: getFieldValue('employmentOrganization'),
        employmentPosition: getFieldValue('employmentPosition'),
        employmentSalary: getFieldValue('employmentSalary'),
        businessRegistered: getRadioValue('businessRegistered'),
        businessRegNo: getFieldValue('businessRegNo'),
        businessEmployees: getFieldValue('businessEmployees'),
        foreignCountry: getFieldValue('foreignCountry'),
        loanDetails: getFieldValue('loanDetails'),
        mortgageDetails: getFieldValue('mortgageDetails'),
        // Tab 4 - Assets
        landRows: getLandRows(),
        vehicleRows: getVehicleRows(),
        cropNature: getCheckboxValues('cropNature'),
        livestockRows: getLivestockRows(),
        equipment: getFieldValue('equipment'),
        // Tab 5 - State Aid
        stateAid: {
            aswasuma: $('aid-aswasuma')?.checked,
            elders: $('aid-elders')?.checked,
            mahajanadara: $('aid-mahajanadara')?.checked,
            mahapola: $('aid-mahapola')?.checked,
            scholarship5: $('aid-scholarship5')?.checked,
            medical: $('aid-medical')?.checked,
            disability: $('aid-disability')?.checked,
            aswasumaAmount: getFieldValue('aid-aswasuma-amt'),
            eldersAmount: getFieldValue('aid-elders-amt'),
            mahajanadaraAmount: getFieldValue('aid-mahajanadara-amt'),
            mahopolaAmount: getFieldValue('aid-mahapola-amt'),
            scholarship5Amount: getFieldValue('aid-scholarship5-amt'),
            medicalAmount: getFieldValue('aid-medical-amt'),
            disabilityAmount: getFieldValue('aid-disability-amt'),
        },
        // Tab 6 - Income/Expenditure
        incSalary: getFieldValue('inc-salary'),
        incProfit: getFieldValue('inc-profit'),
        incGarden: getFieldValue('inc-garden'),
        incGovtAid: getFieldValue('inc-govt-aid'),
        incOther: getFieldValue('inc-other'),
        incTotal: getFieldValue('inc-total'),
        expFood: getFieldValue('exp-food'),
        expTransport: getFieldValue('exp-transport'),
        expHealth: getFieldValue('exp-health'),
        expEducation: getFieldValue('exp-education'),
        expLoan: getFieldValue('exp-loan'),
        expSavings: getFieldValue('exp-savings'),
        expTotal: getFieldValue('exp-total'),
        // Tab 7 - Health
        chronicDisease: getRadioValue('chronicDisease'),
        chronicTreatment: getRadioValue('chronicTreatment'),
        otherDisease: getFieldValue('otherDisease'),
        disabled: getRadioValue('disabled'),
        disabilityType: getFieldValue('disabilityType'),
        disabilityCause: getRadioValue('disabilityCause'),
        healthExpense: getFieldValue('healthExpense'),
        lowBirthWeight: getRadioValue('lowBirthWeight'),
        // Tab 8 - Housing
        roofType: getRadioValue('roofType'),
        floorType: getRadioValue('floorType'),
        waterSource: getRadioValue('waterSource'),
        fuelType: getCheckboxValues('fuelType'),
        hasLandPhone: getRadioValue('hasLandPhone'),
        hasInternet: getRadioValue('hasInternet'),
        hasComputer: getRadioValue('hasComputer'),
        hasElectricity: getRadioValue('hasElectricity'),
        unsafeNature: getFieldValue('unsafeNature'),
        // Tab 9 - MOH Clinics
        vaccines: getCheckboxValues('vaccines'),
        attendedSuwanaari: getRadioValue('attendedSuwanaari'),
        suwanaariLastVisit: getFieldValue('suwanaariLastVisit'),
        suwanaariDetails: getFieldValue('suwanaariDetails'),
    };
}

/* ─── Fill Form ─── */
function setFieldValue(fieldId, value) {
    const el = $(fieldId);
    if (!el || value === null || value === undefined) return;
    if (el.type === 'checkbox') { el.checked = !!value; return; }
    el.value = value;
}

function setRadioValue(name, value) {
    if (!value) return;
    const el = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (el) el.checked = true;
}

function setCheckboxValues(name, values) {
    if (!values || !Array.isArray(values)) return;
    document.querySelectorAll(`input[name="${name}"]`).forEach(el => {
        el.checked = values.includes(el.value);
    });
}

function fillFormData(d) {
    if (!d || Object.keys(d).length === 0) {
        // Clear form
        $$('input:not([type="radio"]):not([type="checkbox"]), select, textarea').forEach(el => el.value = '');
        $$('input[type="radio"], input[type="checkbox"]').forEach(el => el.checked = false);
        clearDynamicRows();
        return;
    }
    // Tab 1
    setFieldValue('fullName', d.fullName);
    setFieldValue('address', d.address);
    setFieldValue('phoneMobile', d.phoneMobile);
    setFieldValue('phoneOffice', d.phoneOffice);
    setFieldValue('phoneWhatsapp', d.phoneWhatsapp);
    setFieldValue('email', d.email);
    setFieldValue('tin', d.tin);
    setFieldValue('nic', d.nic);
    setRadioValue('gender', d.gender);
    setFieldValue('dob', d.dob);
    setFieldValue('religion', d.religion);
    setFieldValue('ethnicity', d.ethnicity);
    setRadioValue('maritalStatus', d.maritalStatus);
    setRadioValue('residencyType', d.residencyType);
    setFieldValue('residencyYears', d.residencyYears);
    setRadioValue('citizenship', d.citizenship);
    // Location
    setFieldValue('latitude', d.latitude);
    setFieldValue('longitude', d.longitude);
    setFieldValue('mapsUrl', d.mapsUrl);
    setFieldValue('gpsAccuracy', d.gpsAccuracy);
    updateMapLink();
    // Tab 2
    setFieldValue('eduLevel', d.eduLevel);
    setRadioValue('eduStatus', d.eduStatus);
    setRadioValue('eduInstitutionType', d.eduInstitutionType);
    setFieldValue('eduInstitution', d.eduInstitution);
    updateEduConditional();
    // Tab 3
    setRadioValue('employmentType', d.employmentType);
    setFieldValue('employmentNature', d.employmentNature);
    setFieldValue('employmentLocation', d.employmentLocation);
    setFieldValue('employmentOrganization', d.employmentOrganization);
    setFieldValue('employmentPosition', d.employmentPosition);
    setFieldValue('employmentSalary', d.employmentSalary);
    setRadioValue('businessRegistered', d.businessRegistered);
    setFieldValue('businessRegNo', d.businessRegNo);
    setFieldValue('businessEmployees', d.businessEmployees);
    setFieldValue('foreignCountry', d.foreignCountry);
    setFieldValue('loanDetails', d.loanDetails);
    setFieldValue('mortgageDetails', d.mortgageDetails);
    // Tab 4
    clearDynamicRows();
    if (d.landRows) d.landRows.forEach(r => addLandRow(r));
    if (d.vehicleRows) d.vehicleRows.forEach(r => addVehicleRow(r));
    if (d.livestockRows) d.livestockRows.forEach(r => addLivestockRow(r));
    setCheckboxValues('cropNature', d.cropNature);
    setFieldValue('equipment', d.equipment);
    // Tab 5
    const sa = d.stateAid || {};
    if ($('aid-aswasuma')) $('aid-aswasuma').checked = !!sa.aswasuma;
    if ($('aid-elders')) $('aid-elders').checked = !!sa.elders;
    if ($('aid-mahajanadara')) $('aid-mahajanadara').checked = !!sa.mahajanadara;
    if ($('aid-mahapola')) $('aid-mahapola').checked = !!sa.mahapola;
    if ($('aid-scholarship5')) $('aid-scholarship5').checked = !!sa.scholarship5;
    if ($('aid-medical')) $('aid-medical').checked = !!sa.medical;
    if ($('aid-disability')) $('aid-disability').checked = !!sa.disability;
    setFieldValue('aid-aswasuma-amt', sa.aswasumaAmount);
    setFieldValue('aid-elders-amt', sa.eldersAmount);
    setFieldValue('aid-mahajanadara-amt', sa.mahajanadaraAmount);
    setFieldValue('aid-mahapola-amt', sa.mahopolaAmount);
    setFieldValue('aid-scholarship5-amt', sa.scholarship5Amount);
    setFieldValue('aid-medical-amt', sa.medicalAmount);
    setFieldValue('aid-disability-amt', sa.disabilityAmount);
    // Tab 6
    setFieldValue('inc-salary', d.incSalary);
    setFieldValue('inc-profit', d.incProfit);
    setFieldValue('inc-garden', d.incGarden);
    setFieldValue('inc-govt-aid', d.incGovtAid);
    setFieldValue('inc-other', d.incOther);
    setFieldValue('exp-food', d.expFood);
    setFieldValue('exp-transport', d.expTransport);
    setFieldValue('exp-health', d.expHealth);
    setFieldValue('exp-education', d.expEducation);
    setFieldValue('exp-loan', d.expLoan);
    setFieldValue('exp-savings', d.expSavings);
    calcIncome(); calcExpenditure();
    // Tab 7
    setRadioValue('chronicDisease', d.chronicDisease);
    setRadioValue('chronicTreatment', d.chronicTreatment);
    setFieldValue('otherDisease', d.otherDisease);
    setRadioValue('disabled', d.disabled);
    setFieldValue('disabilityType', d.disabilityType);
    setRadioValue('disabilityCause', d.disabilityCause);
    setFieldValue('healthExpense', d.healthExpense);
    setRadioValue('lowBirthWeight', d.lowBirthWeight);
    // Tab 8
    setRadioValue('roofType', d.roofType);
    setRadioValue('floorType', d.floorType);
    setRadioValue('waterSource', d.waterSource);
    setCheckboxValues('fuelType', d.fuelType);
    setRadioValue('hasLandPhone', d.hasLandPhone);
    setRadioValue('hasInternet', d.hasInternet);
    setRadioValue('hasComputer', d.hasComputer);
    setRadioValue('hasElectricity', d.hasElectricity);
    setFieldValue('unsafeNature', d.unsafeNature);
    // Tab 9
    setCheckboxValues('vaccines', d.vaccines);
    setRadioValue('attendedSuwanaari', d.attendedSuwanaari);
    setFieldValue('suwanaariLastVisit', d.suwanaariLastVisit);
    setFieldValue('suwanaariDetails', d.suwanaariDetails);
}

/* ─── Dynamic Rows ─── */
function clearDynamicRows() {
    const lr = $('land-rows'); if (lr) lr.innerHTML = '';
    const vr = $('vehicle-rows'); if (vr) vr.innerHTML = '';
    const ls = $('livestock-rows'); if (ls) ls.innerHTML = '';
}

function addLandRow(data = {}) {
    const tbody = $('land-rows');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><select class="form-control">
            <option value="">-- තෝරන්න --</option>
            <option value="sinnakkara" ${data.type === 'sinnakkara' ? 'selected' : ''}>සින්නකර</option>
            <option value="swarnabhoomi" ${data.type === 'swarnabhoomi' ? 'selected' : ''}>ස්වර්ණ භූමි</option>
            <option value="jayabhoomi" ${data.type === 'jayabhoomi' ? 'selected' : ''}>ජය භූමි</option>
            <option value="permit" ${data.type === 'permit' ? 'selected' : ''}>බල පත්‍ර</option>
            <option value="encroach" ${data.type === 'encroach' ? 'selected' : ''}>අනවසර</option>
        </select></td>
        <td><input type="text" class="form-control" placeholder="අංකය" value="${data.number || ''}"></td>
        <td><input type="number" class="form-control" placeholder="ප්‍රමාණය" step="0.01" value="${data.extent || ''}"></td>
        <td><select class="form-control">
            <option value="acres" ${data.unit === 'acres' ? 'selected' : ''}>අක්කර</option>
            <option value="perches" ${data.unit === 'perches' ? 'selected' : ''}>පර්ච</option>
            <option value="hectares" ${data.unit === 'hectares' ? 'selected' : ''}>හෙක්ටයාර්</option>
        </select></td>
        <td><select class="form-control">
            <option value="" ${!data.use ? 'selected' : ''}>-- තෝරන්න --</option>
            <option value="construction" ${data.use === 'construction' ? 'selected' : ''}>ඉදිකිරීම්</option>
            <option value="agriculture" ${data.use === 'agriculture' ? 'selected' : ''}>වගාව</option>
        </select></td>
        <td><button type="button" class="remove-row-btn" onclick="this.closest('tr').remove()">✕</button></td>`;
    tbody.appendChild(tr);
}

function addVehicleRow(data = {}) {
    const tbody = $('vehicle-rows');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><select class="form-control">
            <option value="">-- තෝරන්න --</option>
            <option value="car" ${data.type === 'car' ? 'selected' : ''}>මෝටර් රථ</option>
            <option value="motorbike" ${data.type === 'motorbike' ? 'selected' : ''}>යතුරු පැදි</option>
            <option value="threewheeler" ${data.type === 'threewheeler' ? 'selected' : ''}>ත්‍රීරෝද රථ</option>
            <option value="lorry" ${data.type === 'lorry' ? 'selected' : ''}>ලොරි</option>
            <option value="van" ${data.type === 'van' ? 'selected' : ''}>වෑන්</option>
            <option value="tractor" ${data.type === 'tractor' ? 'selected' : ''}>ට්‍රැක්ටර්</option>
        </select></td>
        <td><input type="text" class="form-control" placeholder="අංකය" value="${data.number || ''}"></td>
        <td><select class="form-control">
            <option value="own" ${data.ownership === 'own' ? 'selected' : ''}>තමාගේ</option>
            <option value="lease" ${data.ownership === 'lease' ? 'selected' : ''}>ලීස්</option>
            <option value="loan" ${data.ownership === 'loan' ? 'selected' : ''}>ණය</option>
        </select></td>
        <td><button type="button" class="remove-row-btn" onclick="this.closest('tr').remove()">✕</button></td>`;
    tbody.appendChild(tr);
}

function addLivestockRow(data = {}) {
    const tbody = $('livestock-rows');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td><select class="form-control">
            <option value="">-- තෝරන්න --</option>
            <option value="cattle" ${data.type === 'cattle' ? 'selected' : ''}>ගව පාලනය</option>
            <option value="poultry" ${data.type === 'poultry' ? 'selected' : ''}>කුකුළු පාලනය</option>
            <option value="pigs" ${data.type === 'pigs' ? 'selected' : ''}>ඌරන් පාලනය</option>
            <option value="fish" ${data.type === 'fish' ? 'selected' : ''}>විසිතුරු මාළු</option>
            <option value="quail" ${data.type === 'quail' ? 'selected' : ''}>වටු කුරුළු</option>
        </select></td>
        <td><input type="number" class="form-control" placeholder="ගැහැණු" min="0" value="${data.female || ''}"></td>
        <td><input type="number" class="form-control" placeholder="පිරිමි" min="0" value="${data.male || ''}"></td>
        <td><button type="button" class="remove-row-btn" onclick="this.closest('tr').remove()">✕</button></td>`;
    tbody.appendChild(tr);
}

/* ─── Auto Calculations ─── */
function calcIncome() {
    const fields = ['inc-salary', 'inc-profit', 'inc-garden', 'inc-govt-aid', 'inc-other'];
    const total = fields.reduce((sum, id) => sum + (parseFloat(getFieldValue(id)) || 0), 0);
    const el = $('inc-total');
    if (el) el.value = total.toFixed(2);
}

function calcExpenditure() {
    const fields = ['exp-food', 'exp-transport', 'exp-health', 'exp-education', 'exp-loan', 'exp-savings'];
    const total = fields.reduce((sum, id) => sum + (parseFloat(getFieldValue(id)) || 0), 0);
    const el = $('exp-total');
    if (el) el.value = total.toFixed(2);
}

/* ─── Conditional Logic ─── */
function updateEduConditional() {
    const status = getRadioValue('eduStatus');
    const instGroup = $('edu-institution-group');
    if (instGroup) {
        const disabled = status === 'finished';
        instGroup.querySelectorAll('input, select').forEach(el => el.disabled = disabled);
        instGroup.style.opacity = disabled ? '0.4' : '1';
    }
}

/* ─── Form Validation (before save) ─── */
function validateCurrentMemberData() {
    let valid = true;
    const d = collectFormData();

    // Mandatory
    if (!Validators.required(d.fullName)) {
        validateField('fullName', d.fullName, [{ type: 'required', msg: 'සම්පූර්ණ නම ඇතුළත් කරන්න' }]);
        valid = false;
    } else setFieldState('fullName', true);

    if (!Validators.required(d.nic)) {
        validateField('nic', d.nic, [{ type: 'required', msg: 'හැඳුනුම්පත් අංකය ඇතුළත් කරන්න' }]);
        valid = false;
    } else if (!Validators.nic(d.nic)) {
        validateField('nic', d.nic, [{ type: 'nic' }]);
        valid = false;
    } else setFieldState('nic', true);

    if (!Validators.required(d.address)) {
        validateField('address', d.address, [{ type: 'required', msg: 'ලිපිනය ඇතුළත් කරන්න' }]);
        valid = false;
    } else setFieldState('address', true);

    // Phone
    if (d.phoneMobile && !Validators.phone(d.phoneMobile)) {
        validateField('phoneMobile', d.phoneMobile, [{ type: 'phone' }]);
        valid = false;
    }

    // Age vs residency
    if (d.dob && d.residencyYears) {
        if (!Validators.ageResidency(d.dob, d.residencyYears)) {
            showToast('පදිංචි කාලය වයසට වඩා වැඩිය. නිවැරදි කරන්න.', 'error');
            valid = false;
        }
    }

    if (!valid) switchTab(0);
    return valid;
}

/* ─── Save / Update ─── */
async function saveRecord() {
    // Save current member's data first
    App.members[App.activeMemberIdx].data = collectFormData();

    // Validate head of household
    const headData = App.members[0].data;
    if (!Validators.required(headData.fullName) || !Validators.required(headData.nic) || !Validators.required(headData.address)) {
        if (!validateCurrentMemberData()) return;
    }

    const familyRecord = {
        headOfHousehold: App.members[0].data,
        members: App.members.slice(1).map(m => m.data),
        createdBy: Auth.currentUser?.username,
    };

    try {
        if (App.currentEditId) {
            familyRecord.id = App.currentEditId;
            await db.updateFamily(familyRecord);
            db.addLog({ username: Auth.currentUser?.username, action: 'edit', detail: `${headData.fullName} (ID:${App.currentEditId}) සංස්කරණය` });
            showToast('වාර්තාව සාර්ථකව යාවත්කාලීන කරන ලදී ✓', 'success');
        } else {
            const newId = await db.saveFamily(familyRecord);
            db.addLog({ username: Auth.currentUser?.username, action: 'add', detail: `${headData.fullName} නව වාර්තාව (ID:${newId})` });
            showToast('නව වාර්තාව සාර්ථකව සුරකින ලදී ✓', 'success');
        }
        closeModal();
        loadRecords();
        updateStats();
    } catch (err) {
        showToast('දෝෂයක් සිදු විය: ' + err, 'error');
    }
}

/* ─── Open / Close Modal ─── */
function openNewRecord() {
    App.currentEditId = null;
    initMembers();
    fillFormData({});
    clearDynamicRows();
    switchTab(0);
    $('modal-title').textContent = 'නව පවුල් වාර්තාව';
    $('modal-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

async function openEditRecord(id) {
    try {
        const record = await db.getFamily(id);
        if (!record) return;
        App.currentEditId = id;
        App.members = [{ id: 0, label: 'ගෙදර මූලිකයා', data: record.headOfHousehold || {} }];
        (record.members || []).forEach((m, i) => {
            App.members.push({ id: i + 1, label: `සාමාජිකයා ${i + 1}`, data: m });
        });
        App.activeMemberIdx = 0;
        renderMemberTabs();
        fillFormData(record.headOfHousehold || {});
        switchTab(0);
        $('modal-title').textContent = 'වාර්තාව සංස්කරණය කරන්න';
        $('modal-overlay').classList.add('active');
        document.body.style.overflow = 'hidden';
    } catch (err) {
        showToast('වාර්තාව ලබා ගැනීමට අසමත් විය', 'error');
    }
}

function closeModal() {
    $('modal-overlay').classList.remove('active');
    document.body.style.overflow = '';
    App.currentEditId = null;
}

/* ─── Records List ─── */
async function loadRecords(query = '') {
    const records = await db.searchFamilies(query);
    const tbody = $('records-body');
    if (!tbody) return;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8">
            <div class="empty-state">
                <div class="empty-icon">📂</div>
                <p>${query ? 'සෙවූ ප්‍රතිපල නොලැනුණි' : 'මේතෙක් වාර්තා ඇතුලත් කර නොමැත'}</p>
            </div>
        </td></tr>`;
        return;
    }

    tbody.innerHTML = records.map(r => {
        const h = r.headOfHousehold || {};
        const memberCount = (r.members || []).length + 1;
        const hasAid = Object.values(r.headOfHousehold?.stateAid || {}).some(v => v === true);
        const date = r.createdAt ? new Date(r.createdAt).toLocaleDateString('si-LK') : '—';
        const lat = h.latitude; const lng = h.longitude;
        const locCell = (lat && lng)
            ? `<a href="https://www.google.com/maps?q=${lat},${lng}&z=17" target="_blank" title="${lat}, ${lng}" style="color:var(--green);text-decoration:none">📍 ස්ථානය</a>`
            : '<span class="text-muted" style="font-size:11px">—</span>';
        return `<tr>
            <td class="name-cell">${h.fullName || '—'}</td>
            <td><span class="nic-badge">${h.nic || '—'}</span></td>
            <td class="text-sinhala">${h.address || '—'}</td>
            <td style="text-align:center">${memberCount}</td>
            <td style="text-align:center">${locCell}</td>
            <td style="text-align:center">${hasAid ? '<span class="text-green">✔</span>' : '<span class="text-muted">—</span>'}</td>
            <td style="text-align:center" class="text-muted">${date}</td>
            <td>
                <div class="d-flex gap-8">
                    <button class="btn btn-secondary btn-sm" onclick="viewRecord('${r.id}')" title="බලන්න">👁️</button>
                    <button class="btn btn-ghost btn-sm" onclick="openEditRecord('${r.id}')" title="සංස්කරණය">✏️</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteRecord('${r.id}', '${(h.fullName || '').replace(/'/g, "\\'")}')"  >🗑️</button>
                </div>
            </td>
        </tr>`;
    }).join('');
    // Re-apply role-based visibility (hide delete for operators)
    if (Auth.currentUser) Auth._patchDeleteButtons();
}

async function deleteRecord(id, name) {
    if (!Auth.isAdmin()) { showToast('ක්‍රියාව අවසර නැත. Admin නම් ලොගින් කරන්න.', 'error'); return; }
    showConfirm('වාර්තාව මකන්නද?', `"${name}" – පවුලේ සම්පූර්ණ දත්ත ස්ථිරවම ඉවත් කෙරේ.`, async () => {
        try {
            await db.deleteFamily(id);
            db.addLog({ username: Auth.currentUser?.username, action: 'delete', detail: `${name} (ID:${id}) ඉවත් කරන ලදී` });
            showToast('වාර්තාව ඉවත් කරන ලදී', 'info');
            loadRecords();
            updateStats();
        } catch (err) {
            showToast('ඉවත් කිරීමට අසමත් විය', 'error');
        }
    });
}

/* ─── View Record ─── */
async function viewRecord(id) {
    try {
        const record = await db.getFamily(id);
        if (!record) return;
        const h = record.headOfHousehold || {};

        const viewModal = $('view-modal-overlay');
        const viewBody = $('view-modal-body');

        function row(label, value) {
            const v = value !== null && value !== undefined && value !== '' ? value : '—';
            return `<div class="view-field"><div class="view-field-label">${label}</div><div class="view-field-value">${v}</div></div>`;
        }

        viewBody.innerHTML = `
        <div style="display:flex; justify-content:center; margin-bottom:20px; background:white; padding:15px; border-radius:12px; border:2px solid var(--gold);">
            <div id="view-qr-code"></div>
        </div>
        <div class="view-section">
            <div class="view-section-title">👤 පුද්ගල තොරතුරු</div>
            <div class="view-grid">
                ${row('සම්පූර්ණ නම', h.fullName)}
                ${row('හැඳුනුම්පත් අංකය', h.nic)}
                ${row('ලිපිනය', h.address)}
                ${row('ජංගම දුරකථනය', h.phoneMobile)}
                ${row('ස්ත්‍රී/පුරුෂ', h.gender === 'male' ? 'පිරිමි' : h.gender === 'female' ? 'ගැහැණු' : '—')}
                ${row('උපන් දිනය', h.dob)}
                ${row('ආගම', h.religion)}
                ${row('ජාතිය', h.ethnicity)}
                ${row('විවාහක/අවිවාහක', h.maritalStatus === 'married' ? 'විවාහකයා' : h.maritalStatus === 'single' ? 'අවිවාහකයා' : h.maritalStatus || '—')}
                ${row('TIN', h.tin)}
                ${row('ඊ මේල්', h.email)}
            </div>
        </div>
        ${(h.latitude && h.longitude) ? `
        <div class="view-section">
            <div class="view-section-title">📍 ස්ථාන පිහිටීම (Location)</div>
            <div class="view-grid">
                <div class="view-field"><div class="view-field-label">Latitude</div><div class="view-field-value">${h.latitude}</div></div>
                <div class="view-field"><div class="view-field-label">Longitude</div><div class="view-field-value">${h.longitude}</div></div>
                ${h.gpsAccuracy ? `<div class="view-field"><div class="view-field-label">GPS නිරවද්‍යතාව</div><div class="view-field-value">${h.gpsAccuracy}</div></div>` : ''}
                <div class="view-field" style="grid-column:1/-1">
                    <a href="https://www.google.com/maps?q=${h.latitude},${h.longitude}&z=17" target="_blank"
                        class="btn btn-secondary btn-sm" style="display:inline-flex;margin-top:4px">
                        🗺️ Google Maps හි බලන්න
                    </a>
                </div>
            </div>
        </div>` : ''}
        <div class="view-section">
            <div class="view-section-title">🎓 අධ්‍යාපන තොරතුරු</div>
            <div class="view-grid">
                ${row('ඉහළම අධ්‍යාපන මට්ටම', h.eduLevel)}
                ${row('අධ්‍යාපන තත්ත්වය', h.eduStatus === 'studying' ? 'දැනට ලබයි' : 'අවසන්')}
                ${row('ආයතනය', h.eduInstitution)}
            </div>
        </div>
        <div class="view-section">
            <div class="view-section-title">💼 ආර්ථික සහ රැකියා</div>
            <div class="view-grid">
                ${row('රැකියා වර්ගය', h.employmentType)}
                ${row('ආයතනය', h.employmentOrganization)}
                ${row('තනතුර', h.employmentPosition)}
                ${row('වැටුප/', h.employmentSalary)}
                ${row('ණය තොරතුරු', h.loanDetails)}
            </div>
        </div>
        <div class="view-section">
            <div class="view-section-title">💰 ආදායම් සහ වියදම්</div>
            <div class="view-grid">
                ${row('මාසික ආදායම (සම්පූර්ණ)', h.incTotal ? 'රු. ' + h.incTotal : '—')}
                ${row('මාසික වියදම (සම්පූර්ණ)', h.expTotal ? 'රු. ' + h.expTotal : '—')}
            </div>
        </div>
        <div class="view-section">
            <div class="view-section-title">🏥 සෞඛ්‍ය</div>
            <div class="view-grid">
                ${row('නිදන්ගත රෝගය', h.chronicDisease === 'yes' ? 'ඇත' : 'නැත')}
                ${row('ආබාධිතයිද?', h.disabled === 'yes' ? 'ඔව්' : 'නැත')}
            </div>
        </div>
        <div class="view-section">
            <div class="view-section-title">🏠 නිවාස</div>
            <div class="view-grid">
                ${row('වහල', h.roofType)}
                ${row('ජල ලැබීම', h.waterSource)}
                ${row('විදුලිය', h.hasElectricity === 'yes' ? 'ඇත' : 'නැත')}
            </div>
        </div>
        <div class="view-section">
            <div class="view-section-title">💉 සෞඛ්‍ය සායන (MOH Clinics)</div>
            <div class="view-grid">
                ${row('ලබාගෙන ඇති එන්නත්', h.vaccines && h.vaccines.length ? h.vaccines.join(', ') : 'නැත')}
                ${row('සුවනාරි සායනයට සහභාගී වී තිබේද?', h.attendedSuwanaari === 'yes' ? 'ඔව්' : 'නැත')}
                ${row('අවසාන වරට සහභාගී වූ දිනය', h.suwanaariLastVisit)}
                ${row('සුවනාරි සායනයෙන් හඳුනාගත් තොරතුරු', h.suwanaariDetails)}
            </div>
        </div>
        ${record.members?.length ? `
        <div class="view-section">
            <div class="view-section-title">👨‍👩‍👧‍👦 පවුලේ සාමාජිකයන් (${record.members.length})</div>
            ${record.members.map((m, i) => `<div class="view-field"><div class="view-field-label">සාමාජිකයා ${i + 1}</div><div class="view-field-value">${m.fullName || '—'} ${m.nic ? '(' + m.nic + ')' : ''}</div></div>`).join('')}
        </div>` : ''}`;

        viewModal.classList.add('active');

        // Generate QR Code
        const qrContainer = $('view-qr-code');
        qrContainer.innerHTML = '';

        // Fix for local file protocol where origin is 'null'
        const baseUrl = window.location.href.split('?')[0].split('#')[0];
        const viewUrl = baseUrl + "?view=" + id;

        new QRCode(qrContainer, {
            text: viewUrl,
            width: 160,
            height: 160,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // Set up print button
        const printBtn = $('view-modal-print-btn');
        printBtn.onclick = () => printRecord(record);

        const editBtn = $('view-modal-edit-btn');
        editBtn.onclick = () => { viewModal.classList.remove('active'); openEditRecord(id); };

    } catch (e) {
        console.error(e);
        showToast('වාර්තාව බැලීමේදී දෝෂයක් සිදු විය', 'error');
    }
}

async function printRecord(record) {
    const h = record.headOfHousehold || {};
    const printContainer = $('qr-print-temp');
    $('print-name').textContent = h.fullName || 'නමක් නැත';
    $('print-nic').textContent = 'NIC: ' + (h.nic || '—');

    const qrPrintCont = $('print-qr-container');
    qrPrintCont.innerHTML = '';

    // Fix for local file protocol
    const baseUrl = window.location.href.split('?')[0].split('#')[0];
    const viewUrl = baseUrl + "?view=" + record.id;

    new QRCode(qrPrintCont, {
        text: viewUrl,
        width: 200,
        height: 200,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    printContainer.style.display = 'block';
    setTimeout(() => {
        window.print();
        printContainer.style.display = 'none';
    }, 500);
}

async function downloadQR() {
    const qrCanvas = document.querySelector('#view-qr-code canvas');
    if (!qrCanvas) {
        showToast('බාගත කිරීමට QR කේතයක් නොමැත', 'error');
        return;
    }
    const name = $('print-name')?.textContent || 'QR_Code';
    const link = document.createElement('a');
    link.download = `Family_QR_${name}.png`;
    link.href = qrCanvas.toDataURL('image/png');
    link.click();
    showToast('QR කේතය බාගත කරන ලදී', 'success');
}

/* ─── Stats ─── */
async function updateStats() {
    const stats = await db.getStats();
    $('stat-families').textContent = stats.totalFamilies;
    $('stat-members').textContent = stats.totalMembers;
    $('stat-aid').textContent = stats.aidRecipients;
}

/* ─── CSV Export ─── */
async function exportCSV() {
    const records = await db.getAllFamilies();
    if (!records.length) { showToast('නිර්යාත කිරීමට දත්ත නොමැත', 'info'); return; }

    const headers = ['ID', 'සම්පූර්ණ නම', 'හැඳුනුම්පත', 'ලිපිනය', 'ජංගම', 'ස්ත්‍රී/පුරුෂ', 'උපන් දිනය', 'ආගම', 'ජාතිය', 'විවාහ', 'අධ්‍යාපනය', 'රැකියා', 'වැටුප', 'ආදායම (සම්)', 'වියදම (සම්)', 'ආධාර', 'නිදන්ගත රෝගය', 'ආබාධිත', 'මාතෘ/ළමා සහ සුවනාරි සායන', 'සාමාජිකයන්'];
    const rows = records.map(r => {
        const h = r.headOfHousehold || {};
        const sa = h.stateAid || {};
        const aidList = ['aswasuma', 'elders', 'mahajanadara', 'mahapola', 'scholarship5', 'medical', 'disability'].filter(k => sa[k]).join(';');
        return [
            r.id,
            `"${h.fullName || ''}"`,
            h.nic || '',
            `"${h.address || ''}"`,
            h.phoneMobile || '',
            h.gender || '',
            h.dob || '',
            h.religion || '',
            h.ethnicity || '',
            h.maritalStatus || '',
            h.eduLevel || '',
            h.employmentType || '',
            h.employmentSalary || '',
            h.incTotal || '',
            h.expTotal || '',
            `"${aidList}"`,
            h.chronicDisease || '',
            h.disabled || '',
            `"සුවනාරි: ${h.attendedSuwanaari || '-'} | එන්නත්: ${h.vaccines ? h.vaccines.join('|') : '-'}"`,
            (r.members || []).length + 1,
        ].join(',');
    });

    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ahaspokuna_south_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('CSV ගොනුව බාගත කරන ලදී', 'success');
}

/* ─── Backup & Restore ─── */
async function exportBackup() {
    try {
        const jsonStr = await db.exportDatabaseJSON();
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ahaspokuna_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        db.addLog({ username: Auth.currentUser?.username || 'admin', action: 'export', detail: 'සම්පූර්ණ පද්ධති Backup එකක් ලබාගන්නා ලදී' });
        showToast('සම්පූර්ණ Backup ගොනුව බාගත කරන ලදී ✓', 'success');
    } catch (err) {
        showToast('Backup ලබාගැනීමට අසමත් විය: ' + err, 'error');
    }
}

function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!Auth.isAdmin()) {
        showToast('ක්‍රියාව අවසර නැත. Admin පමණයි.', 'error');
        event.target.value = ''; // Reset input
        return;
    }

    showConfirm('Backup එක Restore කරන්නද?', `අවවාදයයි: දැනට පවතින සියලුම දත්ත මකාදැමී මෙම ගොනුවේ ඇති දත්ත පමණක් ඇතුලත් වේ. මෙය ස්ථිරවම සිදුවේ.`, async () => {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const jsonStr = e.target.result;
                    await db.importDatabaseJSON(jsonStr);
                    db.addLog({ username: Auth.currentUser?.username || 'admin', action: 'restore', detail: `පද්ධතිය Backup එකකින් Restore කරන ලදී` });
                    showToast('පද්ධතිය සාර්ථකව Restore කරන ලදී ✓. නැවත පූරණය වෙමින්...', 'success');
                    setTimeout(() => { location.reload(); }, 2000);
                } catch (err) {
                    showToast('Restore අසමත් විය: ' + err.message, 'error');
                }
            };
            reader.readAsText(file);
        } catch (err) {
            showToast('ගොනුව කියවීමට අසමත් විය.', 'error');
        } finally {
            event.target.value = ''; // Reset input to allow triggering same file again if needed
        }
    });
}


/* ─── Location Feature ─── */

function setLocationStatus(msg, type = 'info') {
    const el = $('location-status');
    if (!el) return;
    const colors = { info: 'var(--text-muted)', success: 'var(--green)', error: 'var(--red)', loading: 'var(--gold)' };
    const icons = { info: 'ℹ️', success: '✅', error: '❌', loading: '⏳' };
    el.innerHTML = `<span style="color:${colors[type]}">${icons[type]} ${msg}</span>`;
}

function updateMapLink() {
    const lat = parseFloat($('latitude')?.value);
    const lng = parseFloat($('longitude')?.value);
    const link = $('map-view-link');
    const copyBtn = $('copy-coords-btn');
    if (!link) return;
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        link.href = `https://www.google.com/maps?q=${lat},${lng}&z=17`;
        link.style.display = 'inline-flex';
        if (copyBtn) copyBtn.style.display = 'inline-flex';
    } else {
        link.style.display = 'none';
        if (copyBtn) copyBtn.style.display = 'none';
    }
}

function setLatLng(lat, lng, accuracy = null, source = '') {
    if ($('latitude')) $('latitude').value = parseFloat(lat).toFixed(6);
    if ($('longitude')) $('longitude').value = parseFloat(lng).toFixed(6);
    if ($('gpsAccuracy')) $('gpsAccuracy').value = accuracy ? `± ${Math.round(accuracy)} m` : '';
    updateMapLink();
    if (source) setLocationStatus(source, 'success');
}

function getGPSLocation() {
    if (!navigator.geolocation) {
        setLocationStatus('ඔබේ browser GPS සඳහා සහාය නොදක්වයි', 'error');
        return;
    }
    const btn = $('gps-btn');
    if (btn) { btn.textContent = '⏳ GPS ලබා ගනිමින්...'; btn.disabled = true; }
    setLocationStatus('GPS ස්ථානය ලබා ගනිමින් පවතී... Device GPS enable කරන්න', 'loading');

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            setLatLng(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy,
                `GPS සාර්ථකයි! නිරවද්‍යතාව ± ${Math.round(pos.coords.accuracy)} මීටර්`);
            if ($('mapsUrl')) $('mapsUrl').value =
                `https://www.google.com/maps?q=${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}`;
            if (btn) { btn.textContent = '📡 GPS ලබාගත්තා ✓'; btn.disabled = false; }
        },
        (err) => {
            const msgs = {
                1: 'GPS අවසරය ප්‍රතික්ෂේප කරන ලදී. Browser settings වලින් location allow කරන්න.',
                2: 'GPS ස්ථානය ලබා ගැනීමට නොහැකි විය.',
                3: 'GPS timeout. නැවත උත්සාහ කරන්න.'
            };
            setLocationStatus(msgs[err.code] || 'GPS දෝෂයකි', 'error');
            if (btn) { btn.textContent = '📡 දැනට සිටින ස්ථානය (GPS)'; btn.disabled = false; }
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
}

function parseMapsUrl() {
    const url = ($('mapsUrl')?.value || '').trim();
    if (!url) { setLocationStatus('Google Maps සබැඳිය ඇතුළු කරන්න', 'error'); return; }

    setLocationStatus('URL විශ්ලේෂණය කරමින්...', 'loading');

    // Try all known Google Maps URL patterns
    const patterns = [
        // @lat,lng,zoom  (standard maps URL)
        /@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        // ?q=lat,lng  or  q=lat%2Clng
        /[?&]q=(-?\d+\.?\d*)[,%2C]+(-?\d+\.?\d*)/i,
        // /place/.../lat,lng
        /\/place\/[^@]*@(-?\d+\.?\d*),(-?\d+\.?\d*)/,
        // ll=lat,lng
        /[?&]ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/i,
        // !3d lat !4d lng  (embed URLs)
        /!3d(-?\d+\.?\d*).*?!4d(-?\d+\.?\d*)/,
        // Plain "lat,lng" anywhere (last resort)
        /(-?\d{1,2}\.\d{4,}),\s*(-?\d{2,3}\.\d{4,})/,
    ];

    let matched = false;
    for (const pat of patterns) {
        const m = url.match(pat);
        if (m) {
            const lat = parseFloat(m[1]);
            const lng = parseFloat(m[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                setLatLng(lat, lng, null,
                    `ස්ථානය ලැබුණි: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
                matched = true;
                break;
            }
        }
    }

    if (!matched) {
        // If it looks like a short URL (maps.app.goo.gl), notify user to follow redirect
        if (url.includes('goo.gl') || url.includes('maps.app')) {
            setLocationStatus('කෙටි URL සඳහා: Browser හි open කර, full URL copy කර paste කරන්න. OR Latitude & Longitude manually ඇතුළු කරන්න.', 'info');
        } else {
            setLocationStatus('URL වලින් coordinates ලබා ගැනීමට නොහැකි විය. Latitude/Longitude manually ඇතුළු කරන්න.', 'error');
        }
    }
}

function copyCoords() {
    const lat = $('latitude')?.value;
    const lng = $('longitude')?.value;
    if (!lat || !lng) return;
    const text = `${lat}, ${lng}`;
    navigator.clipboard?.writeText(text).then(() => {
        showToast(`Coordinates පිටපත් කරන ලදී: ${text}`, 'success');
    }).catch(() => {
        // fallback
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta);
        ta.select(); document.execCommand('copy');
        document.body.removeChild(ta);
        showToast(`Copied: ${text}`, 'success');
    });
}

/* ─── Init ─── */
async function init() {
    // Auth system handles: db.open(), first-run setup, login, and
    // calls loadRecords() + updateStats() after successful login.
    await Auth.init();
    initMembers();
    updateProgress();

    // Tab navigation buttons
    $$('.tab-btn').forEach((btn, i) => btn.addEventListener('click', () => switchTab(i)));

    // Search
    $('search-input')?.addEventListener('input', e => loadRecords(e.target.value));

    // Education conditional
    document.querySelectorAll('input[name="eduStatus"]').forEach(el => el.addEventListener('change', updateEduConditional));

    // Auto-calc income
    ['inc-salary', 'inc-profit', 'inc-garden', 'inc-govt-aid', 'inc-other'].forEach(id => {
        $(id)?.addEventListener('input', calcIncome);
    });
    // Auto-calc expenditure
    ['exp-food', 'exp-transport', 'exp-health', 'exp-education', 'exp-loan', 'exp-savings'].forEach(id => {
        $(id)?.addEventListener('input', calcExpenditure);
    });

    // Real-time NIC validation
    $('nic')?.addEventListener('input', e => {
        const v = e.target.value;
        if (v.length >= 10) {
            if (!Validators.nic(v)) {
                setFieldState('nic', false, 'වලංගු නොවන හැඳුනුම්පත් අංකය (9+V/X හෝ ඉලක්කම් 12)');
            } else setFieldState('nic', true);
        }
    });

    // Real-time phone validation
    ['phoneMobile', 'phoneOffice', 'phoneWhatsapp'].forEach(id => {
        $(id)?.addEventListener('blur', e => {
            const v = e.target.value;
            if (v && !Validators.phone(v)) setFieldState(id, false, 'දුරකථන අංකය (0xxxxxxxx)');
            else if (v) setFieldState(id, true);
        });
    });

    // Modal close on overlay click
    $('modal-overlay')?.addEventListener('click', e => {
        if (e.target === $('modal-overlay')) closeModal();
    });
    $('view-modal-overlay')?.addEventListener('click', e => {
        if (e.target === $('view-modal-overlay')) $('view-modal-overlay').classList.remove('active');
    });
}

document.addEventListener('DOMContentLoaded', init);
