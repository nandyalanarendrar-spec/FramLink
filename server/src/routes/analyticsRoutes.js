import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { demandSupply } from '../controllers/analyticsController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer', 'buyer', 'admin'), requireApproved);

router.get('/demand-supply', demandSupply);

export default router;
