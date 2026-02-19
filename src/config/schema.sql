-- =============================================
-- CITY STAFF — COMPLETE DATABASE SCHEMA
-- Run this on Railway PostgreSQL
-- =============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For search

-- =============================================
-- USERS (Customers)
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) UNIQUE,
  phone         VARCHAR(30) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  avatar_url    TEXT,
  address       TEXT,
  latitude      DECIMAL(10, 8),
  longitude     DECIMAL(11, 8),
  city          VARCHAR(100),
  state         VARCHAR(100),
  country       VARCHAR(100) DEFAULT 'Nigeria',
  wallet_balance DECIMAL(12, 2) DEFAULT 0.00,
  is_verified   BOOLEAN DEFAULT FALSE,
  is_active     BOOLEAN DEFAULT TRUE,
  push_token    TEXT,
  referral_code VARCHAR(20) UNIQUE,
  referred_by   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDERS (Service Workers)
-- =============================================
CREATE TABLE IF NOT EXISTS providers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name         VARCHAR(200) NOT NULL,
  email             VARCHAR(200) UNIQUE,
  phone             VARCHAR(30) UNIQUE NOT NULL,
  password_hash     VARCHAR(255),
  avatar_url        TEXT,
  bio               TEXT,
  address           TEXT,
  latitude          DECIMAL(10, 8),
  longitude         DECIMAL(11, 8),
  city              VARCHAR(100),
  state             VARCHAR(100),
  country           VARCHAR(100) DEFAULT 'Nigeria',
  id_doc_url        TEXT,
  id_doc_type       VARCHAR(50),
  certificate_url   TEXT,
  is_verified       BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  is_available      BOOLEAN DEFAULT FALSE,
  is_online         BOOLEAN DEFAULT FALSE,
  last_seen         TIMESTAMPTZ,
  wallet_balance    DECIMAL(12, 2) DEFAULT 0.00,
  total_earnings    DECIMAL(12, 2) DEFAULT 0.00,
  rating            DECIMAL(3, 2) DEFAULT 0.00,
  rating_count      INT DEFAULT 0,
  total_jobs        INT DEFAULT 0,
  completed_jobs    INT DEFAULT 0,
  push_token        TEXT,
  bank_name         VARCHAR(100),
  bank_account_no   VARCHAR(30),
  bank_account_name VARCHAR(200),
  bank_code         VARCHAR(20),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ADMINS
-- =============================================
CREATE TABLE IF NOT EXISTS admins (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     VARCHAR(200) NOT NULL,
  email         VARCHAR(200) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(50) DEFAULT 'admin', -- admin | super_admin | support
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SERVICE CATEGORIES
-- =============================================
CREATE TABLE IF NOT EXISTS service_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url    TEXT,
  color       VARCHAR(20) DEFAULT '#6C63FF',
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SERVICES
-- =============================================
CREATE TABLE IF NOT EXISTS services (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id     UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  name            VARCHAR(200) NOT NULL,
  slug            VARCHAR(200) UNIQUE NOT NULL,
  description     TEXT,
  short_desc      TEXT,
  image_url       TEXT,
  base_price      DECIMAL(12, 2) NOT NULL DEFAULT 0,
  price_type      VARCHAR(30) DEFAULT 'fixed', -- fixed | hourly | quote
  duration_mins   INT DEFAULT 60,
  is_active       BOOLEAN DEFAULT TRUE,
  is_featured     BOOLEAN DEFAULT FALSE,
  checklist       JSONB DEFAULT '[]',
  addons          JSONB DEFAULT '[]',
  requirements    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDER SERVICES (which services a provider offers)
-- =============================================
CREATE TABLE IF NOT EXISTS provider_services (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  service_id  UUID REFERENCES services(id) ON DELETE CASCADE,
  custom_price DECIMAL(12, 2),
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_id, service_id)
);

-- =============================================
-- BOOKINGS
-- =============================================
CREATE TABLE IF NOT EXISTS bookings (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_ref     VARCHAR(20) UNIQUE NOT NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id     UUID REFERENCES providers(id) ON DELETE SET NULL,
  service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
  status          VARCHAR(30) DEFAULT 'pending',
  -- Status flow: pending → dispatching → accepted → in_progress → completed | cancelled | no_show
  address         TEXT NOT NULL,
  latitude        DECIMAL(10, 8),
  longitude       DECIMAL(11, 8),
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  cancelled_by    VARCHAR(20), -- user | provider | admin
  duration_mins   INT,
  base_price      DECIMAL(12, 2) NOT NULL,
  addons_price    DECIMAL(12, 2) DEFAULT 0,
  discount        DECIMAL(12, 2) DEFAULT 0,
  total_price     DECIMAL(12, 2) NOT NULL,
  platform_fee    DECIMAL(12, 2) DEFAULT 0,
  provider_payout DECIMAL(12, 2) DEFAULT 0,
  payment_status  VARCHAR(30) DEFAULT 'unpaid', -- unpaid | paid | refunded
  payment_method  VARCHAR(30), -- wallet | card | transfer
  selected_addons JSONB DEFAULT '[]',
  notes           TEXT,
  promo_code      VARCHAR(50),
  rating          INT CHECK (rating >= 1 AND rating <= 5),
  review          TEXT,
  rated_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- DISPATCH QUEUE (Uber-style job distribution)
-- =============================================
CREATE TABLE IF NOT EXISTS dispatch_queue (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id     UUID REFERENCES providers(id) ON DELETE CASCADE,
  status          VARCHAR(20) DEFAULT 'pending', -- pending | offered | accepted | declined | timeout | skipped
  attempt_number  INT DEFAULT 1,
  offered_at      TIMESTAMPTZ DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  distance_km     DECIMAL(8, 2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PAYMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id      UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id     UUID REFERENCES providers(id) ON DELETE SET NULL,
  type            VARCHAR(30) NOT NULL, -- booking | wallet_topup | payout | refund | subscription
  amount          DECIMAL(12, 2) NOT NULL,
  currency        VARCHAR(10) DEFAULT 'NGN',
  status          VARCHAR(20) DEFAULT 'pending', -- pending | success | failed | refunded
  gateway         VARCHAR(30) DEFAULT 'flutterwave', -- flutterwave | wallet | manual
  gateway_ref     VARCHAR(200),
  gateway_txn_id  VARCHAR(200),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- WALLET TRANSACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type   VARCHAR(20) NOT NULL, -- user | provider
  owner_id     UUID NOT NULL,
  type         VARCHAR(30) NOT NULL, -- credit | debit
  reason       VARCHAR(100) NOT NULL, -- topup | booking_payment | refund | payout | bonus | referral
  amount       DECIMAL(12, 2) NOT NULL,
  balance_before DECIMAL(12, 2) NOT NULL,
  balance_after  DECIMAL(12, 2) NOT NULL,
  reference    VARCHAR(200),
  booking_id   UUID REFERENCES bookings(id) ON DELETE SET NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDER PAYOUTS
-- =============================================
CREATE TABLE IF NOT EXISTS provider_payouts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id     UUID REFERENCES providers(id) ON DELETE CASCADE,
  amount          DECIMAL(12, 2) NOT NULL,
  status          VARCHAR(20) DEFAULT 'pending', -- pending | processing | completed | failed
  bank_name       VARCHAR(100),
  bank_account_no VARCHAR(30),
  bank_account_name VARCHAR(200),
  bank_code       VARCHAR(20),
  gateway_ref     VARCHAR(200),
  gateway_response JSONB,
  admin_note      TEXT,
  requested_at    TIMESTAMPTZ DEFAULT NOW(),
  processed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUBSCRIPTIONS / PLANS
-- =============================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  description   TEXT,
  price         DECIMAL(12, 2) NOT NULL,
  duration_days INT NOT NULL,
  features      JSONB DEFAULT '[]',
  discount_percent DECIMAL(5, 2) DEFAULT 0,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id     UUID REFERENCES subscription_plans(id) ON DELETE SET NULL,
  status      VARCHAR(20) DEFAULT 'active', -- active | expired | cancelled
  starts_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at  TIMESTAMPTZ,
  payment_id  UUID REFERENCES payments(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHAT MESSAGES
-- =============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL, -- user | provider | admin
  sender_id   UUID NOT NULL,
  message     TEXT,
  media_url   TEXT,
  media_type  VARCHAR(20), -- image | audio | file
  is_read     BOOLEAN DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_type VARCHAR(20) NOT NULL, -- user | provider | admin
  recipient_id  UUID NOT NULL,
  title         VARCHAR(200) NOT NULL,
  body          TEXT NOT NULL,
  type          VARCHAR(50), -- booking | payment | dispatch | chat | system | promo
  data          JSONB DEFAULT '{}',
  is_read       BOOLEAN DEFAULT FALSE,
  read_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- OTP CODES
-- =============================================
CREATE TABLE IF NOT EXISTS otp_codes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone       VARCHAR(30) NOT NULL,
  code        VARCHAR(10) NOT NULL,
  purpose     VARCHAR(30) DEFAULT 'login', -- login | register | reset
  is_used     BOOLEAN DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROMO CODES
-- =============================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code            VARCHAR(50) UNIQUE NOT NULL,
  type            VARCHAR(20) DEFAULT 'percent', -- percent | fixed
  value           DECIMAL(10, 2) NOT NULL,
  min_order       DECIMAL(12, 2) DEFAULT 0,
  max_uses        INT DEFAULT NULL,
  used_count      INT DEFAULT 0,
  per_user_limit  INT DEFAULT 1,
  is_active       BOOLEAN DEFAULT TRUE,
  starts_at       TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promo_uses (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  promo_id   UUID REFERENCES promo_codes(id),
  user_id    UUID REFERENCES users(id),
  booking_id UUID REFERENCES bookings(id),
  used_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDER LOCATION TRACKING
-- =============================================
CREATE TABLE IF NOT EXISTS provider_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
  latitude    DECIMAL(10, 8) NOT NULL,
  longitude   DECIMAL(11, 8) NOT NULL,
  heading     DECIMAL(6, 2),
  speed       DECIMAL(8, 2),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- REVIEWS
-- =============================================
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE,
  rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  reply       TEXT,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- APP SETTINGS
-- =============================================
CREATE TABLE IF NOT EXISTS app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- REFRESH TOKENS
-- =============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type  VARCHAR(20) NOT NULL, -- user | provider | admin
  owner_id    UUID NOT NULL,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES (performance)
-- =============================================
CREATE INDEX IF NOT EXISTS idx_bookings_user_id     ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider_id ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status       ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_booking_id   ON dispatch_queue(booking_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_provider_id  ON dispatch_queue(provider_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_status       ON dispatch_queue(status);
CREATE INDEX IF NOT EXISTS idx_payments_booking_id   ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_wallet_owner          ON wallet_transactions(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_chat_booking_id       ON chat_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_owner   ON notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_provider_locations    ON provider_locations(provider_id);
CREATE INDEX IF NOT EXISTS idx_otp_phone             ON otp_codes(phone);

-- =============================================
-- DEFAULT DATA
-- =============================================

-- Default super admin (change password after first login!)
INSERT INTO admins (full_name, email, password_hash, role)
VALUES (
  'Super Admin',
  'admin@yourdomain.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/VkT9iKS', -- password: Admin@123
  'super_admin'
) ON CONFLICT (email) DO NOTHING;

-- Default service categories
INSERT INTO service_categories (name, slug, description, color, sort_order) VALUES
  ('Cleaning',      'cleaning',       'Home and office cleaning services',    '#6C63FF', 1),
  ('Plumbing',      'plumbing',       'Plumbing repairs and installations',   '#0EA5E9', 2),
  ('Electrical',    'electrical',     'Electrical repairs and wiring',        '#F59E0B', 3),
  ('Carpentry',     'carpentry',      'Furniture and carpentry work',         '#10B981', 4),
  ('Painting',      'painting',       'Interior and exterior painting',       '#EF4444', 5),
  ('Moving',        'moving',         'Home and office relocation',           '#8B5CF6', 6),
  ('Laundry',       'laundry',        'Washing, ironing, and dry cleaning',   '#14B8A6', 7),
  ('AC Repair',     'ac-repair',      'Air conditioning service and repair',  '#3B82F6', 8),
  ('Generator',     'generator',      'Generator servicing and repair',       '#F97316', 9),
  ('Fumigation',    'fumigation',     'Pest control and fumigation',          '#84CC16', 10)
ON CONFLICT (slug) DO NOTHING;

-- Default app settings
INSERT INTO app_settings (key, value) VALUES
  ('platform_name',           'City Staff'),
  ('platform_commission',     '15'),
  ('dispatch_ttl_seconds',    '120'),
  ('dispatch_max_attempts',   '5'),
  ('dispatch_max_distance_km','50'),
  ('otp_expiry_seconds',      '300'),
  ('wallet_minimum_topup',    '1000'),
  ('default_currency',        'NGN'),
  ('default_currency_symbol', '₦'),
  ('maintenance_mode',        'false'),
  ('referral_bonus',          '500')
ON CONFLICT (key) DO NOTHING;
