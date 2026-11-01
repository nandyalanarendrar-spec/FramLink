import { Router } from 'express';
import { protect, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { rate, forOrder, mine } from '../controllers/ratingController.js';

const router = Router();
// Farmers, buyers and transporters rate each other after an order; admins have no ratings
router.use(protect, requireEmailVerified, (req, res, next) => (req.user.role === 'admin' ? res.status(403).json({ message: 'Forbidden' }) : next()), requireApproved);

router.get('/me', mine);
router.get('/order/:orderId', forOrder);
router.post('/', rate);

export default router;
