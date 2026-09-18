/**
 * VPS LOCAL STORAGE MODULE
 * 
 * All file uploads are stored directly on the VPS filesystem under the /uploads directory.
 * Files are accessible via: https://domain.com/uploads/<folder>/<filename>
 * 
 * Folder structure:
 *   uploads/companies/      - Company logos
 *   uploads/users/          - User avatars
 *   uploads/products/       - Product images
 *   uploads/vendors/        - Vendor profile images & documents
 *   uploads/customers/      - Customer profile images & documents
 *   uploads/invoices/       - Invoice attachments
 *   uploads/documents/      - General document uploads
 *   uploads/plan_requests/  - Plan request logos
 *   uploads/company_logos/  - Legacy path (still served for existing records)
 */

require('dotenv').config();
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────
// Cloudinary stub — kept so existing controller imports don't break.
// None of these functions perform actual Cloudinary operations.
// ─────────────────────────────────────────────────────────────────
const cloudinary = {
    config: () => ({ cloud_name: null, api_key: null, api_secret: null }),
    uploader: {
        upload: async () => { throw new Error('Cloudinary not configured — using VPS local storage'); },
        upload_stream: () => { throw new Error('Cloudinary not configured — using VPS local storage'); },
        destroy: async (publicId) => {
            // No-op: for backward compatibility. Local file deletion is handled separately.
            console.warn(`[storage] cloudinary.uploader.destroy called for "${publicId}" — no-op (VPS local storage active)`);
            return { result: 'ok' };
        }
    },
    utils: {
        api_sign_request: () => ''
    }
};

// Cloudinary is intentionally not configured. VPS local storage is always used.
const isConfigured = false;

// ─────────────────────────────────────────────────────────────────
// Multer — memory storage (file buffer available for local disk save)
// ─────────────────────────────────────────────────────────────────
const storage = multer.memoryStorage();

const upload = multer({
    storage,
    limits: { fileSize: 15 * 1024 * 1024 } // 15 MB hard limit (enforced by multer)
});

// ─────────────────────────────────────────────────────────────────
// File type validation map per folder / category
// ─────────────────────────────────────────────────────────────────
const ALLOWED_TYPES = {
    // Image-only folders
    companies:     ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    company_logos: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    users:         ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    avatars:       ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    products:      ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    plan_requests: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    // Mixed folders (image + documents)
    vendors:   ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
    customers: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx'],
    invoices:  ['jpg', 'jpeg', 'png', 'pdf'],
    documents: ['jpg', 'jpeg', 'png', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'txt', 'csv'],
    // Default fallback
    uploads:   ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx']
};

// ─────────────────────────────────────────────────────────────────
// Core: Save file buffer to VPS local disk
// Returns the relative path: /uploads/<folder>/<filename>
// ─────────────────────────────────────────────────────────────────
const saveToLocalDisk = (buffer, mimetype, folderName) => {
    try {
        const uploadDir = path.join(__dirname, '../../uploads', folderName);
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        // Derive extension from mimetype, with safe fallback
        let ext = 'bin';
        if (mimetype) {
            const mimeToExt = {
                'image/jpeg': 'jpg',
                'image/jpg': 'jpg',
                'image/png': 'png',
                'image/gif': 'gif',
                'image/webp': 'webp',
                'image/svg+xml': 'svg',
                'application/pdf': 'pdf',
                'application/msword': 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.ms-excel': 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
                'text/plain': 'txt',
                'text/csv': 'csv'
            };
            ext = mimeToExt[mimetype] || mimetype.split('/')[1]?.split('+')[0] || 'bin';
        }

        // Validate extension against allowed types for this folder
        const allowedExts = ALLOWED_TYPES[folderName] || ALLOWED_TYPES['uploads'];
        if (!allowedExts.includes(ext.toLowerCase())) {
            console.warn(`[storage] File extension "${ext}" is not allowed in folder "${folderName}". Allowed: ${allowedExts.join(', ')}`);
            // Still save it, but log the warning (don't break upload flow)
        }

        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1e9);
        const filename = `${timestamp}-${random}.${ext}`;
        const filePath = path.join(uploadDir, filename);
        fs.writeFileSync(filePath, buffer);

        console.log(`[storage] File saved to VPS: /uploads/${folderName}/${filename} (${Math.round(buffer.length / 1024)}KB)`);
        return `/uploads/${folderName}/${filename}`;
    } catch (e) {
        console.error('[storage] Local disk save error:', e);
        // Last resort fallback: return base64 so nothing is lost
        return `data:${mimetype || 'image/png'};base64,${buffer.toString('base64')}`;
    }
};

// ─────────────────────────────────────────────────────────────────
// Delete a local VPS file (used when a record fails to save, etc.)
// Accepts a relative path like /uploads/products/1234.jpg
// ─────────────────────────────────────────────────────────────────
const deleteLocalFile = (relativePath) => {
    try {
        if (!relativePath || !relativePath.startsWith('/uploads/')) return;
        const absPath = path.join(__dirname, '../../', relativePath);
        if (fs.existsSync(absPath)) {
            fs.unlinkSync(absPath);
            console.log(`[storage] Deleted local file: ${relativePath}`);
        }
    } catch (e) {
        console.warn(`[storage] Failed to delete local file "${relativePath}":`, e.message);
    }
};

// ─────────────────────────────────────────────────────────────────
// Primary upload function
// Handles: File buffer (multer), base64 data URI strings, existing URLs
// All uploads go directly to VPS local storage.
// ─────────────────────────────────────────────────────────────────
const uploadToLocalStorage = async (file, folder = 'uploads') => {
    if (!file) return null;

    // Already a URL (http/https) or relative path — return as-is
    if (typeof file === 'string') {
        if (file.startsWith('http://') || file.startsWith('https://') || file.startsWith('/uploads/')) {
            return file;
        }
        // Handle large base64 strings: save to disk to avoid MySQL max_allowed_packet issues
        if (file.startsWith('data:') && file.length > 100000) {
            const matches = file.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimetype = matches[1];
                const buffer = Buffer.from(matches[2], 'base64');
                return saveToLocalDisk(buffer, mimetype, folder);
            }
        }
        // Short base64 or other string — return as-is
        return file;
    }

    // Multer-provided file object with a populated URL
    if (file.secure_url) return file.secure_url;
    if (file.url) return file.url;

    // Multer memory-storage file (has .buffer + .mimetype)
    if (file.buffer) {
        return saveToLocalDisk(file.buffer, file.mimetype, folder);
    }

    // Disk-storage file (has .path pointing to a temp file)
    if (file.path && !file.path.startsWith('http')) {
        try {
            const buffer = fs.readFileSync(file.path);
            const result = saveToLocalDisk(buffer, file.mimetype, folder);
            // Clean up temp file
            try { fs.unlinkSync(file.path); } catch (_) {}
            return result;
        } catch (e) {
            console.error('[storage] Failed to read disk-storage temp file:', e);
        }
    }

    return null;
};

// Backward-compatible alias — all existing controllers call this name
const uploadToCloudinaryOrBase64 = uploadToLocalStorage;

module.exports = {
    cloudinary,               // Stub — kept for backward compatibility
    upload,                   // Multer middleware
    isCloudinaryConfigured: isConfigured, // Always false — VPS storage is used
    uploadToCloudinaryOrBase64,           // Alias → uploadToLocalStorage
    uploadToLocalStorage,                 // Canonical new name
    saveToLocalDisk,                      // Low-level helper
    deleteLocalFile                       // Helper to remove old files on update
};