import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { myOrders, summary, getOrder, advance, markPaid, complete, cancel } from '../controllers/orderController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer', 'buyer'), requireApproved);

router.get('/mine', myOrders); // static paths stay above '/:id'
router.get('/summary', summary);
router.get('/:id', getOrder);
router.patch('/:id/status', advance); // farmer only (checked in controller)
router.post('/:id/paid', markPaid); // farmer only
router.post('/:id/complete', complete); // buyer only
router.post('/:id/cancel', cancel);

export default router;
