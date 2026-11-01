import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/authRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import cropRoutes from './routes/cropRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import marketplaceRoutes from './routes/marketplaceRoutes.js';
import requestRoutes from './routes/requestRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import transportRoutes from './routes/transportRoutes.js';
import priceRoutes from './routes/priceRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import fileRoutes from './routes/fileRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import alertRoutes from './routes/alertRoutes.js';
import ratingRoutes from './routes/ratingRoutes.js';
import demandRoutes from './routes/demandRoutes.js';
import { CROP_DIR } from './utils/files.js';
import { sanitize } from './middleware/sanitize.js';
import { notFound, errorHandler } from './middleware/error.js';

const app = express();
const isProd = process.env.NODE_ENV === 'production';
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
const serveClient = isProd && fs.existsSync(path.join(clientDist, 'index.html'));

// Behind a hosting proxy (Render, Railway, nginx) the real client IP and https come from the proxy
if (isProd) app.set('trust proxy', 1);

app.use(
  helmet(
    isProd
      ? {
          contentSecurityPolicy: {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'", 'ws:', 'wss:'],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          },
        }
      : {}
  )
);
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(sanitize);
if (process.env.NODE_ENV !== 'test') app.use(morgan(isProd ? 'combined' : 'dev'));

// Crop photos are public (random file names). Verification documents are not served here, see /api/files.
app.use('/uploads/crops', express.static(CROP_DIR, { index: false, dotfiles: 'deny', maxAge: '7d', setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff') }));

// A general ceiling for the whole API. Login/register have their own, stricter limits.
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: Number(process.env.API_RATE_LIMIT) || 600, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/crops', cropRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/requests', requestRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/transport', transportRoutes);
app.use('/api/prices', priceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/demands', demandRoutes);

// Production: one server serves the built React app too (same origin, so the login cookie needs no CORS)
if (serveClient) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/^\/(?!api\/|uploads\/|socket\.io\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use(notFound);
app.use(errorHandler);

export default app;
