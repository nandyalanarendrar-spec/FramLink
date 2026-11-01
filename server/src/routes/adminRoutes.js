import { Router } from 'express';
import { protect, authorize } from '../middleware/auth.js';
import { listUsers, stats, verifyUser, rejectUser } from '../controllers/adminController.js';
import { status, districts, list, add, remove, importPrices } from '../controllers/adminPriceController.js';
import { accounts, setActive, listings, takeDown } from '../controllers/adminManageController.js';
import { mailStatus, mailTest } from '../controllers/adminMailController.js';
import { adminList as reportList, resolve as resolveReport } from '../controllers/reportController.js';

const router = Router();
router.use(protect, authorize('admin'));

router.get('/users', listUsers);
router.get('/stats', stats);
router.patch('/users/:id/verify', verifyUser);
router.patch('/users/:id/reject', rejectUser);

// Accounts and listings
router.get('/accounts', accounts);
router.patch('/accounts/:id/active', setActive);
router.get('/listings', listings);
router.post('/listings/:id/takedown', takeDown);

// Email delivery check
router.get('/mail', mailStatus);
router.post('/mail/test', mailTest);

// Reports (complaints)
router.get('/reports', reportList);
router.patch('/reports/:id', resolveReport);

// Market price data
router.get('/prices/status', status);
router.get('/prices/districts', districts);
router.get('/prices', list);
router.post('/prices', add);
router.post('/prices/import', importPrices);
router.delete('/prices/:id', remove);

export default router;
