const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const cors = require('cors');
const app = express();
app.use(cors({
    origin: [
        'http://localhost:3000', 
        'http://localhost:8501/',
        'http://172.16.37.219:3000/'
    ],
    credentials: true
}));

const port = process.env.PORT || 3000;
const CONFIG = {
    PORT: port,
    MAX_RECIPIENTS_PER_REQUEST: 20,
    MAX_FILES_PER_SCHEDULE: 10,
    ALLOWED_EXTENSIONS: ['.xlsx', '.xls', '.pdf', '.txt', '.jpg', '.jpeg', '.png'],
    VALID_SCHEDULE_MODES: ['CUSTOM', 'DAILY', 'WEEKLY', 'MONTHLY'],
    VALID_STATUS_FILTERS: ['ALL', 'SCHEDULED', 'PROCESSING', 'PARTIAL', 'SENT', 'FAILED', 'CANCELLED'],
    DELETE_SENT_AFTER_DAYS: 100
};

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const SCHEDULED_UPLOAD_DIR = path.join(UPLOAD_DIR, 'scheduled');
const SEND_NOW_UPLOAD_DIR = path.join(UPLOAD_DIR, 'send-now');
const DATA_DIR = path.join(__dirname, 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedules.json');
const NUMBER_LIST_FILE = path.join(DATA_DIR, 'whatsapp_numbers.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

[UPLOAD_DIR, SCHEDULED_UPLOAD_DIR, SEND_NOW_UPLOAD_DIR, DATA_DIR].forEach(d => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
if (!fs.existsSync(SCHEDULE_FILE)) fs.writeFileSync(SCHEDULE_FILE, '[]');
if (!fs.existsSync(NUMBER_LIST_FILE)) fs.writeFileSync(NUMBER_LIST_FILE, '[]');
if (!fs.existsSync(USERS_FILE)) 
    fs.writeFileSync(USERS_FILE, JSON.stringify([{ username: 'admin', password: 'admin@123', displayName: 'Administrator', role: 'admin' }], null, 2));

const { clients, clientStatus, qrStore } = require('./whatsapp-store');
const whatsAppService = require('./whatsapp.service');
const fileService = require('./file-resolver.service');
const mathService = require('./scheduler-math');

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'whatsapp-scheduler-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

const loadUsers = () => { try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) { return []; } };

const PUBLIC_PATHS = ['/login', '/auth/login', '/login.html'];

// app.use((req, res, next) => {
//     if (PUBLIC_PATHS.includes(req.path)) return next();
//     if (req.session && req.session.user) return next();
//     // Allow static assets (css/js/images) on the login page itself
//     const ext = path.extname(req.path);
//     if (ext && ['.css','.js','.png','.jpg','.ico','.svg','.woff','.woff2'].includes(ext)) return next();
//     if (req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))) {
//         return res.status(401).json({ success: false, error: 'Session expired. Please log in again.', redirect: '/login' });
//     }
//     return res.redirect('/login');
// });

app.use((req, res, next) => {
    if (PUBLIC_PATHS.includes(req.path) || 
        req.path.startsWith('/groups/') || 
        req.path.startsWith('/contacts/') || 
        req.path.startsWith('/api/') || 
        (req.session && req.session.user)) 
        return next();

    if (req.session && req.session.user)
        return next();

    return res.redirect('/login');
});
app.use(express.static('public'));

app.get('/login', (req, res) => {
    if (req.session && req.session.user) return res.redirect('/');
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.json({ success: false, error: 'Username and password are required.' });

    const users = loadUsers();
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.json({ success: false, error: 'Invalid username or password.' });

    req.session.user = { username: user.username, displayName: user.displayName, role: user.role };
    console.log(`[Auth] User "${user.username}" logged in successfully.`);
    res.json({ success: true, user: req.session.user });
});

app.get('/auth/logout', (req, res) => {
    const who = req.session.user ? req.session.user.username : 'unknown';
    req.session.destroy(() => {
        console.log(`[Auth] User "${who}" logged out.`);
        res.redirect('/login');
    });
});

app.get('/auth/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ success: false });
    res.json({ success: true, user: req.session.user });
});

function createStorage(fPath) {
    return multer.diskStorage({
        destination: (req, file, cb) => cb(null, fPath),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`)
    });
}

function uploadFileFilter(req, file, cb) {
    cb(null, CONFIG.ALLOWED_EXTENSIONS.includes(path.extname(file.originalname).toLowerCase()));
}

const uploadSendNow = multer({ storage: createStorage(SEND_NOW_UPLOAD_DIR), limits: { fileSize: 50 * 1024 * 1024, files: CONFIG.MAX_FILES_PER_SCHEDULE }, fileFilter: uploadFileFilter });
const uploadScheduled = multer({ storage: createStorage(SCHEDULED_UPLOAD_DIR), limits: { fileSize: 50 * 1024 * 1024, files: CONFIG.MAX_FILES_PER_SCHEDULE }, fileFilter: uploadFileFilter });

const loadJson = (file, def) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8') || JSON.stringify(def)); } catch(e) { return def; }
};
const saveJson = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const deleteFileSafe = (f) => { try { if (f && fs.existsSync(f)) fs.unlinkSync(f); } catch (e) {} };

function parsePhoneNumbers(input) {
    return String(input || '').split(/[\n,;]+/).map(p => p.trim()).filter(Boolean)
        .map(p => p.endsWith('@g.us') ? p : p.replace(/\D/g, ''))
        .filter(p => p.endsWith('@g.us') || p.length >= 10)
        .filter((p, i, a) => a.indexOf(p) === i);
}

const validatePhoneLimit = (list) => {
    if (!list || list.length === 0) return 'Please enter communication target phone numbers or Group IDs.';
    if (list.length > CONFIG.MAX_RECIPIENTS_PER_REQUEST) return `Density threshold limit breach. Maximum ${CONFIG.MAX_RECIPIENTS_PER_REQUEST} records are supported.`;
    return null;
};

const normalizePhoneFileMap = (map) => {
    const res = {};
    if (map && typeof map === 'object') {
        Object.keys(map).forEach(k => {
            const nk = k.trim().endsWith('@g.us') ? k.trim() : k.replace(/\D/g, '');
            if (nk) res[nk] = String(map[k]).trim();
        });
    }
    return res;
};

const getMappedFilesForPhone = (map, p) => {
    const cleanK = p.trim().endsWith('@g.us') ? p.trim() : p.replace(/\D/g, '');
    return map[cleanK] ? [map[cleanK]] : null;
};

const loadSchedules = () => loadJson(SCHEDULE_FILE, []);
const saveSchedules = (s) => saveJson(SCHEDULE_FILE, s);
const loadNumberList = () => loadJson(NUMBER_LIST_FILE, []);
const saveNumberList = (n) => saveJson(NUMBER_LIST_FILE, parsePhoneNumbers((n || []).join('\n')));

const HELPERS = {
    sleep: (ms) => new Promise(r => setTimeout(r, ms)),
    normalizePhoneFileMap,
    getMappedFilesForPhone
};

app.post('/api/whatsapp/init/:userId', (req, res) => {
    whatsAppService.initWhatsAppClient(req.params.userId);
    res.json({ success: true, message: 'Dynamic initialization loop triggered successfully.' });
});

app.get('/api/whatsapp/status/:userId', (req, res) => {
    res.json({
        success: true,
        userId: req.params.userId,
        ready: clientStatus[req.params.userId] || false,
        qr: qrStore[req.params.userId] || ''
    });
});

app.get('/loginqr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'loginqr.html'));
});

app.get('/groups/:sessionName', async (req, res) => {
    const sId = req.params.sessionName;
    if (!clients[sId] || !clientStatus[sId]) {
        return res.status(400).json({
            success: false,
            error: `WhatsApp tracking connection for session ID [${sId}] is offline or uninitialized.`
        });
    }
    try {
        console.log(`[Groups Endpoint] Syncing live chat list data profiles for user session: ${sId}`);
        const chats = await clients[sId].getChats() || [];

        const groups = chats
            .filter(c => c && (c.isGroup || String(c.id._serialized).endsWith('@g.us')))
            .map(c => ({
                id: c.id._serialized,
                name: c.name || 'Unnamed Group Conversation Link',
                unreadCount: c.unreadCount || 0
            }));

        res.json({ success: true, sessionName: sId, total: groups.length, groups });
    } catch(e) {
        console.error(`[Groups Endpoint] Error pulling chat array arrays for ${sId}:`, e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/contacts/:sessionName', async (req, res) => {
    const userId = req.params.sessionName ? String(req.params.sessionName).trim() : null;

    const userClient = clients[userId];
    const isUserReady = clientStatus[userId];

    if (!userClient || !isUserReady) {
        return res.status(400).json({
            success: false,
            error: `WhatsApp session for User [${userId}] is offline or uninitialized.`
        });
    }

    try {
        console.log(`[Contacts Engine] Extracting named context address lines for: ${userId}`);
        const rawContacts = await userClient.getContacts() || [];
        const uniqueContactsMap = new Map();
        rawContacts.forEach(c => {
            if (c && c.isUser === true && c.id && c.id._serialized && !c.id._serialized.endsWith('@g.us')) {
                const idStr = c.id._serialized;
                if (!uniqueContactsMap.has(idStr)) {
                    uniqueContactsMap.set(idStr, {
                        id: idStr,
                        name: c.name || c.verifiedName || c.pushname || 'Saved Contact (No Name Assigned)',
                        shortName: c.shortName || ''
                    });
                }
            }
        });
        const contacts = Array.from(uniqueContactsMap.values())
            .sort((a, b) => a.name.localeCompare(b.name));
        res.json({
            success: true,
            sessionName: userId,
            total: contacts.length,
            contacts: contacts
        });

    } catch (error) {
        console.error(`[Contacts Engine] Error processing target contact mapping context for user ${userId}:`, error);
        res.status(500).json({
            success: false,
            error: error.message,
            contacts: []
        });
    }
});

app.post('/api/send-whatsapp', uploadSendNow.array('documents', CONFIG.MAX_FILES_PER_SCHEDULE), async (req, res) => {
    const { phone, caption, userId } = req.body;
    const files = req.files || [];
    const active = userId || 'ADMIN';
    const list = parsePhoneNumbers(phone);

    if (validatePhoneLimit(list) || !clients[active] || !clientStatus[active]) {
        files.forEach(f => deleteFileSafe(f.path));
        return res.status(400).json({
            success: false,
            error: 'Validation limits mismatch or targeted account browser session remains unlinked.'
        });
    }

    try {
        const out = await whatsAppService.sendWhatsAppToMultiple({
            userId: active,
            phones: list,
            message: caption,
            filePaths: files.map(f => f.path),
            recipientFileMap: {},
            helpers: HELPERS
        });
        files.forEach(f => deleteFileSafe(f.path));
        res.json({ success: out.successCount > 0, message: `Routed successfully to ${out.successCount}/${out.total} endpoints.`, result: out });
    } catch(ex) {
        files.forEach(f => deleteFileSafe(f.path));
        res.status(500).json({ success: false, error: ex.message });
    }
});

app.post('/api/upload-and-schedule-whatsapp', uploadScheduled.array('documents', CONFIG.MAX_FILES_PER_SCHEDULE), (req, res) => {

    const { phone, caption, scheduleMode, scheduleAt, startDate, time, weeklyDay, monthlyDay, userId } = req.body;   
    const files = req.files || [];
    const mode = String(scheduleMode || 'CUSTOM').toUpperCase();
    const list = parsePhoneNumbers(phone);

    const check = mathService.calculateFirstScheduleDate({ scheduleMode: mode, scheduleAt, startDate, time, weeklyDay, monthlyDay });
    const phoneErr = validatePhoneLimit(list);
    if (!check.success || phoneErr) {
        files.forEach(f => deleteFileSafe(f.path));
        return res.status(400).json({ success: false, error: check.error || phoneErr || 'Bad validation parameters.' });
    }

    const schedules = loadSchedules();
    const task = { userId: userId || 'ADMIN', id: 'SCH-' + Date.now(), sourceType: 'UPLOAD', scheduleType: 'UPLOADED_FILES', scheduleMode: mode, phones: list, phone: list.join(', '), totalNumbers: list.length, schedulerName: req.body.schedulerName || caption || mode + ' Task', message: caption || '', isActive: true, scheduleAt: check.date.toISOString(), status: 'SCHEDULED', uploadedFiles: files.map(f => ({ filePath: f.path, fileName: f.originalname })), runHistory: [] };
    schedules.push(task); saveSchedules(schedules);
    res.json({ success: true, message: 'Schedule created successfully.', schedule: task });
});

app.post('/api/schedule-location-report', (req, res) => {
    const { phone, caption, scheduleMode, scheduleAt, startDate, time, weeklyDay, monthlyDay, folderPath, fileName, fileType, maxFiles, selectedFiles, useLatestFiles, phoneFileMap, userId } = req.body;
    const mode = String(scheduleMode || 'CUSTOM').toUpperCase();
    const list = parsePhoneNumbers(phone);

    const check = mathService.calculateFirstScheduleDate({ scheduleMode: mode, scheduleAt, startDate, time, weeklyDay, monthlyDay });
    const phoneErr = validatePhoneLimit(list);
    if (!check.success || phoneErr || !folderPath) return res.status(400).json({ success: false, error: check.error || phoneErr || 'Missing directory configuration references.' });

    const schedules = loadSchedules();
    const task = { userId: userId || 'ADMIN', id: 'SCH-' + Date.now(), sourceType: 'SERVER_FOLDER', scheduleType: 'LOCATION', scheduleMode: mode, phones: list, phone: list.join(', '), totalNumbers: list.length, schedulerName: req.body.schedulerName || caption || mode + ' Task', message: caption || '', isActive: true, scheduleAt: check.date.toISOString(), folderPath: String(folderPath).trim(), fileName: String(fileName || '').trim(), fileType: fileType ? (fileType.startsWith('.') ? fileType.toLowerCase() : '.' + fileType.toLowerCase()) : '', maxFiles: Math.min(Math.max(parseInt(maxFiles || 1, 10), 1), CONFIG.MAX_FILES_PER_SCHEDULE), selectedFiles: selectedFiles || [], useLatestFiles: useLatestFiles !== false, phoneFileMap: normalizePhoneFileMap(phoneFileMap), status: 'SCHEDULED', runHistory: [] };
    schedules.push(task); saveSchedules(schedules);
    res.json({ success: true, message: 'Schedule created successfully.', schedule: task });
});

app.get('/api/number-list', (req, res) => {
    res.json({ success: true, numbers: loadNumberList() });
});

app.post('/api/number-list', (req, res) => {
    const { phones, replace } = req.body;
    const incoming = parsePhoneNumbers(phones);
    if (!incoming.length) return res.status(400).json({ success: false, error: 'Please enter valid number.' });

    let list = replace ? incoming : loadNumberList().concat(incoming);
    list = parsePhoneNumbers(list.join('\n'));
    if (list.length > CONFIG.MAX_RECIPIENTS_PER_REQUEST) {
        return res.status(400).json({ success: false, error: `Maximum ${CONFIG.MAX_RECIPIENTS_PER_REQUEST} numbers allowed in the saved list.` });
    }
    saveNumberList(list);
    res.json({ success: true, message: replace ? 'List replaced successfully.' : 'Numbers added successfully.' });
});

app.delete('/api/number-list/:phone', (req, res) => {
    const list = loadNumberList().filter(p => p !== req.params.phone);
    saveNumberList(list);
    res.json({ success: true, message: 'Number removed from list.' });
});

app.delete('/api/number-list', (req, res) => {
    saveNumberList([]);
    res.json({ success: true, message: 'Saved number list cleared.' });
});

app.get('/api/location-files', (req, res) => {
    const { folderPath, fileName, fileType, maxFiles } = req.query;
    const result = fileService.listFolderFiles({ folderPath, fileName, fileType, maxFiles });
    res.json(result);
});

app.get('/api/schedules', (req, res) => {
    const { userId, status } = req.query;
    let schedules = loadSchedules();
    if (userId) schedules = schedules.filter(s => s.userId === userId);

    const counts = mathService.getStatusCounts(schedules);

    let filtered = schedules;
    if (status && status !== 'ALL') filtered = schedules.filter(s => s.status === status);

    res.json({ success: true, schedules: filtered, counts });
});

app.patch('/api/schedules/:id/status', (req, res) => {
    const schedules = loadSchedules();
    const idx = schedules.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Schedule not found.' });

    schedules[idx].isActive = req.body.isActive !== false;
    saveSchedules(schedules);
    res.json({ success: true, message: schedules[idx].isActive ? 'Schedule enabled.' : 'Schedule disabled.' });
});

app.put('/api/schedules/:id', (req, res) => {
    const schedules = loadSchedules();
    const idx = schedules.findIndex(s => s.id === req.params.id);
    if (idx === -1) return res.status(404).json({ success: false, error: 'Schedule not found.' });

    const { phone, schedulerName, caption, scheduleAt, folderPath, fileName, fileType, maxFiles, useLatestFiles } = req.body;
    const list = parsePhoneNumbers(phone);
    const phoneErr = validatePhoneLimit(list);
    if (phoneErr) return res.status(400).json({ success: false, error: phoneErr });

    const target = schedules[idx];
    target.phones = list;
    target.phone = list.join(', ');
    target.totalNumbers = list.length;
    if (schedulerName) target.schedulerName = schedulerName;
    target.message = caption || '';

    if (scheduleAt) {
        const d = new Date(scheduleAt);
        if (isNaN(d.getTime())) return res.status(400).json({ success: false, error: 'Invalid scheduled time.' });
        target.scheduleAt = d.toISOString();
    }

    if (target.scheduleType === 'LOCATION') {
        if (folderPath) target.folderPath = String(folderPath).trim();
        target.fileName = String(fileName || '').trim();
        target.fileType = fileType ? (fileType.startsWith('.') ? fileType.toLowerCase() : '.' + fileType.toLowerCase()) : '';
        if (maxFiles) target.maxFiles = Math.min(Math.max(parseInt(maxFiles, 10) || 1, 1), CONFIG.MAX_FILES_PER_SCHEDULE);
        target.useLatestFiles = useLatestFiles !== false;
    }

    if (target.status !== 'PROCESSING') target.status = 'SCHEDULED';
    saveSchedules(schedules);
    res.json({ success: true, message: 'Schedule updated successfully.' });
});
app.get('/api/history', (req, res) => {
    const { userId, status } = req.query;
    const schedules = loadSchedules().filter(s => !userId || s.userId === userId);

    let rows = [];
    schedules.forEach(s => {
       
        if (s.runHistory && s.runHistory.length > 0) {
            s.runHistory.forEach(run => {
                if (Array.isArray(run.results) && run.results.length) {
                    run.results.forEach(r => rows.push({
                        scheduleId: s.id,
                        schedulerName: s.schedulerName,
                        scheduleMode: s.scheduleMode,
                        phone: r.phone,
                        runAt: run.runAt,
                        success: !!r.success,
                        error: r.error || s.error || null
                    }));
                } else {
                    rows.push({
                        scheduleId: s.id,
                        schedulerName: s.schedulerName,
                        scheduleMode: s.scheduleMode,
                        phone: s.phone,
                        runAt: run.runAt,
                        success: (run.failedCount || 0) === 0,
                        error: run.error || s.error || null
                    });
                }
            });
        } else if (s.status === 'FAILED') {
            rows.push({
                scheduleId: s.id,
                schedulerName: s.schedulerName,
                scheduleMode: s.scheduleMode,
                phone: s.phone,
                runAt: s.scheduleAt || s.createdAt || new Date().toISOString(),
                success: false,
                error: s.error || 'Task tracking failed completely.'
            });
        }
    });
    rows.sort((a, b) => new Date(b.runAt) - new Date(a.runAt));
    if (status === 'SUCCESS') rows = rows.filter(r => r.success);
    if (status === 'FAILED') rows = rows.filter(r => !r.success);

    const summary = { 
        total: rows.length, 
        success: rows.filter(r => r.success).length, 
        failed: rows.filter(r => !r.success).length 
    };

    res.json({ success: true, history: rows, summary });
});

app.delete('/api/schedules/:id', (req, res) => {
    const schedules = loadSchedules();
    const target = schedules.find(s => s.id === req.params.id);
    if (target && Array.isArray(target.uploadedFiles)) {
        target.uploadedFiles.forEach(f => deleteFileSafe(f.filePath));
    }
    saveSchedules(schedules.filter(s => s.id !== req.params.id));
    res.json({ success: true, message: 'Schedule entry purged.' });
});

app.post('/api/schedules/:id/quick-send', async (req, res) => {
    const s = loadSchedules(); const target = s.find(i => i.id === req.params.id);
    if (!target || !clients[target.userId] || !clientStatus[target.userId]) return res.status(400).json({ success: false, error: 'Target automated browser matrix is currently offline.' });
    try {
        let fPaths = (target.uploadedFiles || []).map(f => f.filePath);
        if (target.scheduleType === 'LOCATION') { const resv = fileService.resolveFilesFromLocation({ ...target, config: CONFIG }); if (resv.success) fPaths = resv.files; }
        const output = await whatsAppService.sendWhatsAppToMultiple({ userId: target.userId, phones: target.phones, message: target.message, filePaths: fPaths, recipientFileMap: target.phoneFileMap || {}, helpers: HELPERS });
        mathService.pushRunHistory(target, output);
        saveSchedules(s);
        res.json({ success: true, message: `Quick send routed to ${output.successCount}/${output.total} recipients.`, result: output });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

let loopRunning = false;
async function processDueSchedules() {
    if (loopRunning) return; loopRunning = true;
    try {
        const schedules = loadSchedules(); let changed = false;
        for (const s of schedules) {
            if (s.status !== 'SCHEDULED' || !s.isActive || new Date(s.scheduleAt) > new Date() || !clients[s.userId] || !clientStatus[s.userId]) continue;
            s.status = 'PROCESSING'; saveSchedules(schedules);
            try {
                let fPaths = (s.uploadedFiles || []).map(f => f.filePath);
                if (s.scheduleType === 'LOCATION') { const scanning = fileService.resolveFilesFromLocation({ ...s, config: CONFIG }); if (scanning.success) fPaths = scanning.files; }
                const delivery = await whatsAppService.sendWhatsAppToMultiple({ userId: s.userId, phones: s.phones, message: s.message, filePaths: fPaths, recipientFileMap: s.phoneFileMap || {}, helpers: HELPERS });
                s.status = delivery.failedCount === 0 ? 'SENT' : (delivery.successCount > 0 ? 'PARTIAL' : 'FAILED'); s.lastRunAt = new Date().toISOString();
                const next = mathService.calculateNextRun(s); if (next) { s.scheduleAt = next.toISOString(); s.status = 'SCHEDULED'; }
                mathService.pushRunHistory(s, delivery); changed = true;
            } catch(e) { s.status = 'FAILED'; changed = true; }
        }
        if (changed) saveSchedules(schedules);
    } catch(e) {} finally { loopRunning = false; }
}

function recoverProcessingSchedules() { saveSchedules(loadSchedules().map(s => s.status === 'PROCESSING' ? { ...s, status: 'FAILED', error: 'Server reboot execution crash transaction recovery.' } : s)); }
function deleteOldSentSchedules() {
    const schedules = loadSchedules(); const cutoff = Date.now() - (CONFIG.DELETE_SENT_AFTER_DAYS * 24 * 60 * 60 * 1000);
    const clean = schedules.filter(s => s.status !== 'SENT' || new Date(s.sentAt || s.lastRunAt || s.createdAt).getTime() >= cutoff);
    if(clean.length !== schedules.length) saveSchedules(clean);
}

setInterval(processDueSchedules, 30000);
setInterval(deleteOldSentSchedules, 24 * 60 * 60 * 1000);

app.listen(CONFIG.PORT, '0.0.0.0', () => {
    console.log(`================================================================`);
    console.log(` Master Gateway Operational at: http://localhost:${CONFIG.PORT}`);
    console.log(` Supported validation bounds: ${CONFIG.ALLOWED_EXTENSIONS.join(', ')}`);
    console.log(`================================================================`);
    recoverProcessingSchedules();
    deleteOldSentSchedules();
});
