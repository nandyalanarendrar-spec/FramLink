import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

let io;

// Real-time channel. A user is identified by the same httpOnly login cookie the API uses,
// and joins a private room, so events can only reach their owner.
export function initSockets(httpServer) {
  io = new Server(httpServer, { cors: { origin: process.env.CLIENT_URL, credentials: true } });

  io.use(async (socket, next) => {
    try {
      const token = parseCookie(socket.handshake.headers.cookie ?? '').token;
      if (!token) return next(new Error('Not logged in'));
      const { id, pv } = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(id, '_id isActive passwordChangedAt');
      if (!user?.isActive) return next(new Error('Account not available'));
      if ((pv ?? 0) !== (user.passwordChangedAt?.getTime() ?? 0)) return next(new Error('Session expired')); // password changed since this login
      socket.data.userId = String(user._id);
      next();
    } catch {
      next(new Error('Not logged in'));
    }
  });

  io.on('connection', (socket) => socket.join(`user:${socket.data.userId}`));
  return io;
}

export const emitToUser = (userId, event, payload) => io?.to(`user:${userId}`).emit(event, payload);
