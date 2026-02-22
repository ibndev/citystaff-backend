const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const { query } = require('../config/db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const NotificationService = require('../services/notification.service');
const SettingsService     = require('../services/settings.service');

// ── Dashboard stats ──
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [users, providers, bookings, revenue, recentBookings, pendingPayouts, pendingProviders, revenueChart] = await Promise.all([
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '30 days') AS new_this_month FROM users`),
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE is_verified=false AND is_active=true) AS pending_verification, COUNT(*) FILTER (WHERE is_online=true) AS online_now FROM providers`),
      query(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='completed') AS completed, COUNT(*) FILTER (WHERE status IN ('pending','dispatching','accepted','in_progress')) AS active, COUNT(*) FILTER (WHERE status='cancelled') AS cancelled, COUNT(*) FILTER (WHERE created_at >= NOW()-INTERVAL '24 hours') AS today FROM bookings`),
      query(`SELECT COALESCE(SUM(total_price) FILTER (WHERE status='completed'),0) AS total_revenue, COALESCE(SUM(platform_fee) FILTER (WHERE status='completed'),0) AS platform_revenue, COALESCE(SUM(total_price) FILTER (WHERE status='completed' AND completed_at >= NOW()-INTERVAL '30 days'),0) AS this_month, COALESCE(SUM(total_price) FILTER (WHERE status='completed' AND completed_at >= NOW()-INTERVAL '7 days'),0) AS this_week FROM bookings`),
      query(`SELECT b.*, s.name AS service_name, u.full_name AS user_name, u.phone AS user_phone, p.full_name AS provider_name FROM bookings b LEFT JOIN services s ON b.service_id=s.id LEFT JOIN users u ON b.user_id=u.id LEFT JOIN providers p ON b.provider_id=p.id ORDER BY b.created_at DESC LIMIT 8`),
      query(`SELECT COUNT(*) AS count FROM provider_payouts WHERE status='pending'`),
      query(`SELECT COUNT(*) AS count FROM providers WHERE is_verified=false AND is_active=true`),
      query(`SELECT DATE(completed_at) AS date, COUNT(*) AS bookings, SUM(total_price) AS revenue FROM bookings WHERE status='completed' AND completed_at >= NOW()-INTERVAL '30 days' GROUP BY DATE(completed_at) ORDER BY date ASC`),
    ]);
    res.json({
      success: true,
      stats: { users: users.rows[0], providers: providers.rows[0], bookings: bookings.rows[0], revenue: revenue.rows[0], pending_payouts: parseInt(pendingPayouts.rows[0].count), pending_providers: parseInt(pendingProviders.rows[0].count) },
      recent_bookings: recentBookings.rows,
      revenue_chart: revenueChart.rows,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── All Bookings ──
router.get('/bookings', requireAdmin, async (req, res) => {
  try {
    const { status, page=1, limit=20, search, from, to } = req.query;
    const offset = (page-1)*limit;
    let sql = `SELECT b.*, s.name AS service_name, u.full_name AS user_name, u.phone AS user_phone, p.full_name AS provider_name, p.phone AS provider_phone FROM bookings b LEFT JOIN services s ON b.service_id=s.id LEFT JOIN users u ON b.user_id=u.id LEFT JOIN providers p ON b.provider_id=p.id WHERE 1=1`;
    const params = [];
    if (status) { params.push(status); sql += ` AND b.status=$${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (b.booking_ref ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`; }
    if (from)   { params.push(from); sql += ` AND b.created_at >= $${params.length}`; }
    if (to)     { params.push(to);   sql += ` AND b.created_at <= $${params.length}`; }
    const countSql = sql.replace('SELECT b.*, s.name AS service_name, u.full_name AS user_name, u.phone AS user_phone, p.full_name AS provider_name, p.phone AS provider_phone', 'SELECT COUNT(*)');
    const total = (await query(countSql, params)).rows[0].count;
    params.push(limit, offset);
    sql += ` ORDER BY b.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`;
    const r = await query(sql, params);
    res.json({ success: true, bookings: r.rows, total: parseInt(total) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Users ──
router.get('/users', requireAdmin, async (req, res) => {
  try {
    const { page=1, limit=20, search } = req.query;
    const offset = (page-1)*limit;
    let sql = `SELECT u.*, COUNT(b.id) AS total_bookings, COALESCE(SUM(b.total_price) FILTER (WHERE b.status='completed'),0) AS total_spent FROM users u LEFT JOIN bookings b ON u.id=b.user_id WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (u.full_name ILIKE $${params.length} OR u.phone ILIKE $${params.length} OR u.email ILIKE $${params.length})`; }
    sql += ` GROUP BY u.id ORDER BY u.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const r = await query(sql, params);
    res.json({ success: true, users: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/users/:id/suspend',  requireAdmin, async (req, res) => { await query('UPDATE users SET is_active=false WHERE id=$1',[req.params.id]); res.json({ success:true, message:'User suspended' }); });
router.put('/users/:id/activate', requireAdmin, async (req, res) => { await query('UPDATE users SET is_active=true WHERE id=$1',[req.params.id]); res.json({ success:true, message:'User activated' }); });

// ── Providers ──
router.get('/providers', requireAdmin, async (req, res) => {
  try {
    const { is_verified, page=1, limit=20, search } = req.query;
    const offset = (page-1)*limit;
    let sql = `SELECT p.*, COUNT(DISTINCT b.id) AS total_bookings FROM providers p LEFT JOIN bookings b ON p.id=b.provider_id WHERE 1=1`;
    const params = [];
    if (is_verified !== undefined) { params.push(is_verified==='true'); sql += ` AND p.is_verified=$${params.length}`; }
    if (search) { params.push(`%${search}%`); sql += ` AND (p.full_name ILIKE $${params.length} OR p.phone ILIKE $${params.length})`; }
    sql += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`;
    params.push(limit, offset);
    const r = await query(sql, params);
    res.json({ success: true, providers: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/providers/:id/verify',   requireAdmin, async (req,res) => { await query('UPDATE providers SET is_verified=true WHERE id=$1',[req.params.id]); res.json({success:true,message:'Provider verified'}); });
router.put('/providers/:id/suspend',  requireAdmin, async (req,res) => { await query('UPDATE providers SET is_active=false WHERE id=$1',[req.params.id]); res.json({success:true,message:'Provider suspended'}); });
router.put('/providers/:id/activate', requireAdmin, async (req,res) => { await query('UPDATE providers SET is_active=true WHERE id=$1',[req.params.id]); res.json({success:true,message:'Provider activated'}); });

// ── Payouts ──
router.get('/payouts', requireAdmin, async (req, res) => {
  try {
    const { status='pending', page=1, limit=20 } = req.query;
    const offset = (page-1)*limit;
    const r = await query(
      `SELECT pp.*, p.full_name AS provider_name, p.phone AS provider_phone FROM provider_payouts pp LEFT JOIN providers p ON pp.provider_id=p.id WHERE pp.status=$1 ORDER BY pp.created_at DESC LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    res.json({ success: true, payouts: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/payouts/:id/approve', requireAdmin, async (req, res) => {
  await query(`UPDATE provider_payouts SET status='processing', processed_at=NOW(), admin_note=$1 WHERE id=$2`, [req.body.note||null, req.params.id]);
  res.json({ success: true, message: 'Payout approved for processing' });
});

router.put('/payouts/:id/reject', requireAdmin, async (req, res) => {
  const payout = (await query('SELECT * FROM provider_payouts WHERE id=$1', [req.params.id])).rows[0];
  if (payout && payout.status === 'pending') {
    await query('UPDATE providers SET wallet_balance=wallet_balance+$1 WHERE id=$2', [payout.amount, payout.provider_id]);
    await query(`UPDATE provider_payouts SET status='failed', admin_note=$1, processed_at=NOW() WHERE id=$2`, [req.body.note||'Rejected by admin', req.params.id]);
  }
  res.json({ success: true, message: 'Payout rejected and funds returned' });
});

// ── Promo Codes ──
router.get('/promos', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM promo_codes ORDER BY created_at DESC');
  res.json({ success: true, promos: r.rows });
});

router.post('/promos', requireAdmin, async (req, res) => {
  try {
    const { code, type, value, min_order, max_uses, per_user_limit, expires_at } = req.body;
    const r = await query(
      `INSERT INTO promo_codes (code,type,value,min_order,max_uses,per_user_limit,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [code.toUpperCase(), type||'percent', value, min_order||0, max_uses, per_user_limit||1, expires_at]
    );
    res.status(201).json({ success: true, promo: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/promos/:id', requireAdmin, async (req, res) => {
  const { is_active } = req.body;
  const r = await query('UPDATE promo_codes SET is_active=COALESCE($1,is_active) WHERE id=$2 RETURNING *', [is_active, req.params.id]);
  res.json({ success: true, promo: r.rows[0] });
});

// ── Broadcast notification ──
router.post('/notifications/broadcast', requireAdmin, async (req, res) => {
  try {
    const { title, body, target } = req.body;
    let count = 0;
    if (target === 'users' || target === 'all') {
      const r = await query('SELECT id FROM users WHERE is_active=true');
      for (const u of r.rows) { await NotificationService.sendToUser(u.id, { title, body, type: 'system' }); count++; }
    }
    if (target === 'providers' || target === 'all') {
      const r = await query('SELECT id FROM providers WHERE is_active=true');
      for (const p of r.rows) { await NotificationService.sendToProvider(p.id, { title, body, type: 'system' }); count++; }
    }
    res.json({ success: true, message: `Sent to ${count} recipients` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Subscription Plans ──
router.get('/plans', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM subscription_plans ORDER BY price ASC');
  res.json({ success: true, plans: r.rows });
});

router.post('/plans', requireAdmin, async (req, res) => {
  try {
    const { name, description, price, duration_days, features, discount_percent, color, is_featured } = req.body;
    const r = await query(
      `INSERT INTO subscription_plans (name,description,price,duration_days,features,discount_percent,color,is_featured) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [name,description,price,duration_days,JSON.stringify(features||[]),discount_percent||0,color||'#6C63FF',is_featured||false]
    );
    res.status(201).json({ success: true, plan: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/plans/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, price, duration_days, features, discount_percent, color, is_active, is_featured } = req.body;
    const r = await query(
      `UPDATE subscription_plans SET name=COALESCE($1,name),description=COALESCE($2,description),price=COALESCE($3,price),
       duration_days=COALESCE($4,duration_days),features=COALESCE($5,features),discount_percent=COALESCE($6,discount_percent),
       color=COALESCE($7,color),is_active=COALESCE($8,is_active),is_featured=COALESCE($9,is_featured),updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [name,description,price,duration_days,features?JSON.stringify(features):null,discount_percent,color,is_active,is_featured,req.params.id]
    );
    res.json({ success: true, plan: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Create admin user (super admin only) ──
router.post('/admins', requireSuperAdmin, async (req, res) => {
  try {
    const { full_name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const r = await query('INSERT INTO admins (full_name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,full_name,email,role', [full_name,email,hash,role||'admin']);
    res.status(201).json({ success: true, admin: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/admins', requireSuperAdmin, async (req, res) => {
  const r = await query('SELECT id,full_name,email,role,is_active,created_at FROM admins ORDER BY created_at DESC');
  res.json({ success: true, admins: r.rows });
});

module.exports = router;
