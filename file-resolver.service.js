// LOCAL FILE SYSTEM DIAGNOSTICS & RESOLUTION SERVICE
const path = require('path');
const fs = require('fs');

const isAllowedFile = (f, allowed) => allowed.includes(path.extname(f).toLowerCase());
const isSameOrInsideFolder = (fold, f) => path.resolve(f).toLowerCase().startsWith(path.resolve(fold).toLowerCase() + path.sep.toLowerCase());
const matchFileName = (f, input) => !input || path.parse(f).name.toLowerCase() === String(input).trim().toLowerCase() || path.basename(f).toLowerCase() === String(input).trim().toLowerCase();

function resolveFilesFromLocation({ folderPath, fileName, fileType, maxFiles, selectedFiles, useLatestFiles, config }) {
    const fold = String(folderPath || '').trim();
    if (!fold || !fs.existsSync(fold) || !fs.statSync(fold).isDirectory()) {
        return { success: false, error: 'Target scanning path configuration represents an invalid local folder directory.', files: [] };
    }

    const maxCount = Math.min(Math.max(parseInt(maxFiles || 1, 10), 1), config.MAX_FILES_PER_SCHEDULE);
    const targetExt = fileType ? (fileType.startsWith('.') ? fileType.toLowerCase() : '.' + fileType.toLowerCase()) : '';
    let files = [];

    if (!useLatestFiles && Array.isArray(selectedFiles) && selectedFiles.length > 0) {
        files = selectedFiles.map(i => String(i || '').trim()).filter(f => fs.existsSync(f) && 
        fs.statSync(f).isFile() && 
        isSameOrInsideFolder(fold, f) && 
        isAllowedFile(f, config.ALLOWED_EXTENSIONS) && 
        (!targetExt || path.extname(f).toLowerCase() === targetExt) && 
        matchFileName(f, fileName)).slice(0, maxCount);
    } else {
        files = fs.readdirSync(fold).map(f => path.join(fold, f)).filter(f => fs.existsSync(f) && 
        fs.statSync(f).isFile() && 
        isAllowedFile(f, config.ALLOWED_EXTENSIONS) && 
        (!targetExt || path.extname(f).toLowerCase() === targetExt) && 
        matchFileName(f, fileName)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(0, maxCount);
    }

    return { success: true, error: null, files };
}

function getFileInfo(f) {
    const stat = fs.statSync(f);
    return { filePath: f, fileName: path.basename(f), extension: path.extname(f).toLowerCase(), sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
}

module.exports = {resolveFilesFromLocation,getFileInfo};
