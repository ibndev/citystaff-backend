const { query } = require('../config/db');

// In-memory cache to avoid hitting DB on every request
let settingsCache = {};
let cacheTime     = null;
const CACHE_TTL   = 60 * 1000; // 60 seconds

class SettingsService {

  // ── Get ALL settings (cached) ──
  static async getAll(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cacheTime && (now - cacheTime) < CACHE_TTL && Object.keys(settingsCache).length > 0) {
      return settingsCache;
    }
    const result = await query('SELECT key, value FROM app_settings ORDER BY sort_order ASC');
    settingsCache = {};
    result.rows.forEach(r => { settingsCache[r.key] = r.value; });
    cacheTime = now;
    return settingsCache;
  }

  // ── Get a single setting ──
  static async get(key, defaultValue = null) {
    const settings = await SettingsService.getAll();
    return settings[key] !== undefined ? settings[key] : defaultValue;
  }

  // ── Get a numeric setting ──
  static async getNumber(key, defaultValue = 0) {
    const val = await SettingsService.get(key, defaultValue);
    return parseFloat(val) || defaultValue;
  }

  // ── Get a boolean setting ──
  static async getBool(key, defaultValue = false) {
    const val = await SettingsService.get(key, String(defaultValue));
    return val === 'true' || val === '1';
  }

  // ── Update settings (clears cache) ──
  static async update(key, value) {
    await query(
      `INSERT INTO app_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value]
    );
    settingsCache = {}; // Clear cache
  }

  // ── Update multiple settings at once ──
  static async updateMany(settings) {
    for (const [key, value] of Object.entries(settings)) {
      await SettingsService.update(key, value);
    }
    settingsCache = {}; // Clear cache
  }

  // ── Get public settings (safe to expose to frontend) ──
  static async getPublic() {
    const result = await query('SELECT key, value FROM app_settings WHERE is_public = true ORDER BY sort_order ASC');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    return settings;
  }

  // ── Get settings grouped by group_name (for admin UI) ──
  static async getAllGrouped() {
    const result = await query(`
      SELECT key, value, label, description, type, options, group_name, is_public, sort_order
      FROM app_settings ORDER BY group_name, sort_order ASC
    `);
    const grouped = {};
    result.rows.forEach(r => {
      if (!grouped[r.group_name]) grouped[r.group_name] = [];
      grouped[r.group_name].push(r);
    });
    return grouped;
  }
}

module.exports = SettingsService;
