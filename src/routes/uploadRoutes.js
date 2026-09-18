const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadToLocalStorage } = require('../utils/cloudinaryConfig');
const { authenticateToken } = require('../middlewares/authMiddleware');
const path = require('path');

// Memory storage: file buffer available for local disk save
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 } // 15 MB
});

/**
 * POST /api/upload
 * Upload a single file to VPS local storage.
 *
 * Request:   multipart/form-data with field "file"
 * Query:     ?folder=companies|users|products|vendors|customers|invoices|documents|plan_requests
 * Response:  { success: true, url: "https://domain.com/uploads/<folder>/<filename>", original_name: "..." }
 *
 * The returned URL is an absolute HTTPS URL pointing to the VPS server so it can be
 * stored directly in the database and used in the frontend without further transformation.
 */
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        // Determine target folder from query param — default to 'uploads'
        const folder = req.query.folder || 'uploads';

        // Save to VPS local storage
        const relativePath = await uploadToLocalStorage(req.file, folder);

        if (!relativePath) {
            return res.status(500).json({ success: false, message: 'File could not be saved' });
        }

        // Build absolute URL so the frontend can use it directly
        let finalUrl = relativePath;
        if (relativePath.startsWith('/uploads/')) {
            const protocol = req.headers['x-forwarded-proto'] || req.protocol;
            const host = req.headers['x-forwarded-host'] || req.get('host');
            finalUrl = `${protocol}://${host}${relativePath}`;
        }

        return res.status(200).json({
            success: true,
            url: finalUrl,
            relativePath,          // Keep relative path for internal use if needed
            original_name: req.file.originalname
        });

    } catch (error) {
        console.error('[upload] Upload Error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Upload failed' });
    }
});

module.exports = router;
