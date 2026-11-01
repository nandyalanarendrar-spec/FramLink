import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { emitToUser } from '../sockets/index.js';

/**
 * Save a notification and push it live to the user if they are online.
 * Never throws: a failed notification must not break the action that triggered it.
 */
export async function notify(userId, { type, title, message, link }) {
  try {
    if (!userId) return;
    const n = await Notification.create({ user: userId, type, title, message, link });
    emitToUser(String(userId), 'notification', n.toObject());
  } catch (err) {
    console.error('[notify] failed:', err.message);
  }
}

export const notifyMany = (userIds, payload) => Promise.all(userIds.map((id) => notify(id, payload)));

export async function notifyAdmins(payload) {
  const admins = await User.find({ role: 'admin', isActive: true }, '_id').lean();
  return notifyMany(admins.map((a) => a._id), payload);
}

export const inr = (n) => `₹${Number(n).toLocaleString('en-IN')}`;
export const kg = (n) => `${Number(n).toLocaleString('en-IN')} kg`;
