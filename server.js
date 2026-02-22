require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'], credentials: true },
  transports: ['websocket','polling'],
});
global.io = io;

// ── Security ──
app.use(helmet({ crossOriginResourcePolicy: { policy:'cross-origin' } }));
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended:true, limit:'10mb' }));

// ── Rate limiting ──
app.use('/api/', rateLimit({ windowMs:15*60*1000, max:300 }));
app.use('/api/auth/', rateLimit({ windowMs:15*60*1000, max:30 }));

// ── Health check (Railway uses this) ──
app.get('/health', (req,res) => res.json({ status:'ok', version:'2.0.0', timestamp: new Date().toISOString() }));
app.get('/', (req,res) => res.json({ message:'City Staff API v2.0.0 ✅ Running' }));

// ── Routes ──
const authRoutes    = require('./src/routes/auth');
const serviceRoutes = require('./src/routes/services');
const bookingRoutes = require('./src/routes/bookings');
const cmsRoutes     = require('./src/routes/cms');
const adminRoutes   = require('./src/routes/admin');
const { payments, providers } = require('./src/routes/payments-providers');
const { requireAnyAuth } = require('./src/middleware/auth');
const NotificationService = require('./src/services/notification.service');
const { query } = require('./config/db');

app.use('/api/auth',      authRoutes);
app.use('/api/services',  serviceRoutes);
app.use('/api/bookings',  bookingRoutes);
app.use('/api/cms',       cmsRoutes);
app.use('/api/admin',     adminRoutes);
app.use('/api/payments',  payments);
app.use('/api/providers', providers);

// ── Chat routes inline ──
app.get('/api/chat/booking/:id', requireAnyAuth, async (req,res) => {
  const r = await query('SELECT * FROM chat_messages WHERE booking_id=$1 ORDER BY created_at ASC LIMIT 100',[req.params.id]);
  res.json({success:true,messages:r.rows});
});
app.post('/api/chat/booking/:id', requireAnyAuth, async (req,res) => {
  const { message,media_url,media_type } = req.body;
  const senderType = req.authRole==='user'?'user':req.authRole==='provider'?'provider':'admin';
  const r = await query(`INSERT INTO chat_messages (booking_id,sender_type,sender_id,message,media_url,media_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[req.params.id,senderType,req.authId,message,media_url,media_type]);
  if (global.io) global.io.to(`booking_${req.params.id}`).emit('new_message',r.rows[0]);
  res.status(201).json({success:true,message:r.rows[0]});
});

// ── Notifications ──
app.get('/api/notifications', requireAnyAuth, async (req,res) => {
  const r = await query('SELECT * FROM notifications WHERE recipient_type=$1 AND recipient_id=$2 ORDER BY created_at DESC LIMIT 30',[req.authRole,req.authId]);
  res.json({success:true,notifications:r.rows});
});
app.put('/api/notifications/read-all', requireAnyAuth, async (req,res) => {
  await query('UPDATE notifications SET is_read=true,read_at=NOW() WHERE recipient_type=$1 AND recipient_id=$2 AND is_read=false',[req.authRole,req.authId]);
  res.json({success:true});
});

// ── 404 & Error handler ──
app.use((req,res) => res.status(404).json({success:false,message:`Not found: ${req.method} ${req.path}`}));
app.use((err,req,res,next) => res.status(err.status||500).json({success:false,message:process.env.NODE_ENV==='production'?'Server error':err.message}));

// ── Socket ──
require('./src/socket/socket.handler')(io);

// ── Start ──
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log(`║  🚀  City Staff API v2 — Port ${PORT}      ║`);
  console.log(`║  ENV: ${(process.env.NODE_ENV||'development').padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════╝');
  console.log('  ✅ /api/auth       — Authentication');
  console.log('  ✅ /api/bookings   — Booking lifecycle');
  console.log('  ✅ /api/cms        — CMS (settings, sections, banners, FAQs)');
  console.log('  ✅ /api/services   — Service catalog');
  console.log('  ✅ /api/payments   — Flutterwave + wallet');
  console.log('  ✅ /api/providers  — Provider management');
  console.log('  ✅ /api/admin      — Admin dashboard');
  console.log('  ✅ Socket.IO       — Real-time tracking + chat');
  console.log('');
});

module.exports = { app, server, io };
