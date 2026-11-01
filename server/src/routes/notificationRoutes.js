import { Router } from 'express';
import { protect, requireEmailVerified } from '../middleware/auth.js';
import { list, markRead, markAllRead } from '../controllers/notificationController.js';

const router = Router();
router.use(protect, requireEmailVerified); // every role has notifications

router.get('/', list);
router.post('/read-all', markAllRead); // must stay above '/:id/read'
router.post('/:id/read', markRead);

export default router;
