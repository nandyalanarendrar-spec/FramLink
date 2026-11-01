import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError, asyncHandler } from '../utils/AppError.js';

// Verifies the JWT cookie and attaches req.user
export const protect = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.token;
  if (!token) throw new AppError('Not logged in', 401);

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError('Session expired, please log in again', 401);
  }

  const user = await User.findById(payload.id);
  if (!user || !user.isActive) throw new AppError('Account not available', 401);
  if ((payload.pv ?? 0) !== (user.passwordChangedAt?.getTime() ?? 0)) throw new AppError('Session expired, please log in again', 401);
  req.user = user;
  next();
});

// Use on every feature route: the email must be confirmed first
export const requireEmailVerified = (req, _res, next) => {
  if (!req.user.emailVerified) return next(new AppError('Please verify your email first', 403));
  next();
};

// Use on publishing/trading routes: the admin must have approved the account
export const requireApproved = (req, _res, next) => {
  if (req.user.role !== 'admin' && req.user.verificationStatus !== 'verified') {
    return next(new AppError('Your account is not yet verified by admin', 403));
  }
  next();
};

// Role-based access: authorize('farmer'), authorize('admin', 'farmer')
export const authorize =
  (...roles) =>
  (req, _res, next) => {
    if (!roles.includes(req.user.role)) return next(new AppError('Forbidden', 403));
    next();
  };
