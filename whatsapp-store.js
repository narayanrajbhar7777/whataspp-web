// =================================================================
// MODULE 1: GLOBAL MEMORY REFERENCE DICTIONARY STORAGE
// =================================================================

const clients = {};       // Active running whatsapp-web.js Client class instances
const clientStatus = {};  // Dynamic boolean readiness state flags (true = ready/false = offline)
const qrStore = {};       // Unscanned raw message text strings per session profile token

module.exports = {
    clients,
    clientStatus,
    qrStore
};
