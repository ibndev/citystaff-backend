# 🚀 CITY STAFF BACKEND — DEPLOYMENT GUIDE
## From Zero to Live in ~30 Minutes

---

## WHAT YOU'VE RECEIVED

```
citystaff-backend/
├── src/
│   ├── server.js              ← Main entry point
│   ├── config/
│   │   ├── db.js              ← Database connection
│   │   ├── db-setup.js        ← Run once to create tables
│   │   └── schema.sql         ← All 20 database tables
│   ├── middleware/
│   │   └── auth.js            ← JWT authentication
│   ├── routes/
│   │   ├── auth.js            ← OTP login (user + provider + admin)
│   │   ├── services.js        ← Service catalog
│   │   ├── bookings.js        ← Booking lifecycle
│   │   ├── payments.js        ← Flutterwave + wallet
│   │   ├── providers.js       ← Provider management
│   │   ├── chat.js            ← In-app messaging
│   │   └── admin.js           ← Admin dashboard APIs
│   ├── services/
│   │   ├── dispatch.service.js    ← Uber-style job distribution
│   │   └── notification.service.js ← Push notifications
│   └── socket/
│       └── socket.handler.js  ← Real-time (tracking, chat, dispatch)
├── package.json
├── .env.example               ← Copy to .env with your keys
├── Procfile                   ← For Railway deployment
└── .gitignore
```

---

## STEP 1: Create GitHub Repository

1. Go to **github.com** → Sign in or create account
2. Click **"New repository"**
3. Name it: `citystaff-backend`
4. Set to **Private**
5. Click **"Create repository"**
6. On your computer, open a terminal and run:

```bash
cd citystaff-backend
git init
git add .
git commit -m "Initial backend setup"
git remote add origin https://github.com/YOURUSERNAME/citystaff-backend.git
git push -u origin main
```

---

## STEP 2: Deploy to Railway

1. Go to **railway.app** → Sign in with GitHub
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose **citystaff-backend**
5. Railway will auto-detect Node.js and deploy

### Add PostgreSQL Database:
1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway creates the database automatically
4. Click on the PostgreSQL service
5. Go to **"Variables"** tab
6. Copy the **DATABASE_URL** value

---

## STEP 3: Set Environment Variables in Railway

In your Railway project → Backend service → **Variables** tab, add ALL of these:

```
NODE_ENV=production
PORT=5000
DATABASE_URL=[paste from PostgreSQL service]
JWT_SECRET=[generate: open browser console, type: crypto.randomUUID() + crypto.randomUUID()]
JWT_REFRESH_SECRET=[generate another random string]
FLUTTERWAVE_PUBLIC_KEY_TEST=FLWPUBK_TEST-your-key
FLUTTERWAVE_SECRET_KEY_TEST=FLWSECK_TEST-your-key
FLUTTERWAVE_PUBLIC_KEY_LIVE=FLWPUBK-your-key
FLUTTERWAVE_SECRET_KEY_LIVE=FLWSECK-your-key
FLUTTERWAVE_MODE=test
FLUTTERWAVE_WEBHOOK_SECRET=your-webhook-secret
GOOGLE_MAPS_API_KEY=AIza-your-key
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com
PLATFORM_COMMISSION_PERCENT=15
DISPATCH_OFFER_TTL_SECONDS=120
DISPATCH_MAX_ATTEMPTS=5
DISPATCH_MAX_DISTANCE_KM=50
OTP_EXPIRY_SECONDS=300
WALLET_MINIMUM_TOPUP=1000
FRONTEND_URL=https://admin.yourdomain.com
```

---

## STEP 4: Set Up Database Tables

After Railway deployment is live:

1. Go to Railway → your project → Backend service
2. Click **"Settings"** → **"Shell"** (or use Railway CLI)
3. Run this command:

```bash
node src/config/db-setup.js
```

You'll see:
```
✅ All tables created successfully!
✅ Super admin created!
🔐 Default admin login:
   Email:    admin@yourdomain.com
   Password: Admin@123
```

**⚠️ IMMEDIATELY change the admin password after first login!**

---

## STEP 5: Get Your API URL

1. In Railway → Backend service → **Settings** tab
2. Under **"Domains"**, click **"Generate Domain"**
3. You'll get something like: `citystaff-backend-production.up.railway.app`

This is your API URL. Example:
- `https://citystaff-backend-production.up.railway.app/health` → Should return `{"status":"ok"}`

---

## STEP 6: Point Your Hostinger Domain (Optional)

If you want `api.yourdomain.com` instead of the Railway URL:

1. In Railway → Backend service → Settings → **Custom Domain**
2. Add `api.yourdomain.com`
3. Railway gives you a **CNAME record**
4. Go to **Hostinger hPanel** → **DNS Zone Editor**
5. Add CNAME record:
   - Name: `api`
   - Points to: (the Railway CNAME value)
6. Wait 5-30 minutes for DNS propagation

---

## STEP 7: Test Your API

Open your browser or use a tool like **Postman**:

```
GET https://your-api-url.up.railway.app/health
→ {"status":"ok","version":"1.0.0"}

GET https://your-api-url.up.railway.app/api/services
→ {"success":true,"services":[...]}

POST https://your-api-url.up.railway.app/api/auth/user/send-otp
Body: {"phone": "+2348012345678"}
→ {"success":true,"message":"OTP sent","otp":"123456"}
```

---

## COMPLETE API REFERENCE

### Auth
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/user/send-otp | Send OTP to customer |
| POST | /api/auth/user/verify-otp | Verify OTP → get token |
| POST | /api/auth/provider/send-otp | Send OTP to provider |
| POST | /api/auth/provider/verify-otp | Verify OTP → get token |
| POST | /api/auth/admin/login | Admin email+password login |
| POST | /api/auth/refresh | Refresh access token |
| POST | /api/auth/logout | Logout |

### Services
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/services | List all services |
| GET | /api/services/categories | List categories |
| GET | /api/services/:id | Single service |
| POST | /api/services | Create service (admin) |
| PUT | /api/services/:id | Update service (admin) |

### Bookings
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/bookings | Create booking |
| GET | /api/bookings/my | Customer's bookings |
| GET | /api/bookings/provider/my | Provider's jobs |
| GET | /api/bookings/admin/all | All bookings (admin) |
| GET | /api/bookings/:id | Single booking |
| PUT | /api/bookings/:id/cancel | Cancel |
| PUT | /api/bookings/:id/accept | Provider accepts |
| PUT | /api/bookings/:id/decline | Provider declines |
| PUT | /api/bookings/:id/start | Provider starts job |
| PUT | /api/bookings/:id/complete | Provider completes |
| POST | /api/bookings/:id/rate | Customer rates |

### Payments
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/payments/wallet/topup/init | Initialize wallet topup |
| POST | /api/payments/verify | Verify Flutterwave payment |
| GET | /api/payments/wallet | Wallet balance + history |
| GET | /api/payments/provider/wallet | Provider wallet |
| POST | /api/payments/provider/payout | Request payout |

### Providers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/providers/profile | Provider profile |
| PUT | /api/providers/profile | Update profile |
| PUT | /api/providers/availability | Toggle availability |
| PUT | /api/providers/location | Update GPS |
| PUT | /api/providers/services | Set offered services |
| GET | /api/providers/earnings | Earnings summary |

### Socket.IO Events
| Event | Direction | Description |
|-------|-----------|-------------|
| join_booking | Client → Server | Join booking room |
| location_update | Provider → Server | Send GPS coords |
| provider_location | Server → Customer | Live tracking |
| dispatch_offer | Server → Provider | New job offer |
| booking_accepted | Server → Customer | Provider accepted |
| new_message | Both | Chat message |
| notification | Server → Any | Push notification |

---

## NEXT STEPS AFTER BACKEND IS LIVE

1. ✅ **Test all API endpoints** with Postman
2. ✅ **Change default admin password**
3. ✅ **Set up Firebase** for push notifications
4. 🔜 **Build React Admin Dashboard** (next phase)
5. 🔜 **Build Flutter Customer App** (next phase)
6. 🔜 **Build Flutter Provider App** (next phase)

---

## SUPPORT

If you get any error:
1. Check Railway logs: Railway project → Backend service → **Logs** tab
2. Most common issues:
   - `DATABASE_URL not set` → Add it in Railway Variables
   - `Cannot find module` → Run `npm install` in Railway shell
   - `Port already in use` → Railway sets PORT automatically, don't hardcode it
