import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { search, facets, detail } from '../controllers/marketplaceController.js';

const router = Router();
// Only verified buyers can browse the marketplace
router.use(protect, requireEmailVerified, authorize('buyer'), requireApproved);

router.get('/', search);
router.get('/facets', facets); // must stay above '/:id'
router.get('/:id', detail);

export default router;
