// =================================================================
// MODULE 3: SERVER-SIDE FOLDER ATTACHMENT DISCOVERY & RESOLUTION
// =================================================================

const fs = require('fs');
const path = require('path');

/**
 * Lists files inside a server folder matching the optional name/type filters,
 * newest-first, capped at maxFiles. Used by the "Scan Files" UI action and as
 * the building block for resolveFilesFromLocation() below.
 */
function listFolderFiles({ folderPath, fileName, fileType, maxFiles }) {
    const cleanPath = String(folderPath || '').trim();
    if (!cleanPath) return { success: false, error: 'Folder path is required.' };

    if (!fs.existsSync(cleanPath)) return { success: false, error: `Folder path does not exist: ${cleanPath}` };
    if (!fs.statSync(cleanPath).isDirectory()) return { success: false, error: `Path is not a directory: ${cleanPath}` };

    let entries;
    try {
        entries = fs.readdirSync(cleanPath)
            .map((name) => ({ name, full: path.join(cleanPath, name) }))
            .filter((e) => {
                try { return fs.statSync(e.full).isFile(); } catch (err) { return false; }
            });
    } catch (e) {
        return { success: false, error: 'Unable to read folder contents: ' + e.message };
    }

    const cleanFileName = String(fileName || '').trim();
    if (cleanFileName) {
        entries = entries.filter((e) => e.name.toLowerCase() === cleanFileName.toLowerCase());
    }

    const cleanFileType = String(fileType || '').trim();
    if (cleanFileType) {
        const ext = cleanFileType.startsWith('.') ? cleanFileType.toLowerCase() : '.' + cleanFileType.toLowerCase();
        entries = entries.filter((e) => path.extname(e.name).toLowerCase() === ext);
    }

    entries.sort((a, b) => fs.statSync(b.full).mtimeMs - fs.statSync(a.full).mtimeMs);

    const limit = Math.max(1, parseInt(maxFiles || 1, 10) || 1);
    entries = entries.slice(0, limit);

    return { success: true, files: entries.map((e) => ({ fileName: e.name, filePath: e.full })) };
}

/**
 * Resolves the actual attachment file paths that should be sent for a
 * LOCATION-type schedule at send time. Prefers explicitly selected files
 * (when "Auto-send latest file" is turned off), otherwise re-scans the
 * folder for the freshest matching files.
 */
function resolveFilesFromLocation(task) {
    const { folderPath, fileName, fileType, maxFiles, selectedFiles, useLatestFiles } = task;

    if (Array.isArray(selectedFiles) && selectedFiles.length && useLatestFiles === false) {
        const existing = selectedFiles.filter((f) => { try { return fs.existsSync(f); } catch (e) { return false; } });
        if (!existing.length) return { success: false, error: 'Previously selected files no longer exist on disk.' };
        return { success: true, files: existing };
    }

    const scanned = listFolderFiles({ folderPath, fileName, fileType, maxFiles });
    if (!scanned.success) return scanned;
    if (!scanned.files.length) return { success: false, error: 'No matching files found in folder at send time.' };
    return { success: true, files: scanned.files.map((f) => f.filePath) };
}

module.exports = {
    listFolderFiles,
    resolveFilesFromLocation
};
