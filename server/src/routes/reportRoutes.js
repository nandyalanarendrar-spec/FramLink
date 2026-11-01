import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { create, mine } from '../controllers/reportController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer', 'buyer'), requireApproved);

router.post('/', create);
router.get('/mine', mine);

export default router;
