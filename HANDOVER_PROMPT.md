# CITY STAFF APP — AI HANDOVER PROMPT v2
## Copy and paste this entire prompt to continue the project

---

## PROJECT OVERVIEW
Building an **Uber-style home services app** (Nigeria-focused) called **City Staff**.

**Three apps + one backend:**
- Customer Flutter App (mobile — Android + iOS)
- Provider Flutter App (mobile — Android + iOS)  
- React Admin Dashboard (web)
- Node.js + PostgreSQL Backend API ✅ COMPLETED

---

## TECH STACK
| Layer | Technology |
|-------|-----------|
| Mobile | Flutter (Dart) — one codebase for Android + iOS |
| Admin Dashboard | React + Vite + TailwindCSS + shadcn/ui |
| Backend | Node.js + Express + PostgreSQL + Socket.IO |
| Payments | Flutterwave (NGN default, configurable) |
| Push Notifications | Firebase Cloud Messaging |
| Maps | Google Maps API |
| Backend Hosting | Railway (free tier) |
| Frontend Hosting | Hostinger Shared Hosting (static HTML upload via cPanel) |
| Admin Hosting | Hostinger (static build upload via cPanel) |

---

## BACKEND STATUS: ✅ FULLY BUILT — v2

### What's Done
- Complete REST API with all routes
- Uber-style dispatch system (configurable timer, default 30 seconds like Uber)
- Socket.IO real-time (live GPS tracking, chat, dispatch offers)
- Full CMS system — EVERYTHING editable from admin, zero hardcoding
- OTP phone login for customers and providers
- Flutterwave payments + wallet system
- Provider payout system
- Push notifications via Firebase
- All text, colors, business rules stored in `app_settings` DB table

### Backend File Structure (server.js at ROOT — fixes Railway)
```
citystaff-backend/
├── server.js              ← ROOT LEVEL (fixes Railway "module not found" error)
├── package.json           ← main: "server.js"
├── Procfile               ← web: node server.js
├── config/
│   ├── db.js
│   ├── db-setup.js        ← Run once: node config/db-setup.js
│   └── schema.sql
└── src/
    ├── middleware/auth.js
    ├── routes/
    │   ├── auth.js
    │   ├── bookings.js
    │   ├── services.js
    │   ├── cms.js         ← NEW: CMS routes
    │   ├── admin.js
    │   └── payments-providers.js
    ├── services/
    │   ├── dispatch.service.js    ← Timer from DB, not hardcoded
    │   ├── settings.service.js    ← NEW: All settings from DB
    │   └── notification.service.js
    └── socket/socket.handler.js
```

### Key Backend API Routes
```
AUTH:
POST /api/auth/user/send-otp
POST /api/auth/user/verify-otp
POST /api/auth/provider/send-otp
POST /api/auth/provider/verify-otp
POST /api/auth/admin/login
POST /api/auth/refresh
POST /api/auth/logout

CMS (public — no auth needed):
GET /api/cms/config              ← All public settings (app name, colors, texts)
GET /api/cms/sections/:page      ← Page sections (home, onboarding, about, etc.)
GET /api/cms/banners             ← Active banners
GET /api/cms/faqs                ← FAQs
GET /api/cms/navigation/:menu    ← Nav items

CMS (admin only):
GET/PUT /api/cms/admin/settings       ← All app settings
POST/PUT/DELETE /api/cms/admin/sections
POST/PUT/DELETE /api/cms/admin/banners
POST/PUT/DELETE /api/cms/admin/faqs
POST/PUT/DELETE /api/cms/admin/navigation

SERVICES:
GET /api/services/categories
GET /api/services
GET /api/services/:id
POST/PUT/DELETE /api/services         (admin)
POST/PUT/DELETE /api/services/categories (admin)

BOOKINGS:
POST /api/bookings                  ← Create booking (triggers auto-dispatch)
GET /api/bookings/my                ← Customer's bookings
GET /api/bookings/provider/my       ← Provider's jobs
GET /api/bookings/:id
PUT /api/bookings/:id/cancel
PUT /api/bookings/:id/accept        ← Provider accepts dispatch offer
PUT /api/bookings/:id/decline       ← Provider declines
PUT /api/bookings/:id/start
PUT /api/bookings/:id/complete
POST /api/bookings/:id/rate

PAYMENTS:
POST /api/payments/wallet/topup/init
POST /api/payments/verify
GET /api/payments/wallet
GET /api/payments/provider/wallet
POST /api/payments/provider/payout
POST /api/payments/webhook/flutterwave

PROVIDERS:
GET/PUT /api/providers/profile
PUT /api/providers/availability
PUT /api/providers/location         ← GPS update
PUT /api/providers/services
GET /api/providers/earnings

ADMIN:
GET /api/admin/dashboard
GET /api/admin/bookings
GET /api/admin/users
GET /api/admin/providers
GET /api/admin/payouts
POST /api/admin/promos
POST /api/admin/notifications/broadcast
POST/PUT /api/admin/plans           ← Subscription plans
```

### Socket.IO Events
```
Client → Server:
  join_booking(booking_id)
  location_update({lat, lng, heading, speed})
  send_message({booking_id, message})
  dispatch_response({booking_id, action: 'accept'|'decline'})
  typing({booking_id})

Server → Client:
  dispatch_offer({booking_id, ttl_seconds, provider_payout, ...})
  booking_accepted({provider_name, provider_phone, ...})
  provider_location({provider_id, latitude, longitude, ...})
  new_message({...})
  notification({title, body, type, data})
  provider_online/offline({provider_id})
```

---

## CMS SYSTEM — KEY DESIGN PRINCIPLE
**NOTHING is hardcoded in the frontend.** Every piece of text, color, business rule comes from the backend.

Flutter apps call `GET /api/cms/config` on startup to get ALL settings:
```json
{
  "app_name": "City Staff",
  "app_tagline": "Services at your doorstep",
  "app_primary_color": "#6C63FF",
  "currency_symbol": "₦",
  "dispatch_offer_ttl": "30",
  "booking_success_title": "Booking Confirmed!",
  "home_greeting_morning": "Good morning",
  ...
}
```

Admin can change app name, colors, all text, dispatch timer, commission % — **without touching any code**.

### app_settings groups (admin panel tabs):
- **branding** — app name, logo, colors, tagline, support contacts
- **business** — commission %, currency, wallet minimums, referral bonus, tax
- **dispatch** — timer (seconds), max attempts, max distance, dispatch mode
- **security** — OTP expiry, resend wait time
- **customer_app** — all text shown in customer app
- **provider_app** — all text shown in provider app
- **system** — maintenance mode, app version, force update

---

## DATABASE
PostgreSQL on Railway. Tables:
`users`, `providers`, `admins`, `service_categories`, `services`, `provider_services`, `bookings`, `dispatch_queue`, `payments`, `wallet_transactions`, `provider_payouts`, `subscription_plans`, `user_subscriptions`, `chat_messages`, `notifications`, `otp_codes`, `promo_codes`, `reviews`, `provider_locations`, `refresh_tokens`, `app_settings`, `frontend_sections`, `banners`, `faqs`, `navigation_items`

---

## BUSINESS RULES (all configurable from admin)
- Platform takes **15% commission** per booking (changeable)
- Dispatch timer: **30 seconds** default (Uber uses 15-30s) — changeable
- Max dispatch attempts: **5** — changeable  
- Max provider search radius: **50km** — changeable
- Dispatch modes: nearest | rating | hybrid — changeable
- Wallet minimum topup: **₦1,000** — changeable
- Provider minimum payout: **₦5,000** — changeable
- OTP expiry: **5 minutes** — changeable
- Tax: **0%** default — changeable

---

## DEPLOYMENT
- **Backend**: Railway (Node.js + PostgreSQL)
  - server.js is at ROOT (not src/) — this fixes Railway deployment
  - Run `node config/db-setup.js` once after deploy to create tables
  - Default admin: admin@citystaff.app / Admin@123 (change immediately)
- **Admin Dashboard**: Build with React → `npm run build` → upload `dist/` folder to Hostinger via cPanel File Manager
- **Flutter Apps**: Build → upload to Play Store + App Store

---

## CURRENT STATUS
1. ✅ Backend v2 fully built and ready to deploy
2. ✅ User is replacing old backend with v2 on Railway
3. 🔜 **NEXT: React Admin Dashboard** — use the CMS API to build a full admin panel
4. 🔜 Flutter Customer App
5. 🔜 Flutter Provider App

---

## REACT ADMIN DASHBOARD REQUIREMENTS (NEXT PHASE)
Build with: **React + Vite + TailwindCSS + shadcn/ui + Recharts + React Query**

Sidebar sections needed:
1. **Dashboard** — stats cards, revenue chart, recent bookings
2. **Bookings** — table with search/filter, status badges, view detail
3. **Customers** — list, search, suspend/activate
4. **Providers** — list, verify button, suspend/activate, view docs
5. **Services** — CRUD for categories AND services (add icon emoji, color, price, checklist, addons)
6. **Dispatch** — live map showing active jobs and provider locations
7. **Payments** — payout requests with approve/reject
8. **Promo Codes** — create/manage discount codes
9. **Subscriptions** — manage plans
10. **CMS** ← CRITICAL SECTION:
    - **App Settings** — grouped tabs: Branding, Business, Dispatch, Text, System. Edit any setting with appropriate input type (color picker for colors, number input for numbers, toggle for booleans, text for strings)
    - **Page Sections** — edit hero text, onboarding slides, about page content
    - **Banners** — upload/manage promotional banners with position, schedule
    - **FAQs** — create/edit/reorder FAQs by category
    - **Navigation** — manage menu items
11. **Notifications** — send broadcast to users/providers
12. **Analytics** — revenue chart, bookings by service, provider performance
13. **Settings** — admin user management

The admin user IS NOT a developer. Every button, form, toggle in the admin must be clear and self-explanatory.
