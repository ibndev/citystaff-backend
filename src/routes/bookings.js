// ── BOOKINGS ──
const express  = require('express');
const bookings = express.Router();
const { query, getClient } = require('../config/db');
const { requireUser, requireProvider, requireAdmin, requireAnyAuth } = require('../middleware/auth');
const DispatchService    = require('../services/dispatch.service');
const SettingsService    = require('../services/settings.service');
const NotificationService = require('../services/notification.service');

const generateRef = () => 'CSB' + Date.now().toString().slice(-8) + Math.random().toString(36).substring(2,5).toUpperCase();

bookings.post('/', requireUser, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { service_id, address, latitude, longitude, scheduled_at, selected_addons, notes, promo_code, payment_method } = req.body;
    if (!service_id || !address) return res.status(400).json({ success: false, message: 'Service and address required' });

    const svc = (await client.query('SELECT * FROM services WHERE id=$1 AND is_active=true', [service_id])).rows[0];
    if (!svc) return res.status(404).json({ success: false, message: 'Service not found' });

    // Calculate addons
    let addonsPrice = 0;
    if (selected_addons?.length) {
      (svc.addons||[]).forEach(a => { if (selected_addons.includes(a.name)) addonsPrice += parseFloat(a.price||0); });
    }

    // Promo discount
    let discount = 0;
    if (promo_code) {
      const promo = (await client.query(`SELECT * FROM promo_codes WHERE code=$1 AND is_active=true AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR used_count < max_uses)`, [promo_code.toUpperCase()])).rows[0];
      if (promo) {
        const subtotal = parseFloat(svc.base_price) + addonsPrice;
        if (subtotal >= parseFloat(promo.min_order)) {
          discount = promo.type==='percent' ? subtotal*(parseFloat(promo.value)/100) : Math.min(parseFloat(promo.value), subtotal);
        }
      }
    }

    const commission = await SettingsService.getNumber('platform_commission', 15);
    const taxPct     = await SettingsService.getNumber('tax_percent', 0);
    const base       = parseFloat(svc.base_price);
    const total      = Math.max(0, base + addonsPrice - discount);
    const tax        = total * (taxPct/100);
    const totalWithTax = total + tax;
    const fee        = totalWithTax * (commission/100);
    const payout     = totalWithTax - fee;

    if (payment_method === 'wallet') {
      const u = (await client.query('SELECT wallet_balance FROM users WHERE id=$1', [req.userId])).rows[0];
      if (parseFloat(u.wallet_balance) < totalWithTax) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
      }
      await client.query('UPDATE users SET wallet_balance=wallet_balance-$1 WHERE id=$2', [totalWithTax, req.userId]);
    }

    const b = (await client.query(
      `INSERT INTO bookings (booking_ref,user_id,service_id,address,latitude,longitude,scheduled_at,base_price,addons_price,discount,total_price,platform_fee,provider_payout,selected_addons,notes,promo_code,payment_method,payment_status,status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'pending') RETURNING *`,
      [generateRef(),req.userId,service_id,address,latitude,longitude,scheduled_at||null,base,addonsPrice,discount,totalWithTax,fee,payout,JSON.stringify(selected_addons||[]),notes,promo_code,payment_method,payment_method==='wallet'?'paid':'unpaid']
    )).rows[0];

    await client.query('COMMIT');
    DispatchService.startDispatch(b.id).catch(console.error);

    const successTitle = await SettingsService.get('booking_success_title', 'Booking Confirmed!');
    const successBody  = await SettingsService.get('booking_success_body', 'Finding the best provider near you...');
    res.status(201).json({ success: true, message: `${successTitle} ${successBody}`, booking: { ...b, service_name: svc.name } });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); }
  finally { client.release(); }
});

bookings.get('/my', requireUser, async (req, res) => {
  try {
    const { status, page=1, limit=20 } = req.query;
    const offset = (page-1)*limit;
    let sql = `SELECT b.*, s.name AS service_name, s.image_url AS service_image, p.full_name AS provider_name, p.phone AS provider_phone, p.avatar_url AS provider_avatar, p.rating AS provider_rating FROM bookings b LEFT JOIN services s ON b.service_id=s.id LEFT JOIN providers p ON b.provider_id=p.id WHERE b.user_id=$1`;
    const params = [req.userId];
    if (status) { params.push(status); sql += ` AND b.status=$${params.length}`; }
    params.push(limit, offset); sql += ` ORDER BY b.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`;
    const r = await query(sql, params);
    res.json({ success: true, bookings: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

bookings.get('/provider/my', requireProvider, async (req, res) => {
  try {
    const { status, page=1, limit=20 } = req.query;
    const offset = (page-1)*limit;
    let sql = `SELECT b.*, s.name AS service_name, u.full_name AS user_name, u.phone AS user_phone FROM bookings b LEFT JOIN services s ON b.service_id=s.id LEFT JOIN users u ON b.user_id=u.id WHERE b.provider_id=$1`;
    const params = [req.providerId];
    if (status) { params.push(status); sql += ` AND b.status=$${params.length}`; }
    params.push(limit, offset); sql += ` ORDER BY b.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`;
    const r = await query(sql, params);
    res.json({ success: true, bookings: r.rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

bookings.get('/:id', requireAnyAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT b.*, s.name AS service_name, s.image_url AS service_image, s.checklist AS service_checklist,
       u.full_name AS user_name, u.phone AS user_phone, u.avatar_url AS user_avatar,
       p.full_name AS provider_name, p.phone AS provider_phone, p.avatar_url AS provider_avatar, p.rating AS provider_rating
       FROM bookings b LEFT JOIN services s ON b.service_id=s.id LEFT JOIN users u ON b.user_id=u.id LEFT JOIN providers p ON b.provider_id=p.id WHERE b.id=$1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ success: false, message: 'Booking not found' });
    res.json({ success: true, booking: r.rows[0] });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

bookings.put('/:id/cancel', requireUser, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const b = (await client.query('SELECT * FROM bookings WHERE id=$1 AND user_id=$2', [req.params.id, req.userId])).rows[0];
    if (!b) return res.status(404).json({ success: false, message: 'Not found' });
    if (!['pending','dispatching','accepted'].includes(b.status)) return res.status(400).json({ success: false, message: 'Cannot cancel at this stage' });
    await client.query(`UPDATE bookings SET status='cancelled',cancelled_at=NOW(),cancel_reason=$1,cancelled_by='user' WHERE id=$2`, [req.body.reason, b.id]);
    if (b.payment_method==='wallet' && b.payment_status==='paid') {
      await client.query('UPDATE users SET wallet_balance=wallet_balance+$1 WHERE id=$2', [b.total_price, req.userId]);
    }
    await client.query('COMMIT');
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) { await client.query('ROLLBACK'); res.status(500).json({ success: false, message: err.message }); }
  finally { client.release(); }
});

bookings.put('/:id/accept',   requireProvider, async (req,res) => { try { const b = await DispatchService.acceptOffer(req.params.id, req.providerId); res.json({success:true,message:'Job accepted!',booking:b}); } catch(err) { res.status(400).json({success:false,message:err.message}); } });
bookings.put('/:id/decline',  requireProvider, async (req,res) => { try { await DispatchService.declineOffer(req.params.id, req.providerId); res.json({success:true,message:'Job declined'}); } catch(err) { res.status(400).json({success:false,message:err.message}); } });
bookings.put('/:id/start',    requireProvider, async (req,res) => { await query(`UPDATE bookings SET status='in_progress',started_at=NOW() WHERE id=$1 AND provider_id=$2 AND status='accepted'`,[req.params.id,req.providerId]); res.json({success:true,message:'Job started'}); });

bookings.put('/:id/complete', requireProvider, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const r = await client.query(`UPDATE bookings SET status='completed',completed_at=NOW(),payment_status='paid' WHERE id=$1 AND provider_id=$2 AND status='in_progress' RETURNING *`, [req.params.id, req.providerId]);
    if (!r.rows[0]) return res.status(400).json({success:false,message:'Cannot complete'});
    const b = r.rows[0];
    await client.query('UPDATE providers SET wallet_balance=wallet_balance+$1,total_earnings=total_earnings+$1,completed_jobs=completed_jobs+1 WHERE id=$2', [b.provider_payout, req.providerId]);
    await client.query('COMMIT');
    const sym = await SettingsService.get('currency_symbol','₦');
    await NotificationService.sendToUser(b.user_id, { title:'✅ Job Completed', body:`Your job is done! Please rate your experience.`, type:'booking_completed', data:{booking_id:b.id} });
    res.json({success:true, message:`Job completed! ${sym}${Number(b.provider_payout).toLocaleString()} credited to your wallet.`});
  } catch(err) { await client.query('ROLLBACK'); res.status(500).json({success:false,message:err.message}); }
  finally { client.release(); }
});

bookings.post('/:id/rate', requireUser, async (req, res) => {
  try {
    const { rating, review } = req.body;
    if (!rating || rating<1 || rating>5) return res.status(400).json({success:false,message:'Rating must be 1-5'});
    const b = (await query('SELECT * FROM bookings WHERE id=$1 AND user_id=$2 AND status=$3',[req.params.id,req.userId,'completed'])).rows[0];
    if (!b || b.rating) return res.status(400).json({success:false,message:b?.rating?'Already rated':'Not found'});
    await query('UPDATE bookings SET rating=$1,review=$2,rated_at=NOW() WHERE id=$3',[rating,review,b.id]);
    await query(`INSERT INTO reviews (booking_id,user_id,provider_id,rating,comment) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (booking_id) DO UPDATE SET rating=$4,comment=$5`,[b.id,req.userId,b.provider_id,rating,review]);
    if (b.provider_id) await query(`UPDATE providers SET rating=(SELECT ROUND(AVG(rating)::numeric,2) FROM reviews WHERE provider_id=$1),rating_count=(SELECT COUNT(*) FROM reviews WHERE provider_id=$1) WHERE id=$1`,[b.provider_id]);
    res.json({success:true,message:'Thank you for your rating!'});
  } catch(err) { res.status(500).json({success:false,message:err.message}); }
});

module.exports = bookings;
