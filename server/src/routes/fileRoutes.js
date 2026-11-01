import path from 'node:path';
import { Router } from 'express';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { AppError, asyncHandler } from '../utils/AppError.js';
import { DOC_DIR } from '../utils/files.js';

const router = Router();

// Verification documents are never public: only the owner and admins can open them
router.get(
  '/docs/:docId',
  protect,
  asyncHandler(async (req, res) => {
    const owner = await User.findOne({ 'documents._id': req.params.docId }, 'documents');
    const doc = owner?.documents.id(req.params.docId);
    const allowed = owner && (req.user.role === 'admin' || String(owner._id) === String(req.user._id));
    if (!doc || !allowed) throw new AppError('File not found', 404); // same answer for "missing" and "not yours"

    res.set({
      'Content-Type': doc.mime,
      'Content-Disposition': 'inline',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    res.sendFile(path.join(DOC_DIR, path.basename(doc.file)));
  })
);

export default router;
