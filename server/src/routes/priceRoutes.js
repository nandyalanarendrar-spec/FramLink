import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { compare, trend, outlook, suggest, crops, districts } from '../controllers/priceController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer'), requireApproved);

router.get('/compare', compare);
router.get('/trend', trend);
router.get('/outlook', outlook);
router.get('/suggest', suggest);
router.get('/crops', crops);
router.get('/districts', districts);

export default router;
