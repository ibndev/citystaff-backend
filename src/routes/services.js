const express = require('express');
const router  = express.Router();
const { query } = require('../config/db');
const { requireAdmin } = require('../middleware/auth');

// ── Public: Get categories ──
router.get('/categories', async (req, res) => {
  try {
    const r = await query('SELECT * FROM service_categories WHERE is_active=true ORDER BY sort_order ASC, name ASC');
    res.json({ success: true, categories: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Public: Get services ──
router.get('/', async (req, res) => {
  try {
    const { category_id, category_slug, featured, search } = req.query;
    let sql = `SELECT s.*, sc.name AS category_name, sc.slug AS category_slug, sc.color AS category_color, sc.icon_emoji AS category_icon
               FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id WHERE s.is_active=true`;
    const params = [];
    if (category_id)   { params.push(category_id);            sql += ` AND s.category_id=$${params.length}`; }
    if (category_slug) { params.push(category_slug);          sql += ` AND sc.slug=$${params.length}`; }
    if (featured==='true') sql += ` AND s.is_featured=true`;
    if (search)        { params.push(`%${search}%`);          sql += ` AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`; }
    sql += ' ORDER BY s.is_featured DESC, s.name ASC';
    const r = await query(sql, params);
    res.json({ success: true, services: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const r = await query(
      `SELECT s.*, sc.name AS category_name, sc.color AS category_color, sc.icon_emoji AS category_icon
       FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id WHERE s.id=$1 AND s.is_active=true`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Service not found' });
    res.json({ success: true, service: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════
// ADMIN — Full CRUD for categories and services
// ══════════════════════════════════════════════════════

// Categories
router.post('/categories', requireAdmin, async (req, res) => {
  try {
    const { name, description, icon_url, icon_emoji, color, sort_order } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
    const r = await query(
      `INSERT INTO service_categories (name,slug,description,icon_url,icon_emoji,color,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [name,slug,description,icon_url,icon_emoji,color||'#6C63FF',sort_order||0]
    );
    res.status(201).json({ success: true, category: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/categories/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, icon_url, icon_emoji, color, sort_order, is_active } = req.body;
    const r = await query(
      `UPDATE service_categories SET name=COALESCE($1,name),description=COALESCE($2,description),
       icon_url=COALESCE($3,icon_url),icon_emoji=COALESCE($4,icon_emoji),color=COALESCE($5,color),
       sort_order=COALESCE($6,sort_order),is_active=COALESCE($7,is_active),updated_at=NOW()
       WHERE id=$8 RETURNING *`,
      [name,description,icon_url,icon_emoji,color,sort_order,is_active,req.params.id]
    );
    res.json({ success: true, category: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/categories/:id', requireAdmin, async (req, res) => {
  await query('UPDATE service_categories SET is_active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true, message: 'Category deactivated' });
});

// Services
router.post('/', requireAdmin, async (req, res) => {
  try {
    const { category_id, name, description, short_desc, image_url, base_price, price_type, duration_mins, checklist, addons, requirements, is_featured, tags } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g,'-') + '-' + Date.now();
    const r = await query(
      `INSERT INTO services (category_id,name,slug,description,short_desc,image_url,base_price,price_type,duration_mins,checklist,addons,requirements,is_featured,tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
      [category_id,name,slug,description,short_desc,image_url,base_price,price_type||'fixed',duration_mins||60,
       JSON.stringify(checklist||[]),JSON.stringify(addons||[]),requirements,is_featured||false,JSON.stringify(tags||[])]
    );
    res.status(201).json({ success: true, service: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { name, description, short_desc, image_url, base_price, price_type, duration_mins, is_active, is_featured, checklist, addons, requirements, tags, category_id } = req.body;
    const r = await query(
      `UPDATE services SET name=COALESCE($1,name),description=COALESCE($2,description),short_desc=COALESCE($3,short_desc),
       image_url=COALESCE($4,image_url),base_price=COALESCE($5,base_price),price_type=COALESCE($6,price_type),
       duration_mins=COALESCE($7,duration_mins),is_active=COALESCE($8,is_active),is_featured=COALESCE($9,is_featured),
       checklist=COALESCE($10,checklist),addons=COALESCE($11,addons),requirements=COALESCE($12,requirements),
       tags=COALESCE($13,tags),category_id=COALESCE($14,category_id),updated_at=NOW()
       WHERE id=$15 RETURNING *`,
      [name,description,short_desc,image_url,base_price,price_type,duration_mins,is_active,is_featured,
       checklist?JSON.stringify(checklist):null,addons?JSON.stringify(addons):null,requirements,tags?JSON.stringify(tags):null,category_id,req.params.id]
    );
    res.json({ success: true, service: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  await query('UPDATE services SET is_active=false WHERE id=$1', [req.params.id]);
  res.json({ success: true, message: 'Service deactivated' });
});

// Admin: Get all services including inactive
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const r = await query(
      `SELECT s.*, sc.name AS category_name FROM services s LEFT JOIN service_categories sc ON s.category_id=sc.id ORDER BY s.is_active DESC, s.name ASC`
    );
    res.json({ success: true, services: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Admin: Get all categories including inactive
router.get('/categories/admin/all', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM service_categories ORDER BY sort_order ASC, name ASC');
  res.json({ success: true, categories: r.rows });
});

module.exports = router;
