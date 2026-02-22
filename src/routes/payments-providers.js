// ── PAYMENTS ROUTER ──
const express   = require('express');
const payments  = express.Router();
const axios     = require('axios');
const { query, getClient } = require('../config/db');
const { requireUser, requireProvider, requireAdmin } = require('../middleware/auth');
const SettingsService = require('../services/settings.service');

const getFWKey = () => {
  const mode = process.env.FLUTTERWAVE_MODE || 'test';
  return mode==='live' ? process.env.FLUTTERWAVE_SECRET_KEY_LIVE : process.env.FLUTTERWAVE_SECRET_KEY_TEST;
};

payments.post('/wallet/topup/init', requireUser, async (req,res) => {
  try {
    const { amount } = req.body;
    const minTopup = await SettingsService.getNumber('wallet_minimum_topup', 1000);
    if (!amount || parseFloat(amount) < minTopup) return res.status(400).json({success:false,message:`Minimum top-up is ${await SettingsService.get('currency_symbol','₦')}${minTopup}`});
    const u   = (await query('SELECT full_name,email,phone FROM users WHERE id=$1',[req.userId])).rows[0];
    const ref = 'WALLET_' + Date.now() + '_' + req.userId.split('-')[0];
    const mode = process.env.FLUTTERWAVE_MODE || 'test';
    const pubKey = mode==='live' ? process.env.FLUTTERWAVE_PUBLIC_KEY_LIVE : process.env.FLUTTERWAVE_PUBLIC_KEY_TEST;
    await query(`INSERT INTO payments (user_id,type,amount,currency,status,gateway,gateway_ref,metadata) VALUES ($1,'wallet_topup',$2,'NGN','pending','flutterwave',$3,$4)`,[req.userId,amount,ref,JSON.stringify({user_id:req.userId})]);
    const currency = await SettingsService.get('default_currency','NGN');
    res.json({success:true,payment_ref:ref,public_key:pubKey,amount:parseFloat(amount),currency,customer:{name:u.full_name,email:u.email||'user@app.com',phone:u.phone}});
  } catch(err) { res.status(500).json({success:false,message:err.message}); }
});

payments.post('/verify', requireUser, async (req,res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { transaction_id, tx_ref } = req.body;
    if (!transaction_id) return res.status(400).json({success:false,message:'Transaction ID required'});
    const fwRes  = await axios.get(`https://api.flutterwave.com/v3/transactions/${transaction_id}/verify`,{headers:{Authorization:`Bearer ${getFWKey()}`}});
    const fwData = fwRes.data?.data;
    if (!fwData || fwData.status !== 'successful') { await client.query('ROLLBACK'); return res.status(400).json({success:false,message:'Payment verification failed'}); }
    const amount = parseFloat(fwData.amount);
    const existing = (await client.query(`SELECT id FROM payments WHERE gateway_ref=$1 AND status='success'`,[fwData.tx_ref])).rows[0];
    if (existing) { await client.query('ROLLBACK'); return res.json({success:true,message:'Already processed'}); }
    await client.query('UPDATE users SET wallet_balance=wallet_balance+$1 WHERE id=$2',[amount,req.userId]);
    const u = (await client.query('SELECT wallet_balance FROM users WHERE id=$1',[req.userId])).rows[0];
    await client.query(`INSERT INTO wallet_transactions (owner_type,owner_id,type,reason,amount,balance_before,balance_after,description,reference) VALUES ('user',$1,'credit','topup',$2,$3,$4,$5,$6)`,[req.userId,amount,parseFloat(u.wallet_balance)-amount,u.wallet_balance,'Wallet top-up via Flutterwave',fwData.tx_ref]);
    await client.query(`UPDATE payments SET status='success',gateway_txn_id=$1 WHERE gateway_ref=$2`,[String(transaction_id),fwData.tx_ref]);
    await client.query('COMMIT');
    const sym = await SettingsService.get('currency_symbol','₦');
    res.json({success:true,message:`${sym}${amount.toLocaleString()} added to your wallet!`,new_balance:u.wallet_balance});
  } catch(err) { await client.query('ROLLBACK'); res.status(500).json({success:false,message:err.message}); }
  finally { client.release(); }
});

payments.get('/wallet', requireUser, async (req,res) => {
  const u  = (await query('SELECT wallet_balance FROM users WHERE id=$1',[req.userId])).rows[0];
  const tx = await query(`SELECT * FROM wallet_transactions WHERE owner_type='user' AND owner_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.userId]);
  res.json({success:true,balance:u.wallet_balance,transactions:tx.rows});
});

payments.get('/provider/wallet', requireProvider, async (req,res) => {
  const p  = (await query('SELECT wallet_balance,total_earnings FROM providers WHERE id=$1',[req.providerId])).rows[0];
  const tx = await query(`SELECT * FROM wallet_transactions WHERE owner_type='provider' AND owner_id=$1 ORDER BY created_at DESC LIMIT 50`,[req.providerId]);
  res.json({success:true,...p,transactions:tx.rows});
});

payments.post('/provider/payout', requireProvider, async (req,res) => {
  try {
    const { amount } = req.body;
    const p = (await query('SELECT * FROM providers WHERE id=$1',[req.providerId])).rows[0];
    const minPayout = await SettingsService.getNumber('provider_min_payout', 5000);
    if (parseFloat(amount) < minPayout) return res.status(400).json({success:false,message:`Minimum payout is ${await SettingsService.get('currency_symbol','₦')}${minPayout}`});
    if (parseFloat(amount) > parseFloat(p.wallet_balance)) return res.status(400).json({success:false,message:'Insufficient wallet balance'});
    if (!p.bank_account_no) return res.status(400).json({success:false,message:'Please add bank account details first'});
    await query('UPDATE providers SET wallet_balance=wallet_balance-$1 WHERE id=$2',[amount,req.providerId]);
    await query(`INSERT INTO provider_payouts (provider_id,amount,bank_name,bank_account_no,bank_account_name,bank_code) VALUES ($1,$2,$3,$4,$5,$6)`,[req.providerId,amount,p.bank_name,p.bank_account_no,p.bank_account_name,p.bank_code]);
    res.json({success:true,message:'Payout request submitted. Processing within 24 hours.'});
  } catch(err) { res.status(500).json({success:false,message:err.message}); }
});

payments.post('/webhook/flutterwave', async (req,res) => {
  const secret = req.headers['verif-hash'];
  if (secret !== process.env.FLUTTERWAVE_WEBHOOK_SECRET) return res.status(401).json({success:false});
  console.log('🔔 FW Webhook:', req.body?.event, req.body?.data?.tx_ref);
  res.json({success:true});
});


// ── PROVIDERS ROUTER ──
const providers = express.Router();

providers.get('/profile', require('../middleware/auth').requireProvider, async (req,res) => {
  const r = await query(`SELECT p.*, ARRAY_AGG(DISTINCT ps.service_id) FILTER (WHERE ps.service_id IS NOT NULL) AS service_ids FROM providers p LEFT JOIN provider_services ps ON p.id=ps.provider_id WHERE p.id=$1 GROUP BY p.id`,[req.providerId]);
  res.json({success:true,provider:r.rows[0]});
});

providers.put('/profile', require('../middleware/auth').requireProvider, async (req,res) => {
  try {
    const { full_name,email,bio,address,city,state,bank_name,bank_account_no,bank_account_name,bank_code,push_token } = req.body;
    const r = await query(`UPDATE providers SET full_name=COALESCE($1,full_name),email=COALESCE($2,email),bio=COALESCE($3,bio),address=COALESCE($4,address),city=COALESCE($5,city),state=COALESCE($6,state),bank_name=COALESCE($7,bank_name),bank_account_no=COALESCE($8,bank_account_no),bank_account_name=COALESCE($9,bank_account_name),bank_code=COALESCE($10,bank_code),push_token=COALESCE($11,push_token),updated_at=NOW() WHERE id=$12 RETURNING *`,[full_name,email,bio,address,city,state,bank_name,bank_account_no,bank_account_name,bank_code,push_token,req.providerId]);
    res.json({success:true,provider:r.rows[0]});
  } catch(err) { res.status(500).json({success:false,message:err.message}); }
});

providers.put('/availability', require('../middleware/auth').requireProvider, async (req,res) => {
  const r = await query('UPDATE providers SET is_available=$1,updated_at=NOW() WHERE id=$2 RETURNING is_available',[req.body.is_available,req.providerId]);
  res.json({success:true,is_available:r.rows[0].is_available});
});

providers.put('/location', require('../middleware/auth').requireProvider, async (req,res) => {
  const { latitude,longitude,heading,speed } = req.body;
  if (!latitude||!longitude) return res.status(400).json({success:false,message:'Location required'});
  await query(`INSERT INTO provider_locations (provider_id,latitude,longitude,heading,speed,updated_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (provider_id) DO UPDATE SET latitude=$2,longitude=$3,heading=$4,speed=$5,updated_at=NOW()`,[req.providerId,latitude,longitude,heading,speed]);
  await query('UPDATE providers SET latitude=$1,longitude=$2,is_online=true,last_seen=NOW() WHERE id=$3',[latitude,longitude,req.providerId]);
  const active = await query(`SELECT user_id FROM bookings WHERE provider_id=$1 AND status='in_progress'`,[req.providerId]);
  if (global.io) active.rows.forEach(r => global.io.to(`user_${r.user_id}`).emit('provider_location',{provider_id:req.providerId,latitude,longitude,heading,speed}));
  res.json({success:true});
});

providers.put('/services', require('../middleware/auth').requireProvider, async (req,res) => {
  const { service_ids } = req.body;
  await query('DELETE FROM provider_services WHERE provider_id=$1',[req.providerId]);
  if (service_ids?.length) {
    const vals = service_ids.map((_,i) => `($1,$${i+2})`).join(',');
    await query(`INSERT INTO provider_services (provider_id,service_id) VALUES ${vals}`,[req.providerId,...service_ids]);
  }
  res.json({success:true,message:'Services updated'});
});

providers.get('/earnings', require('../middleware/auth').requireProvider, async (req,res) => {
  const r = await query(`SELECT COUNT(*) FILTER (WHERE status='completed') AS total_completed, SUM(provider_payout) FILTER (WHERE status='completed') AS total_earned, SUM(provider_payout) FILTER (WHERE status='completed' AND completed_at >= NOW()-INTERVAL '30 days') AS this_month, SUM(provider_payout) FILTER (WHERE status='completed' AND completed_at >= NOW()-INTERVAL '7 days') AS this_week FROM bookings WHERE provider_id=$1`,[req.providerId]);
  const w = (await query('SELECT wallet_balance FROM providers WHERE id=$1',[req.providerId])).rows[0];
  res.json({success:true,earnings:r.rows[0],wallet_balance:w.wallet_balance});
});

module.exports = { payments, providers };
