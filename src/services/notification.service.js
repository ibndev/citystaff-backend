const { query } = require('../config/db');

let admin;
try {
  admin = require('firebase-admin');
  if (!admin.apps.length && process.env.FIREBASE_PROJECT_ID) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        privateKey:  process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
} catch { console.warn('⚠️  Firebase not configured — push notifications disabled'); }

class NotificationService {
  static async save(recipientType, recipientId, { title, body, type, data = {} }) {
    try {
      await query(
        `INSERT INTO notifications (recipient_type, recipient_id, title, body, type, data) VALUES ($1,$2,$3,$4,$5,$6)`,
        [recipientType, recipientId, title, body, type, JSON.stringify(data)]
      );
    } catch (err) { console.error('Save notification error:', err.message); }
  }

  static async sendPush(pushToken, { title, body, data = {} }) {
    if (!admin || !admin.apps.length || !pushToken) return;
    try {
      await admin.messaging().send({
        token: pushToken,
        notification: { title, body },
        data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default', badge: 1 } } },
      });
    } catch (err) { console.error('Push error:', err.message); }
  }

  static async sendToUser(userId, payload) {
    await NotificationService.save('user', userId, payload);
    const r = await query('SELECT push_token FROM users WHERE id = $1', [userId]);
    if (r.rows[0]?.push_token) await NotificationService.sendPush(r.rows[0].push_token, payload);
    if (global.io) global.io.to(`user_${userId}`).emit('notification', payload);
  }

  static async sendToProvider(providerId, payload) {
    await NotificationService.save('provider', providerId, payload);
    const r = await query('SELECT push_token FROM providers WHERE id = $1', [providerId]);
    if (r.rows[0]?.push_token) await NotificationService.sendPush(r.rows[0].push_token, payload);
    if (global.io) global.io.to(`provider_${providerId}`).emit('notification', payload);
  }
}

module.exports = NotificationService;
