import 'dotenv/config';
import http from 'node:http';
import app from './app.js';
import { connectDB } from './config/db.js';
import { initSockets } from './sockets/index.js';
import { startJobs } from './jobs/priceImport.js';
import { backfillLegacyRatings } from './services/ratings.js';

const port = process.env.PORT || 5000;

if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET ?? '').length < 32) {
  console.error('JWT_SECRET must be at least 32 characters in production');
  process.exit(1);
}

connectDB()
  .then(() => {
    backfillLegacyRatings().catch((err) => console.error('[ratings] backfill failed:', err.message));
    const server = http.createServer(app);
    initSockets(server);
    server.listen(port, () => {
      console.log(`API running on http://localhost:${port}`);
      startJobs().catch((err) => console.error('[jobs] could not start:', err.message));
    });
  })
  .catch((err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });
