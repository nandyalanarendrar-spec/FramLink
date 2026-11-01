import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { list, create, remove } from '../controllers/alertController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer'), requireApproved);

router.get('/', list);
router.post('/', create);
router.delete('/:id', remove);

export default router;
