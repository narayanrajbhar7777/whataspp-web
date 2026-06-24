// =================================================================
// MODULE 2: CORE WHATSAPP PUPPET CLIENT & ROUTING DISPATCH SERVICES
// =================================================================

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');

const { clients, clientStatus, qrStore } = require('./whatsapp-store');
const DELAY_BETWEEN_MESSAGES_MS = 7000;

/**
 * Launches or resumes a distinct WhatsApp sandbox session partition
 */
function initWhatsAppClient(userId) {
    const cleanId = String(userId || '').trim();
    if (!cleanId || clients[cleanId]) return clients[cleanId] || null;

    console.log(`[Engine] Spawning profile container sandbox for User Account: ${cleanId}`);
    const client = new Client({
        authStrategy: new LocalAuth({ clientId: cleanId }),
        puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }
    });

    qrStore[cleanId] = '';
    clientStatus[cleanId] = false;

    client.on('qr', (qr) => {
        qrStore[cleanId] = qr;
        clientStatus[cleanId] = false;
        console.log(`\n--- [QR Code Generated for User Partition Session: ${cleanId}] ---`);
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        clientStatus[cleanId] = true;
        qrStore[cleanId] = '';
        console.log(`[Engine] User Account [${cleanId}] authentication handshake complete: READY!`);
    });

    client.on('disconnected', async () => {
        clientStatus[cleanId] = false;
        qrStore[cleanId] = '';
        try { await client.destroy(); } catch (e) {}
        delete clients[cleanId];
    });

    client.on('auth_failure', async () => {
        clientStatus[cleanId] = false;
        qrStore[cleanId] = '';
        try { await client.destroy(); } catch (e) {}
        delete clients[cleanId];
    });

    clients[cleanId] = client;
    client.initialize().catch(() => {
        clientStatus[cleanId] = false;
        delete clients[cleanId];
    });

    return client;
}

/**
 * Handles message routing loops across unique recipients (mixed groups and cell paths)
 */
async function sendWhatsAppToMultiple({ userId, phones, message, filePaths, recipientFileMap, helpers }) {
    const userClient = clients[userId];
    if (!userClient || !clientStatus[userId]) {
        throw new Error(`WhatsApp execution engine remains unlinked or offline for user profile: ${userId}`);
    }

    const map = helpers.normalizePhoneFileMap(recipientFileMap);
    const results = [];

    for (const target of phones) {
        const phoneResult = { phone: target, success: false, error: null, files: [] };
        try {
            let chatId = target;
            if (!target.endsWith('@g.us')) {
                const verified = await userClient.getNumberId(target);
                if (!verified) {
                    phoneResult.error = 'This target destination mobile node is not registered on WhatsApp.';
                    results.push(phoneResult);
                    continue;
                }
                chatId = verified._serialized;
            }

            const activeFiles = helpers.getMappedFilesForPhone(map, target) || filePaths;
            if (activeFiles.length > 0) {
                let allFilesSent = true;
                for (const file of activeFiles) {
                    try {
                        const media = MessageMedia.fromFilePath(file);
                        await userClient.sendMessage(chatId, media, { caption: message || '', filename: path.basename(file), sendMediaAsDocument: true });
                        phoneResult.files.push({ fileName: path.basename(file), filePath: file, success: true, error: null });
                    } catch (e) {
                        allFilesSent = false;
                        phoneResult.files.push({ fileName: path.basename(file), filePath: file, success: false, error: e.message });
                    }
                    await helpers.sleep(DELAY_BETWEEN_MESSAGES_MS);
                }
                phoneResult.success = allFilesSent;
                phoneResult.error = allFilesSent ? null : 'One or more document attachment dispatches failed delivery parameters.';
            } else {
                await userClient.sendMessage(chatId, message.trim());
                phoneResult.success = true;
            }
            results.push(phoneResult);
        } catch (err) {
            phoneResult.success = false;
            phoneResult.error = err.message;
            results.push(phoneResult);
        }
        await helpers.sleep(DELAY_BETWEEN_MESSAGES_MS);
    }

    return {
        total: phones.length,
        successCount: results.filter(r => r.success).length,
        failedCount: results.filter(r => !r.success).length,
        results
    };
}

module.exports = {
    initWhatsAppClient,
    sendWhatsAppToMultiple
};
