require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('./db');

async function setupDatabase() {
  console.log('🚀 Setting up City Staff v2 database...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ All tables created!');
    console.log('✅ Default settings, categories, sections seeded!');
    console.log('');
    console.log('🔐 Default admin login:');
    console.log('   Email:    admin@citystaff.app');
    console.log('   Password: Admin@123');
    console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Setup failed:', err.message);
    process.exit(1);
  }
}
setupDatabase();
