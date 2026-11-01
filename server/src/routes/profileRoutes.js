import { Router } from 'express';
import { protect, authorize, requireEmailVerified } from '../middleware/auth.js';
import { getProfile, submitVerification, addDocuments, removeDocument, updateVehicle, updateAccount, updateBasic, unlockForEdit } from '../controllers/profileController.js';
import { documents } from '../utils/files.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer', 'buyer', 'transporter'));

router.get('/', getProfile);
router.put('/account', updateAccount);
router.put('/basic', updateBasic);
router.post('/unlock', unlockForEdit); // verified users reopen their ID details (needs re-verification)
router.put('/verification', submitVerification);
router.post('/documents', documents, addDocuments);
router.delete('/documents/:docId', removeDocument);
router.put('/vehicle', authorize('transporter'), updateVehicle);

export default router;
