import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { register, login, logout, me, verifyEmail, resendOtp, changePassword, forgotPassword, resetPassword, requestEmailChange, confirmEmailChange } from '../controllers/authController.js';
import { protect } from '../middleware/auth.js';

const router = Router();

// brute-force protection on credential endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: Number(process.env.AUTH_RATE_LIMIT) || 30, standardHeaders: true, legacyHeaders: false });

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/logout', logout);
router.get('/me', protect, me);
router.post('/verify-email', authLimiter, protect, verifyEmail);
router.post('/change-password', authLimiter, protect, changePassword);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password', authLimiter, resetPassword);
router.post('/email/request', authLimiter, protect, requestEmailChange);
router.post('/email/confirm', authLimiter, protect, confirmEmailChange);
router.post('/resend-otp', authLimiter, protect, resendOtp);

export default router;
