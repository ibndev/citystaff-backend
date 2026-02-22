-- =============================================
-- CITY STAFF v2 — COMPLETE DATABASE SCHEMA
-- CMS-driven: everything editable from admin
-- =============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- APP SETTINGS (drives ENTIRE frontend — no hardcoding)
-- =============================================
CREATE TABLE IF NOT EXISTS app_settings (
  key         VARCHAR(100) PRIMARY KEY,
  value       TEXT,
  label       VARCHAR(200),       -- Human readable name shown in admin
  description TEXT,               -- Help text shown in admin
  type        VARCHAR(30) DEFAULT 'text', -- text | number | boolean | color | image | json | select
  options     TEXT,               -- JSON array of options for 'select' type
  group_name  VARCHAR(100) DEFAULT 'general', -- Groups settings in admin panel
  is_public   BOOLEAN DEFAULT FALSE, -- If true, returned to frontend without auth
  sort_order  INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FRONTEND SECTIONS (CMS pages/sections)
-- =============================================
CREATE TABLE IF NOT EXISTS frontend_sections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  page        VARCHAR(100) NOT NULL, -- home | onboarding | about | how_it_works | etc.
  section_key VARCHAR(100) NOT NULL, -- hero | banner | features | testimonials | etc.
  title       TEXT,
  subtitle    TEXT,
  body        TEXT,
  image_url   TEXT,
  button_text VARCHAR(100),
  button_url  VARCHAR(255),
  bg_color    VARCHAR(20),
  text_color  VARCHAR(20),
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INT DEFAULT 0,
  meta        JSONB DEFAULT '{}',  -- Extra flexible fields
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(page, section_key)
);

-- =============================================
-- FRONTEND MENU / NAVIGATION
-- =============================================
CREATE TABLE IF NOT EXISTS navigation_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  menu        VARCHAR(50) NOT NULL, -- header | footer | sidebar | mobile_bottom
  label       VARCHAR(100) NOT NULL,
  url         VARCHAR(255),
  icon        VARCHAR(100),
  parent_id   UUID REFERENCES navigation_items(id),
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  open_new_tab BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- BANNERS / PROMOTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS banners (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       VARCHAR(200),
  subtitle    TEXT,
  image_url   TEXT NOT NULL,
  link_url    VARCHAR(255),
  position    VARCHAR(50) DEFAULT 'home_top', -- home_top | home_middle | category | checkout
  is_active   BOOLEAN DEFAULT TRUE,
  starts_at   TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- FAQ
-- =============================================
CREATE TABLE IF NOT EXISTS faqs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  question    TEXT NOT NULL,
  answer      TEXT NOT NULL,
  category    VARCHAR(100) DEFAULT 'general', -- general | customer | provider | payment
  sort_order  INT DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- USERS
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name      VARCHAR(200) NOT NULL,
  email          VARCHAR(200) UNIQUE,
  phone          VARCHAR(30) UNIQUE NOT NULL,
  avatar_url     TEXT,
  address        TEXT,
  latitude       DECIMAL(10,8),
  longitude      DECIMAL(11,8),
  city           VARCHAR(100),
  state          VARCHAR(100),
  country        VARCHAR(100) DEFAULT 'Nigeria',
  wallet_balance DECIMAL(12,2) DEFAULT 0.00,
  is_verified    BOOLEAN DEFAULT FALSE,
  is_active      BOOLEAN DEFAULT TRUE,
  push_token     TEXT,
  referral_code  VARCHAR(20) UNIQUE,
  referred_by    UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDERS
-- =============================================
CREATE TABLE IF NOT EXISTS providers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name         VARCHAR(200) NOT NULL,
  email             VARCHAR(200) UNIQUE,
  phone             VARCHAR(30) UNIQUE NOT NULL,
  avatar_url        TEXT,
  bio               TEXT,
  address           TEXT,
  latitude          DECIMAL(10,8),
  longitude         DECIMAL(11,8),
  city              VARCHAR(100),
  state             VARCHAR(100),
  country           VARCHAR(100) DEFAULT 'Nigeria',
  id_doc_url        TEXT,
  id_doc_type       VARCHAR(50),
  is_verified       BOOLEAN DEFAULT FALSE,
  is_active         BOOLEAN DEFAULT TRUE,
  is_available      BOOLEAN DEFAULT FALSE,
  is_online         BOOLEAN DEFAULT FALSE,
  last_seen         TIMESTAMPTZ,
  wallet_balance    DECIMAL(12,2) DEFAULT 0.00,
  total_earnings    DECIMAL(12,2) DEFAULT 0.00,
  rating            DECIMAL(3,2) DEFAULT 0.00,
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
  role          VARCHAR(50) DEFAULT 'admin',
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SERVICE CATEGORIES (fully CMS managed)
-- =============================================
CREATE TABLE IF NOT EXISTS service_categories (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL,
  slug        VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  icon_url    TEXT,
  icon_emoji  VARCHAR(10),          -- Fallback emoji icon
  color       VARCHAR(20) DEFAULT '#6C63FF',
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INT DEFAULT 0,
  meta        JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SERVICES (fully CMS managed)
-- =============================================
CREATE TABLE IF NOT EXISTS services (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id   UUID REFERENCES service_categories(id) ON DELETE SET NULL,
  name          VARCHAR(200) NOT NULL,
  slug          VARCHAR(200) UNIQUE NOT NULL,
  description   TEXT,
  short_desc    TEXT,
  image_url     TEXT,
  base_price    DECIMAL(12,2) NOT NULL DEFAULT 0,
  price_type    VARCHAR(30) DEFAULT 'fixed',
  duration_mins INT DEFAULT 60,
  is_active     BOOLEAN DEFAULT TRUE,
  is_featured   BOOLEAN DEFAULT FALSE,
  checklist     JSONB DEFAULT '[]',   -- Array of {item, required}
  addons        JSONB DEFAULT '[]',   -- Array of {name, price, description}
  requirements  TEXT,
  tags          JSONB DEFAULT '[]',
  meta          JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDER SERVICES
-- =============================================
CREATE TABLE IF NOT EXISTS provider_services (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id  UUID REFERENCES providers(id) ON DELETE CASCADE,
  service_id   UUID REFERENCES services(id) ON DELETE CASCADE,
  custom_price DECIMAL(12,2),
  is_active    BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
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
  address         TEXT NOT NULL,
  latitude        DECIMAL(10,8),
  longitude       DECIMAL(11,8),
  scheduled_at    TIMESTAMPTZ,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  cancelled_by    VARCHAR(20),
  duration_mins   INT,
  base_price      DECIMAL(12,2) NOT NULL,
  addons_price    DECIMAL(12,2) DEFAULT 0,
  discount        DECIMAL(12,2) DEFAULT 0,
  total_price     DECIMAL(12,2) NOT NULL,
  platform_fee    DECIMAL(12,2) DEFAULT 0,
  provider_payout DECIMAL(12,2) DEFAULT 0,
  payment_status  VARCHAR(30) DEFAULT 'unpaid',
  payment_method  VARCHAR(30),
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
-- DISPATCH QUEUE
-- =============================================
CREATE TABLE IF NOT EXISTS dispatch_queue (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     UUID REFERENCES bookings(id) ON DELETE CASCADE,
  provider_id    UUID REFERENCES providers(id) ON DELETE CASCADE,
  status         VARCHAR(20) DEFAULT 'pending',
  attempt_number INT DEFAULT 1,
  offered_at     TIMESTAMPTZ DEFAULT NOW(),
  responded_at   TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  distance_km    DECIMAL(8,2),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PAYMENTS
-- =============================================
CREATE TABLE IF NOT EXISTS payments (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id     UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  provider_id    UUID REFERENCES providers(id) ON DELETE SET NULL,
  type           VARCHAR(30) NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  currency       VARCHAR(10) DEFAULT 'NGN',
  status         VARCHAR(20) DEFAULT 'pending',
  gateway        VARCHAR(30) DEFAULT 'flutterwave',
  gateway_ref    VARCHAR(200),
  gateway_txn_id VARCHAR(200),
  metadata       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- WALLET TRANSACTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type     VARCHAR(20) NOT NULL,
  owner_id       UUID NOT NULL,
  type           VARCHAR(30) NOT NULL,
  reason         VARCHAR(100) NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  balance_before DECIMAL(12,2) NOT NULL,
  balance_after  DECIMAL(12,2) NOT NULL,
  reference      VARCHAR(200),
  booking_id     UUID REFERENCES bookings(id) ON DELETE SET NULL,
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDER PAYOUTS
-- =============================================
CREATE TABLE IF NOT EXISTS provider_payouts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id       UUID REFERENCES providers(id) ON DELETE CASCADE,
  amount            DECIMAL(12,2) NOT NULL,
  status            VARCHAR(20) DEFAULT 'pending',
  bank_name         VARCHAR(100),
  bank_account_no   VARCHAR(30),
  bank_account_name VARCHAR(200),
  bank_code         VARCHAR(20),
  gateway_ref       VARCHAR(200),
  gateway_response  JSONB,
  admin_note        TEXT,
  requested_at      TIMESTAMPTZ DEFAULT NOW(),
  processed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- SUBSCRIPTIONS
-- =============================================
CREATE TABLE IF NOT EXISTS subscription_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             VARCHAR(100) NOT NULL,
  description      TEXT,
  price            DECIMAL(12,2) NOT NULL,
  duration_days    INT NOT NULL,
  features         JSONB DEFAULT '[]',
  discount_percent DECIMAL(5,2) DEFAULT 0,
  color            VARCHAR(20) DEFAULT '#6C63FF',
  is_active        BOOLEAN DEFAULT TRUE,
  is_featured      BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  plan_id    UUID REFERENCES subscription_plans(id),
  status     VARCHAR(20) DEFAULT 'active',
  starts_at  TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  payment_id UUID REFERENCES payments(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CHAT
-- =============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE,
  sender_type VARCHAR(20) NOT NULL,
  sender_id   UUID NOT NULL,
  message     TEXT,
  media_url   TEXT,
  media_type  VARCHAR(20),
  is_read     BOOLEAN DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- NOTIFICATIONS
-- =============================================
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_type VARCHAR(20) NOT NULL,
  recipient_id   UUID NOT NULL,
  title          VARCHAR(200) NOT NULL,
  body           TEXT NOT NULL,
  type           VARCHAR(50),
  data           JSONB DEFAULT '{}',
  is_read        BOOLEAN DEFAULT FALSE,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- OTP
-- =============================================
CREATE TABLE IF NOT EXISTS otp_codes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone      VARCHAR(30) NOT NULL,
  code       VARCHAR(10) NOT NULL,
  purpose    VARCHAR(30) DEFAULT 'login',
  is_used    BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROMO CODES
-- =============================================
CREATE TABLE IF NOT EXISTS promo_codes (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code           VARCHAR(50) UNIQUE NOT NULL,
  type           VARCHAR(20) DEFAULT 'percent',
  value          DECIMAL(10,2) NOT NULL,
  min_order      DECIMAL(12,2) DEFAULT 0,
  max_uses       INT,
  used_count     INT DEFAULT 0,
  per_user_limit INT DEFAULT 1,
  is_active      BOOLEAN DEFAULT TRUE,
  starts_at      TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- REVIEWS
-- =============================================
CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  booking_id  UUID REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
  user_id     UUID REFERENCES users(id),
  provider_id UUID REFERENCES providers(id),
  rating      INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment     TEXT,
  reply       TEXT,
  replied_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PROVIDER LOCATION TRACKING
-- =============================================
CREATE TABLE IF NOT EXISTS provider_locations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES providers(id) ON DELETE CASCADE UNIQUE,
  latitude    DECIMAL(10,8) NOT NULL,
  longitude   DECIMAL(11,8) NOT NULL,
  heading     DECIMAL(6,2),
  speed       DECIMAL(8,2),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- REFRESH TOKENS
-- =============================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  owner_type VARCHAR(20) NOT NULL,
  owner_id   UUID NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- INDEXES
-- =============================================
CREATE INDEX IF NOT EXISTS idx_bookings_user       ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_provider   ON bookings(provider_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status     ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_dispatch_booking    ON dispatch_queue(booking_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_provider   ON dispatch_queue(provider_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_status     ON dispatch_queue(status);
CREATE INDEX IF NOT EXISTS idx_chat_booking        ON chat_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(recipient_type, recipient_id);
CREATE INDEX IF NOT EXISTS idx_wallet_owner        ON wallet_transactions(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_otp_phone           ON otp_codes(phone);

-- =============================================
-- DEFAULT ADMIN
-- =============================================
INSERT INTO admins (full_name, email, password_hash, role)
VALUES ('Super Admin', 'admin@citystaff.app', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/VkT9iKS', 'super_admin')
ON CONFLICT (email) DO NOTHING;

-- =============================================
-- APP SETTINGS — ALL FRONTEND VALUES LIVE HERE
-- No hardcoded values anywhere in the codebase
-- =============================================
INSERT INTO app_settings (key, value, label, description, type, group_name, is_public, sort_order) VALUES

-- Branding
('app_name',              'City Staff',         'App Name',             'Name shown throughout the app',                       'text',    'branding',  true,  1),
('app_tagline',           'Services at your doorstep', 'App Tagline',  'Short tagline shown on home screen',                  'text',    'branding',  true,  2),
('app_logo_url',          '',                   'App Logo URL',         'URL to your app logo image',                          'image',   'branding',  true,  3),
('app_primary_color',     '#6C63FF',            'Primary Color',        'Main brand color used throughout the app',            'color',   'branding',  true,  4),
('app_secondary_color',   '#FF6584',            'Secondary Color',      'Accent color',                                        'color',   'branding',  true,  5),
('app_dark_bg',           '#0D0D0D',            'Dark Background',      'Background color in dark mode',                       'color',   'branding',  true,  6),
('app_support_phone',     '+2348000000000',     'Support Phone',        'Customer support phone number',                       'text',    'branding',  true,  7),
('app_support_email',     'support@citystaff.app','Support Email',      'Customer support email address',                     'text',    'branding',  true,  8),
('app_website',           'https://citystaff.app','Website URL',        'Your main website URL',                               'text',    'branding',  true,  9),

-- Business Rules
('platform_commission',   '15',                 'Platform Commission %','Percentage taken from each booking as platform fee',  'number',  'business',  false, 1),
('default_currency',      'NGN',                'Default Currency',     'Currency code (NGN, USD, GHS, KES, etc.)',             'text',    'business',  true,  2),
('currency_symbol',       '₦',                  'Currency Symbol',      'Symbol shown next to prices',                         'text',    'business',  true,  3),
('wallet_minimum_topup',  '1000',               'Min Wallet Top-up',    'Minimum amount a customer can add to wallet',         'number',  'business',  true,  4),
('referral_bonus',        '500',                'Referral Bonus',       'Amount credited when a referred user books first time','number', 'business',  false, 5),
('tax_percent',           '0',                  'Tax Percentage',       'VAT or tax percentage added to bookings',             'number',  'business',  true,  6),

-- Dispatch Settings (Uber-style)
('dispatch_offer_ttl',    '30',                 'Dispatch Timer (secs)','Seconds a provider has to accept a job offer (Uber uses 15-30)', 'number', 'dispatch', false, 1),
('dispatch_max_attempts', '5',                  'Max Dispatch Attempts','How many providers to try before giving up',          'number',  'dispatch',  false, 2),
('dispatch_max_distance', '50',                 'Max Distance (km)',    'Maximum km radius to search for providers',           'number',  'dispatch',  false, 3),
('dispatch_mode',         'nearest',            'Dispatch Mode',        'How to select providers: nearest | rating | hybrid',  'select',  'dispatch',  false, 4),

-- OTP / Security
('otp_expiry_seconds',    '300',                'OTP Expiry (secs)',    'How long OTP codes are valid',                        'number',  'security',  false, 1),
('otp_resend_wait',       '60',                 'OTP Resend Wait (secs)','Seconds before user can request a new OTP',         'number',  'security',  false, 2),

-- Customer App Screens
('home_greeting_morning', 'Good morning',       'Morning Greeting',     'Greeting text shown in the morning',                  'text',    'customer_app', true, 1),
('home_greeting_afternoon','Good afternoon',    'Afternoon Greeting',   'Greeting text shown in the afternoon',                'text',    'customer_app', true, 2),
('home_greeting_evening', 'Good evening',       'Evening Greeting',     'Greeting text shown in the evening',                  'text',    'customer_app', true, 3),
('home_search_placeholder','What service do you need?','Search Placeholder','Placeholder text in the search box',              'text',    'customer_app', true, 4),
('empty_bookings_text',   'No bookings yet',    'Empty Bookings Text',  'Text shown when customer has no bookings',            'text',    'customer_app', true, 5),
('booking_success_title', 'Booking Confirmed!', 'Booking Success Title','Title shown after successful booking',                'text',    'customer_app', true, 6),
('booking_success_body',  'Finding the best provider near you...', 'Booking Success Body', 'Body text after booking',         'text',    'customer_app', true, 7),
('no_providers_text',     'No providers found nearby. Please try again shortly.', 'No Providers Text', 'When no providers available', 'text', 'customer_app', true, 8),

-- Provider App Screens
('provider_onboarding_title','Join Our Team',   'Provider Onboarding Title','Title on provider registration screen',           'text',    'provider_app', true, 1),
('provider_onboarding_body', 'Earn money on your schedule. Work when you want.', 'Provider Onboarding Body', 'Description on provider registration', 'text', 'provider_app', true, 2),
('dispatch_offer_title',  'New Job Available!', 'Dispatch Offer Title', 'Title of push notification for new job offer',        'text',    'provider_app', true, 3),
('provider_min_payout',   '5000',               'Min Payout Amount',    'Minimum amount provider can request as payout',       'number',  'provider_app', true, 4),

-- Maintenance
('maintenance_mode',      'false',              'Maintenance Mode',     'Put app in maintenance mode (true/false)',             'boolean', 'system',    true,  1),
('maintenance_message',   'We are under maintenance. Back shortly!', 'Maintenance Message', 'Shown when maintenance mode is on', 'text', 'system',   true,  2),
('android_version',       '1.0.0',              'Min Android Version',  'Minimum required Android app version',                'text',    'system',    true,  3),
('ios_version',           '1.0.0',              'Min iOS Version',      'Minimum required iOS app version',                    'text',    'system',    true,  4),
('force_update',          'false',              'Force Update',         'Force users to update the app',                       'boolean', 'system',    true,  5)

ON CONFLICT (key) DO NOTHING;

-- =============================================
-- DEFAULT SERVICE CATEGORIES
-- =============================================
INSERT INTO service_categories (name, slug, description, icon_emoji, color, sort_order) VALUES
('Cleaning',   'cleaning',   'Home and office cleaning services',   '🧹', '#6C63FF', 1),
('Plumbing',   'plumbing',   'Plumbing repairs and installations',  '🔧', '#0EA5E9', 2),
('Electrical', 'electrical', 'Electrical repairs and wiring',       '⚡', '#F59E0B', 3),
('Carpentry',  'carpentry',  'Furniture and carpentry work',        '🪚', '#10B981', 4),
('Painting',   'painting',   'Interior and exterior painting',      '🎨', '#EF4444', 5),
('Moving',     'moving',     'Home and office relocation',          '📦', '#8B5CF6', 6),
('Laundry',    'laundry',    'Washing, ironing, dry cleaning',      '👕', '#14B8A6', 7),
('AC Repair',  'ac-repair',  'Air conditioning service and repair', '❄️', '#3B82F6', 8),
('Generator',  'generator',  'Generator servicing and repair',      '⚙️', '#F97316', 9),
('Fumigation', 'fumigation', 'Pest control and fumigation',         '🐛', '#84CC16', 10)
ON CONFLICT (slug) DO NOTHING;

-- =============================================
-- DEFAULT FRONTEND SECTIONS (CMS)
-- =============================================
INSERT INTO frontend_sections (page, section_key, title, subtitle, body, is_active, sort_order) VALUES
('home',       'hero',         'Book Trusted Services', 'Fast, reliable, at your doorstep', 'Professional services delivered to your home or office within hours.', true, 1),
('home',       'how_it_works', 'How It Works',          NULL, NULL, true, 2),
('home',       'why_choose_us','Why Choose City Staff',  NULL, NULL, true, 3),
('onboarding', 'slide_1',      'Book Any Service',      'From cleaning to repairs', 'Browse hundreds of professional services and book in under 2 minutes.', true, 1),
('onboarding', 'slide_2',      'Vetted Professionals',  'Safe and trusted', 'All our service providers are background-checked and verified.', true, 2),
('onboarding', 'slide_3',      'Real-time Tracking',    'Know where they are', 'Track your provider live on the map from acceptance to completion.', true, 3),
('about',      'main',         'About City Staff',      'Our Story', 'City Staff connects skilled professionals with customers who need reliable home services.', true, 1)
ON CONFLICT (page, section_key) DO NOTHING;

-- =============================================
-- DEFAULT FAQS
-- =============================================
INSERT INTO faqs (question, answer, category, sort_order) VALUES
('How do I book a service?',          'Open the app, select a service, enter your address, choose a date/time, and confirm payment. A nearby provider will be assigned automatically.', 'customer', 1),
('How long does it take to find a provider?', 'Our system finds a nearby provider within 30-60 seconds. You will be notified instantly when one accepts your booking.', 'customer', 2),
('Can I cancel a booking?',           'Yes, you can cancel before the provider starts the job. Cancellations made after acceptance may incur a small fee.', 'customer', 3),
('How do I pay?',                     'You can pay with your wallet balance or via card using Flutterwave. Wallet top-ups can be done from the app.', 'customer', 4),
('How do I become a provider?',       'Download the provider app, register with your phone number, upload your ID, select your services, and wait for verification. Verification takes 24-48 hours.', 'provider', 1),
('When do I get paid?',               'Earnings are credited to your wallet immediately after completing a job. You can request a bank transfer payout anytime.', 'provider', 2)
ON CONFLICT DO NOTHING;
