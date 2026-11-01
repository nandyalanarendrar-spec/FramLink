import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { opportunities, makeOffer, withdrawOffer, orderOffers, acceptOffer } from '../controllers/transportOfferController.js';
import { directory } from '../controllers/vehicleController.js';
import { create, available, mine, accept, setStatus, markPaid, release, cancel } from '../controllers/transportController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('farmer', 'buyer', 'transporter'), requireApproved);

router.post('/', authorize('farmer', 'buyer'), create); // either side of an order can ask for transport
router.get('/available', authorize('transporter'), available); // static paths above '/:id'
router.get('/mine', mine);
router.get('/vehicles', authorize('farmer', 'buyer'), directory); // every verified vehicle, like the crop marketplace

// Sold trades that still need a transporter: transporters offer, the responsible farmer/buyer picks one
router.get('/opportunities', authorize('transporter'), opportunities);
router.post('/orders/:orderId/offers', authorize('transporter'), makeOffer);
router.get('/orders/:orderId/offers', authorize('farmer', 'buyer'), orderOffers);
router.post('/offers/:id/withdraw', authorize('transporter'), withdrawOffer);
router.post('/offers/:id/accept', authorize('farmer', 'buyer'), acceptOffer);
router.post('/:id/accept', authorize('transporter'), accept);
router.patch('/:id/status', authorize('transporter'), setStatus);
router.post('/:id/paid', authorize('transporter'), markPaid);
router.post('/:id/release', authorize('transporter'), release);
router.post('/:id/cancel', authorize('farmer', 'buyer'), cancel);

export default router;
