import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { createCrop, myCrops, getCrop, updateCrop, setStatus, deleteCrop, addImages, removeImage, relist, adjust } from '../controllers/cropController.js';
import { cropPhotos } from '../utils/files.js';
import { recommend, notifyBuyer } from '../controllers/recommendController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer'));

router.post('/', requireApproved, createCrop);
router.get('/mine', myCrops); // must stay above '/:id'
router.get('/:id', getCrop);
router.put('/:id', requireApproved, updateCrop);
router.patch('/:id/status', requireApproved, setStatus);
router.get('/:id/recommendations', requireApproved, recommend);
router.post('/:id/recommendations/:buyerId/notify', requireApproved, notifyBuyer);
router.post('/:id/relist', requireApproved, relist);
router.post('/:id/adjust', requireApproved, adjust);
router.post('/:id/images', requireApproved, cropPhotos, addImages);
router.delete('/:id/images/:name', requireApproved, removeImage);
router.delete('/:id', requireApproved, deleteCrop);

export default router;
