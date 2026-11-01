import { Router } from 'express';
import { protect, authorize, requireEmailVerified, requireApproved } from '../middleware/auth.js';
import { create, mine, detail, close, board, makeOffer, myOffers, withdrawOffer, declineOffer, acceptOffer } from '../controllers/demandController.js';

const router = Router();
router.use(protect, requireEmailVerified, authorize('buyer', 'farmer'), requireApproved);

// Buyer: post what you want, see the offers, pick one
router.post('/', authorize('buyer'), create);
router.get('/mine', authorize('buyer'), mine);
router.post('/offers/:id/accept', authorize('buyer'), acceptOffer);
router.post('/offers/:id/decline', authorize('buyer'), declineOffer);

// Farmer: the board of everything buyers want, and your offers (static paths stay above '/:id')
router.get('/board', authorize('farmer'), board);
router.get('/offers/mine', authorize('farmer'), myOffers);
router.post('/offers/:id/withdraw', authorize('farmer'), withdrawOffer);

router.get('/:id', authorize('buyer'), detail);
router.post('/:id/close', authorize('buyer'), close);
router.post('/:id/offers', authorize('farmer'), makeOffer);

export default router;
