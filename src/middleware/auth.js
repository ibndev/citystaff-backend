const jwt    = require('jsonwebtoken');
const { query } = require('../config/db');

const extractToken = (req) => {
  const auth = req.headers.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.substring(7) : null;
};

const requireUser = async (req, res, next) => {
  try {
    const token   = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'user') return res.status(403).json({ success: false, message: 'Access denied' });
    const r = await query('SELECT id, full_name, email, phone, is_active, wallet_balance FROM users WHERE id = $1', [decoded.id]);
    if (!r.rows[0] || !r.rows[0].is_active) return res.status(401).json({ success: false, message: 'Account not found or suspended' });
    req.user = r.rows[0]; req.userId = decoded.id;
    next();
  } catch { return res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
};

const requireProvider = async (req, res, next) => {
  try {
    const token   = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'provider') return res.status(403).json({ success: false, message: 'Access denied' });
    const r = await query('SELECT id, full_name, email, phone, is_active, is_verified, wallet_balance, is_available FROM providers WHERE id = $1', [decoded.id]);
    if (!r.rows[0] || !r.rows[0].is_active) return res.status(401).json({ success: false, message: 'Account not found or suspended' });
    req.provider = r.rows[0]; req.providerId = decoded.id;
    next();
  } catch { return res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
};

const requireAdmin = async (req, res, next) => {
  try {
    const token   = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!['admin', 'super_admin'].includes(decoded.role)) return res.status(403).json({ success: false, message: 'Admin access required' });
    const r = await query('SELECT id, full_name, email, role, is_active FROM admins WHERE id = $1', [decoded.id]);
    if (!r.rows[0] || !r.rows[0].is_active) return res.status(401).json({ success: false, message: 'Admin not found' });
    req.admin = r.rows[0]; req.adminId = decoded.id;
    next();
  } catch { return res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
};

const requireSuperAdmin = async (req, res, next) => {
  await requireAdmin(req, res, () => {
    if (req.admin.role !== 'super_admin') return res.status(403).json({ success: false, message: 'Super admin only' });
    next();
  });
};

const requireAnyAuth = async (req, res, next) => {
  try {
    const token   = extractToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Authentication required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.authRole = decoded.role; req.authId = decoded.id;
    if (decoded.role === 'user') {
      const r = await query('SELECT id, full_name FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
      if (!r.rows[0]) return res.status(401).json({ success: false, message: 'Not found' });
      req.user = r.rows[0];
    } else if (decoded.role === 'provider') {
      const r = await query('SELECT id, full_name FROM providers WHERE id = $1 AND is_active = true', [decoded.id]);
      if (!r.rows[0]) return res.status(401).json({ success: false, message: 'Not found' });
      req.provider = r.rows[0];
    } else {
      const r = await query('SELECT id, full_name FROM admins WHERE id = $1 AND is_active = true', [decoded.id]);
      if (!r.rows[0]) return res.status(401).json({ success: false, message: 'Not found' });
      req.admin = r.rows[0];
    }
    next();
  } catch { return res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
};

module.exports = { requireUser, requireProvider, requireAdmin, requireSuperAdmin, requireAnyAuth };
