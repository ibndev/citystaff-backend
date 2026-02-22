const jwt = require('jsonwebtoken');
const { query } = require('../config/db');
const DispatchService = require('../services/dispatch.service');

module.exports = (io) => {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Auth required'));
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId   = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch { next(new Error('Invalid token')); }
  });

  io.on('connection', async (socket) => {
    const { userId, userRole } = socket;
    if (userRole === 'user')     socket.join(`user_${userId}`);
    if (userRole === 'provider') { socket.join(`provider_${userId}`); await query('UPDATE providers SET is_online=true,last_seen=NOW() WHERE id=$1',[userId]).catch(()=>{}); }
    if (['admin','super_admin'].includes(userRole)) socket.join('admin_room');

    socket.on('join_booking',  (id) => socket.join(`booking_${id}`));
    socket.on('leave_booking', (id) => socket.leave(`booking_${id}`));

    socket.on('location_update', async ({ latitude, longitude, heading, speed }) => {
      if (userRole !== 'provider') return;
      await query(`INSERT INTO provider_locations (provider_id,latitude,longitude,heading,speed,updated_at) VALUES ($1,$2,$3,$4,$5,NOW()) ON CONFLICT (provider_id) DO UPDATE SET latitude=$2,longitude=$3,heading=$4,speed=$5,updated_at=NOW()`,[userId,latitude,longitude,heading,speed]).catch(()=>{});
      await query('UPDATE providers SET latitude=$1,longitude=$2,last_seen=NOW() WHERE id=$3',[latitude,longitude,userId]).catch(()=>{});
      const active = await query(`SELECT user_id FROM bookings WHERE provider_id=$1 AND status IN ('accepted','in_progress')`,[userId]).catch(()=>({rows:[]}));
      active.rows.forEach(r => io.to(`user_${r.user_id}`).emit('provider_location',{provider_id:userId,latitude,longitude,heading,speed}));
    });

    socket.on('send_message', async ({ booking_id, message, media_url, media_type }) => {
      try {
        const senderType = userRole==='user'?'user':userRole==='provider'?'provider':'admin';
        const r = await query(`INSERT INTO chat_messages (booking_id,sender_type,sender_id,message,media_url,media_type) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,[booking_id,senderType,userId,message,media_url,media_type]);
        io.to(`booking_${booking_id}`).emit('new_message', r.rows[0]);
      } catch { socket.emit('error',{message:'Failed to send message'}); }
    });

    socket.on('dispatch_response', async ({ booking_id, action }) => {
      if (userRole !== 'provider') return;
      try {
        if (action==='accept') { const b = await DispatchService.acceptOffer(booking_id, userId); socket.emit('dispatch_accepted',{booking:b}); }
        else { await DispatchService.declineOffer(booking_id, userId); socket.emit('dispatch_declined',{booking_id}); }
      } catch(err) { socket.emit('dispatch_error',{message:err.message}); }
    });

    socket.on('typing', ({booking_id}) => socket.to(`booking_${booking_id}`).emit('user_typing',{sender_id:userId,sender_type:userRole}));

    socket.on('disconnect', async () => {
      if (userRole==='provider') await query('UPDATE providers SET is_online=false,last_seen=NOW() WHERE id=$1',[userId]).catch(()=>{});
    });
  });
};
