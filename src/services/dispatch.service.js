const { query, getClient } = require('../config/db');
const SettingsService      = require('./settings.service');
const NotificationService  = require('./notification.service');

class DispatchService {

  static calculateDistance(lat1, lon1, lat2, lon2) {
    const R    = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a    = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  static async findNearbyProviders(serviceId, lat, lng, maxKm, excludeIds = []) {
    const result = await query(
      `SELECT DISTINCT p.id, p.full_name, p.phone, p.push_token, p.latitude, p.longitude, p.rating
       FROM providers p
       INNER JOIN provider_services ps ON p.id = ps.provider_id
       WHERE ps.service_id = $1 AND p.is_online = true AND p.is_available = true
       AND p.is_verified = true AND p.is_active = true
       AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
       ${excludeIds.length ? 'AND p.id != ALL($2::uuid[])' : ''}`,
      excludeIds.length ? [serviceId, excludeIds] : [serviceId]
    );

    const mode = await SettingsService.get('dispatch_mode', 'nearest');
    return result.rows
      .map(p => ({ ...p, distance_km: DispatchService.calculateDistance(parseFloat(lat), parseFloat(lng), parseFloat(p.latitude), parseFloat(p.longitude)) }))
      .filter(p => p.distance_km <= maxKm)
      .sort((a, b) => {
        if (mode === 'rating') return b.rating - a.rating;
        if (mode === 'hybrid') return (a.distance_km * 0.6) - (b.rating * 0.4) - ((b.distance_km * 0.6) - (a.rating * 0.4));
        return a.distance_km - b.distance_km; // nearest (default)
      });
  }

  static async startDispatch(bookingId) {
    try {
      const bResult = await query('SELECT * FROM bookings WHERE id = $1 AND status = $2', [bookingId, 'pending']);
      if (!bResult.rows[0]) return;
      await query(`UPDATE bookings SET status = 'dispatching' WHERE id = $1`, [bookingId]);
      const maxAttempts = await SettingsService.getNumber('dispatch_max_attempts', 5);
      await DispatchService.offerToNext(bResult.rows[0], [], 1, maxAttempts);
    } catch (err) {
      console.error('Dispatch start error:', err.message);
      await query(`UPDATE bookings SET status = 'pending' WHERE id = $1`, [bookingId]);
    }
  }

  static async offerToNext(booking, triedIds, attempt, maxAttempts) {
    // All values from database settings — no hardcoding
    const ttl    = await SettingsService.getNumber('dispatch_offer_ttl', 30); // Default 30s like Uber
    const maxKm  = await SettingsService.getNumber('dispatch_max_distance', 50);
    const appName = await SettingsService.get('app_name', 'City Staff');
    const offerTitle = await SettingsService.get('dispatch_offer_title', 'New Job Available!');
    const currencySymbol = await SettingsService.get('currency_symbol', '₦');

    if (attempt > maxAttempts) {
      await query(`UPDATE bookings SET status = 'pending' WHERE id = $1`, [booking.id]);
      const noProvText = await SettingsService.get('no_providers_text', 'No providers available nearby. Please try again shortly.');
      await NotificationService.sendToUser(booking.user_id, {
        title: 'No Providers Found',
        body:  noProvText,
        type:  'dispatch',
        data:  { booking_id: booking.id },
      });
      return;
    }

    const providers = await DispatchService.findNearbyProviders(booking.service_id, booking.latitude, booking.longitude, maxKm, triedIds);
    if (!providers.length) {
      await query(`UPDATE bookings SET status = 'pending' WHERE id = $1`, [booking.id]);
      const noProvText = await SettingsService.get('no_providers_text', 'No providers available nearby.');
      await NotificationService.sendToUser(booking.user_id, { title: 'No Providers Found', body: noProvText, type: 'dispatch', data: { booking_id: booking.id } });
      return;
    }

    const provider  = providers[0];
    const expiresAt = new Date(Date.now() + ttl * 1000);

    await query(
      `INSERT INTO dispatch_queue (booking_id, provider_id, status, attempt_number, expires_at, distance_km)
       VALUES ($1,$2,'offered',$3,$4,$5)`,
      [booking.id, provider.id, attempt, expiresAt, provider.distance_km]
    );

    // Notify provider
    const payload = {
      title: `🔔 ${offerTitle} ${currencySymbol}${Number(booking.provider_payout).toLocaleString()}`,
      body:  `${booking.address} — ${ttl}s to accept`,
      type:  'dispatch_offer',
      data:  { booking_id: booking.id, ttl_seconds: String(ttl) },
    };
    await NotificationService.save('provider', provider.id, payload);
    if (provider.push_token) await NotificationService.sendPush(provider.push_token, payload);

    if (global.io) {
      global.io.to(`provider_${provider.id}`).emit('dispatch_offer', {
        booking_id:      booking.id,
        booking_ref:     booking.booking_ref,
        address:         booking.address,
        total_price:     booking.total_price,
        provider_payout: booking.provider_payout,
        distance_km:     provider.distance_km,
        scheduled_at:    booking.scheduled_at,
        expires_at:      expiresAt,
        ttl_seconds:     ttl,
      });
    }

    console.log(`📤 Offer → ${provider.full_name} (${provider.distance_km.toFixed(1)}km) Booking:${booking.booking_ref} TTL:${ttl}s [attempt ${attempt}]`);

    // Auto-expire if no response
    setTimeout(async () => {
      try {
        const dResult = await query(`SELECT * FROM dispatch_queue WHERE booking_id=$1 AND provider_id=$2 AND status='offered'`, [booking.id, provider.id]);
        if (dResult.rows[0]) {
          await query(`UPDATE dispatch_queue SET status='timeout', responded_at=NOW() WHERE booking_id=$1 AND provider_id=$2`, [booking.id, provider.id]);
          const bResult = await query(`SELECT status FROM bookings WHERE id=$1`, [booking.id]);
          if (bResult.rows[0]?.status === 'dispatching') {
            console.log(`⏱️  Timeout — ${provider.full_name}. Moving to next...`);
            await DispatchService.offerToNext(booking, [...triedIds, provider.id], attempt + 1, maxAttempts);
          }
        }
      } catch (err) { console.error('Timeout handler error:', err.message); }
    }, ttl * 1000);
  }

  static async acceptOffer(bookingId, providerId) {
    const client = await getClient();
    try {
      await client.query('BEGIN');

      const dResult = await client.query(
        `SELECT * FROM dispatch_queue WHERE booking_id=$1 AND provider_id=$2 AND status='offered' AND expires_at > NOW()`,
        [bookingId, providerId]
      );
      if (!dResult.rows[0]) throw new Error('Offer expired or already responded');

      const bResult = await client.query(`SELECT * FROM bookings WHERE id=$1 AND status='dispatching'`, [bookingId]);
      if (!bResult.rows[0]) throw new Error('Booking no longer available');
      const booking = bResult.rows[0];

      await client.query(`UPDATE dispatch_queue SET status='accepted', responded_at=NOW() WHERE booking_id=$1 AND provider_id=$2`, [bookingId, providerId]);
      await client.query(`UPDATE dispatch_queue SET status='skipped' WHERE booking_id=$1 AND provider_id!=$2 AND status='offered'`, [bookingId, providerId]);
      await client.query(`UPDATE bookings SET status='accepted', provider_id=$1 WHERE id=$2`, [providerId, bookingId]);
      await client.query(`UPDATE providers SET total_jobs=total_jobs+1 WHERE id=$1`, [providerId]);

      await client.query('COMMIT');

      const pResult  = await query('SELECT full_name, phone, avatar_url, rating FROM providers WHERE id=$1', [providerId]);
      const provider = pResult.rows[0];

      // Notify customer — get text from settings
      const acceptTitle = '🎉 Provider Found!';
      const acceptBody  = `${provider.full_name} has accepted your booking and is on the way!`;
      await NotificationService.sendToUser(booking.user_id, { title: acceptTitle, body: acceptBody, type: 'booking_accepted', data: { booking_id: bookingId } });

      if (global.io) {
        global.io.to(`user_${booking.user_id}`).emit('booking_accepted', {
          booking_id: bookingId,
          provider_name:   provider.full_name,
          provider_phone:  provider.phone,
          provider_avatar: provider.avatar_url,
          provider_rating: provider.rating,
        });
      }

      console.log(`✅ Booking ${booking.booking_ref} accepted by ${provider.full_name}`);
      return { ...booking, provider_name: provider.full_name };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally { client.release(); }
  }

  static async declineOffer(bookingId, providerId) {
    await query(`UPDATE dispatch_queue SET status='declined', responded_at=NOW() WHERE booking_id=$1 AND provider_id=$2 AND status='offered'`, [bookingId, providerId]);
    const bResult = await query(`SELECT * FROM bookings WHERE id=$1 AND status='dispatching'`, [bookingId]);
    if (bResult.rows[0]) {
      const tried     = await query(`SELECT provider_id FROM dispatch_queue WHERE booking_id=$1 AND status IN ('declined','timeout','skipped')`, [bookingId]);
      const triedIds  = tried.rows.map(r => r.provider_id);
      const aResult   = await query(`SELECT MAX(attempt_number) AS mx FROM dispatch_queue WHERE booking_id=$1`, [bookingId]);
      const maxAttempts = await SettingsService.getNumber('dispatch_max_attempts', 5);
      DispatchService.offerToNext(bResult.rows[0], triedIds, parseInt(aResult.rows[0].mx || 1) + 1, maxAttempts).catch(console.error);
    }
  }
}

module.exports = DispatchService;
