const express = require('express');
const router  = express.Router();
const { query }       = require('../config/db');
const { requireAdmin, requireSuperAdmin } = require('../middleware/auth');
const SettingsService  = require('../services/settings.service');

// ══════════════════════════════════════════════════════
// PUBLIC — Frontend fetches these WITHOUT auth
// ══════════════════════════════════════════════════════

// All public settings (app name, colors, texts, etc.)
router.get('/config', async (req, res) => {
  try {
    const settings = await SettingsService.getPublic();
    res.json({ success: true, config: settings });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Get sections for a specific page
router.get('/sections/:page', async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM frontend_sections WHERE page=$1 AND is_active=true ORDER BY sort_order ASC`,
      [req.params.page]
    );
    res.json({ success: true, sections: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Get active banners by position
router.get('/banners', async (req, res) => {
  try {
    const { position } = req.query;
    let sql    = `SELECT * FROM banners WHERE is_active=true AND (starts_at IS NULL OR starts_at <= NOW()) AND (expires_at IS NULL OR expires_at > NOW())`;
    const params = [];
    if (position) { params.push(position); sql += ` AND position=$${params.length}`; }
    sql += ' ORDER BY sort_order ASC';
    const r = await query(sql, params);
    res.json({ success: true, banners: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Get FAQs
router.get('/faqs', async (req, res) => {
  try {
    const { category } = req.query;
    const params = [];
    let sql = `SELECT * FROM faqs WHERE is_active=true`;
    if (category) { params.push(category); sql += ` AND category=$${params.length}`; }
    sql += ' ORDER BY sort_order ASC';
    const r = await query(sql, params);
    res.json({ success: true, faqs: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Get navigation items
router.get('/navigation/:menu', async (req, res) => {
  try {
    const r = await query(
      `SELECT * FROM navigation_items WHERE menu=$1 AND is_active=true ORDER BY sort_order ASC`,
      [req.params.menu]
    );
    res.json({ success: true, items: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════
// ADMIN — Settings management
// ══════════════════════════════════════════════════════

// Get all settings grouped (for admin panel)
router.get('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const grouped = await SettingsService.getAllGrouped();
    res.json({ success: true, settings: grouped });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Update multiple settings at once
router.put('/admin/settings', requireAdmin, async (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') return res.status(400).json({ success: false, message: 'Settings object required' });
    await SettingsService.updateMany(settings);
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Update single setting
router.put('/admin/settings/:key', requireAdmin, async (req, res) => {
  try {
    await SettingsService.update(req.params.key, req.body.value);
    res.json({ success: true, message: 'Setting updated' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── Sections (Page CMS) ──
router.get('/admin/sections', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM frontend_sections ORDER BY page, sort_order ASC');
  res.json({ success: true, sections: r.rows });
});

router.post('/admin/sections', requireAdmin, async (req, res) => {
  try {
    const { page, section_key, title, subtitle, body, image_url, button_text, button_url, bg_color, text_color, sort_order, meta } = req.body;
    const r = await query(
      `INSERT INTO frontend_sections (page,section_key,title,subtitle,body,image_url,button_text,button_url,bg_color,text_color,sort_order,meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [page, section_key, title, subtitle, body, image_url, button_text, button_url, bg_color, text_color, sort_order||0, JSON.stringify(meta||{})]
    );
    res.status(201).json({ success: true, section: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/admin/sections/:id', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, body, image_url, button_text, button_url, bg_color, text_color, is_active, sort_order, meta } = req.body;
    const r = await query(
      `UPDATE frontend_sections SET title=COALESCE($1,title),subtitle=COALESCE($2,subtitle),body=COALESCE($3,body),
       image_url=COALESCE($4,image_url),button_text=COALESCE($5,button_text),button_url=COALESCE($6,button_url),
       bg_color=COALESCE($7,bg_color),text_color=COALESCE($8,text_color),is_active=COALESCE($9,is_active),
       sort_order=COALESCE($10,sort_order),meta=COALESCE($11,meta),updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [title,subtitle,body,image_url,button_text,button_url,bg_color,text_color,is_active,sort_order,meta?JSON.stringify(meta):null,req.params.id]
    );
    res.json({ success: true, section: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/admin/sections/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM frontend_sections WHERE id=$1', [req.params.id]);
  res.json({ success: true, message: 'Section deleted' });
});

// ── Banners ──
router.get('/admin/banners', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM banners ORDER BY sort_order ASC, created_at DESC');
  res.json({ success: true, banners: r.rows });
});

router.post('/admin/banners', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, image_url, link_url, position, is_active, starts_at, expires_at, sort_order } = req.body;
    if (!image_url) return res.status(400).json({ success: false, message: 'Image URL required' });
    const r = await query(
      `INSERT INTO banners (title,subtitle,image_url,link_url,position,is_active,starts_at,expires_at,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title,subtitle,image_url,link_url,position||'home_top',is_active!==false,starts_at,expires_at,sort_order||0]
    );
    res.status(201).json({ success: true, banner: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/admin/banners/:id', requireAdmin, async (req, res) => {
  try {
    const { title, subtitle, image_url, link_url, position, is_active, starts_at, expires_at, sort_order } = req.body;
    const r = await query(
      `UPDATE banners SET title=COALESCE($1,title),subtitle=COALESCE($2,subtitle),image_url=COALESCE($3,image_url),
       link_url=COALESCE($4,link_url),position=COALESCE($5,position),is_active=COALESCE($6,is_active),
       starts_at=$7,expires_at=$8,sort_order=COALESCE($9,sort_order) WHERE id=$10 RETURNING *`,
      [title,subtitle,image_url,link_url,position,is_active,starts_at,expires_at,sort_order,req.params.id]
    );
    res.json({ success: true, banner: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/admin/banners/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM banners WHERE id=$1', [req.params.id]);
  res.json({ success: true, message: 'Banner deleted' });
});

// ── FAQs ──
router.get('/admin/faqs', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM faqs ORDER BY category, sort_order ASC');
  res.json({ success: true, faqs: r.rows });
});

router.post('/admin/faqs', requireAdmin, async (req, res) => {
  try {
    const { question, answer, category, sort_order } = req.body;
    const r = await query('INSERT INTO faqs (question,answer,category,sort_order) VALUES ($1,$2,$3,$4) RETURNING *', [question,answer,category||'general',sort_order||0]);
    res.status(201).json({ success: true, faq: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/admin/faqs/:id', requireAdmin, async (req, res) => {
  try {
    const { question, answer, category, sort_order, is_active } = req.body;
    const r = await query(
      `UPDATE faqs SET question=COALESCE($1,question),answer=COALESCE($2,answer),category=COALESCE($3,category),
       sort_order=COALESCE($4,sort_order),is_active=COALESCE($5,is_active) WHERE id=$6 RETURNING *`,
      [question,answer,category,sort_order,is_active,req.params.id]
    );
    res.json({ success: true, faq: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/admin/faqs/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM faqs WHERE id=$1', [req.params.id]);
  res.json({ success: true, message: 'FAQ deleted' });
});

// ── Navigation ──
router.get('/admin/navigation', requireAdmin, async (req, res) => {
  const r = await query('SELECT * FROM navigation_items ORDER BY menu, sort_order ASC');
  res.json({ success: true, items: r.rows });
});

router.post('/admin/navigation', requireAdmin, async (req, res) => {
  try {
    const { menu, label, url, icon, parent_id, sort_order, open_new_tab } = req.body;
    const r = await query(
      `INSERT INTO navigation_items (menu,label,url,icon,parent_id,sort_order,open_new_tab) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [menu,label,url,icon,parent_id||null,sort_order||0,open_new_tab||false]
    );
    res.status(201).json({ success: true, item: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.put('/admin/navigation/:id', requireAdmin, async (req, res) => {
  try {
    const { label, url, icon, sort_order, is_active, open_new_tab } = req.body;
    const r = await query(
      `UPDATE navigation_items SET label=COALESCE($1,label),url=COALESCE($2,url),icon=COALESCE($3,icon),
       sort_order=COALESCE($4,sort_order),is_active=COALESCE($5,is_active),open_new_tab=COALESCE($6,open_new_tab) WHERE id=$7 RETURNING *`,
      [label,url,icon,sort_order,is_active,open_new_tab,req.params.id]
    );
    res.json({ success: true, item: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.delete('/admin/navigation/:id', requireAdmin, async (req, res) => {
  await query('DELETE FROM navigation_items WHERE id=$1', [req.params.id]);
  res.json({ success: true, message: 'Item deleted' });
});

module.exports = router;
