const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { query }       = require('../config/db');
const { requireUser, requireProvider } = require('../middleware/auth');
const SettingsService  = require('../services/settings.service');

const generateOTP    = () => Math.floor(100000 + Math.random() * 900000).toString();
const generateTokens = (id, role) => ({
  access:  jwt.sign({ id, role }, process.env.JWT_SECRET,         { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }),
  refresh: jwt.sign({ id, role }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' }),
});
const saveRefresh = async (ownerId, ownerType, token) => {
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await query('INSERT INTO refresh_tokens (owner_id, owner_type, token, expires_at) VALUES ($1,$2,$3,$4)', [ownerId, ownerType, token, expires]);
};

// ── USER OTP ──
router.post('/user/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    const expiry = await SettingsService.getNumber('otp_expiry_seconds', 300);
    const otp    = generateOTP();
    const expires = new Date(Date.now() + expiry * 1000);
    await query('UPDATE otp_codes SET is_used=true WHERE phone=$1 AND is_used=false', [phone]);
    await query('INSERT INTO otp_codes (phone, code, purpose, expires_at) VALUES ($1,$2,$3,$4)', [phone, otp, 'login', expires]);
    console.log(`📱 OTP for ${phone}: ${otp}`);
    res.json({ success: true, message: 'OTP sent', ...(process.env.NODE_ENV !== 'production' && { otp }) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/user/verify-otp', async (req, res) => {
  try {
    const { phone, otp, full_name, email } = req.body;
    if (!phone || !otp) return res.status(400).json({ success: false, message: 'Phone and OTP required' });
    const otpResult = await query('SELECT * FROM otp_codes WHERE phone=$1 AND code=$2 AND is_used=false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1', [phone, otp]);
    if (!otpResult.rows[0]) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    await query('UPDATE otp_codes SET is_used=true WHERE id=$1', [otpResult.rows[0].id]);

    let user = (await query('SELECT * FROM users WHERE phone=$1', [phone])).rows[0];
    let isNew = false;
    if (!user) {
      const ref = phone.slice(-6) + Math.random().toString(36).substring(2,5).toUpperCase();
      user  = (await query('INSERT INTO users (phone,full_name,email,referral_code,is_verified) VALUES ($1,$2,$3,$4,true) RETURNING *', [phone, full_name||'New User', email||null, ref])).rows[0];
      isNew = true;
    } else {
      await query('UPDATE users SET is_verified=true WHERE id=$1', [user.id]);
    }

    const tokens = generateTokens(user.id, 'user');
    await saveRefresh(user.id, 'user', tokens.refresh);
    res.json({ success: true, isNew, tokens, user: { id: user.id, full_name: user.full_name, email: user.email, phone: user.phone, avatar_url: user.avatar_url, wallet_balance: user.wallet_balance } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/user/profile', requireUser, async (req, res) => {
  const r = await query('SELECT id,full_name,email,phone,avatar_url,address,city,state,wallet_balance,referral_code,created_at FROM users WHERE id=$1', [req.userId]);
  res.json({ success: true, user: r.rows[0] });
});

router.put('/user/profile', requireUser, async (req, res) => {
  try {
    const { full_name, email, address, latitude, longitude, city, state, push_token } = req.body;
    const r = await query(
      `UPDATE users SET full_name=COALESCE($1,full_name),email=COALESCE($2,email),address=COALESCE($3,address),
       latitude=COALESCE($4,latitude),longitude=COALESCE($5,longitude),city=COALESCE($6,city),
       state=COALESCE($7,state),push_token=COALESCE($8,push_token),updated_at=NOW() WHERE id=$9 RETURNING *`,
      [full_name,email,address,latitude,longitude,city,state,push_token,req.userId]
    );
    res.json({ success: true, user: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PROVIDER OTP ──
router.post('/provider/send-otp', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    const expiry = await SettingsService.getNumber('otp_expiry_seconds', 300);
    const otp    = generateOTP();
    await query('UPDATE otp_codes SET is_used=true WHERE phone=$1', [phone]);
    await query('INSERT INTO otp_codes (phone,code,purpose,expires_at) VALUES ($1,$2,$3,$4)', [phone, otp, 'provider_login', new Date(Date.now()+expiry*1000)]);
    console.log(`📱 Provider OTP ${phone}: ${otp}`);
    res.json({ success: true, message: 'OTP sent', ...(process.env.NODE_ENV !== 'production' && { otp }) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.post('/provider/verify-otp', async (req, res) => {
  try {
    const { phone, otp, full_name, email } = req.body;
    const otpResult = await query('SELECT * FROM otp_codes WHERE phone=$1 AND code=$2 AND is_used=false AND expires_at > NOW() LIMIT 1', [phone, otp]);
    if (!otpResult.rows[0]) return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
    await query('UPDATE otp_codes SET is_used=true WHERE id=$1', [otpResult.rows[0].id]);

    let provider = (await query('SELECT * FROM providers WHERE phone=$1', [phone])).rows[0];
    let isNew    = false;
    if (!provider) {
      provider = (await query('INSERT INTO providers (phone,full_name,email,is_verified) VALUES ($1,$2,$3,false) RETURNING *', [phone, full_name||'New Provider', email||null])).rows[0];
      isNew = true;
    }
    const tokens = generateTokens(provider.id, 'provider');
    await saveRefresh(provider.id, 'provider', tokens.refresh);
    res.json({ success: true, isNew, tokens, provider: { id: provider.id, full_name: provider.full_name, email: provider.email, phone: provider.phone, is_verified: provider.is_verified, is_available: provider.is_available, wallet_balance: provider.wallet_balance, rating: provider.rating } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── ADMIN LOGIN ──
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const r = await query('SELECT * FROM admins WHERE email=$1 AND is_active=true', [email]);
    if (!r.rows[0]) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, r.rows[0].password_hash);
    if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' });
    const tokens = generateTokens(r.rows[0].id, r.rows[0].role);
    await saveRefresh(r.rows[0].id, 'admin', tokens.refresh);
    res.json({ success: true, tokens, admin: { id: r.rows[0].id, full_name: r.rows[0].full_name, email: r.rows[0].email, role: r.rows[0].role } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── REFRESH TOKEN ──
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const r = await query('SELECT * FROM refresh_tokens WHERE token=$1 AND expires_at > NOW()', [refreshToken]);
    if (!r.rows[0]) return res.status(401).json({ success: false, message: 'Invalid refresh token' });
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokens  = generateTokens(r.rows[0].owner_id, decoded.role);
    await query('DELETE FROM refresh_tokens WHERE token=$1', [refreshToken]);
    await saveRefresh(r.rows[0].owner_id, r.rows[0].owner_type, tokens.refresh);
    res.json({ success: true, tokens });
  } catch { res.status(401).json({ success: false, message: 'Token refresh failed' }); }
});

router.post('/logout', async (req, res) => {
  if (req.body?.refreshToken) await query('DELETE FROM refresh_tokens WHERE token=$1', [req.body.refreshToken]);
  res.json({ success: true, message: 'Logged out' });
});

module.exports = router;
