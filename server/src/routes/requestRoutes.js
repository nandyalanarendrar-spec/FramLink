import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { createRequest, myRequests, getRequest, counter, accept, reject, cancel } from '../controllers/requestController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('buyer', 'farmer'), requireApproved);

router.post('/', authorize('buyer'), createRequest);
router.get('/mine', myRequests); // must stay above '/:id'
router.get('/:id', getRequest);
router.post('/:id/counter', counter);
router.post('/:id/accept', accept);
router.post('/:id/reject', reject); // farmer only (checked in controller)
router.post('/:id/cancel', cancel); // buyer only (checked in controller)

export default router;
