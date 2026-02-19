require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { pool } = require('./db');

async function setupDatabase() {
  console.log('🚀 Setting up City Staff database...');
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ All tables created successfully!');
    console.log('✅ Default categories seeded!');
    console.log('✅ Super admin created!');
    console.log('');
    console.log('🔐 Default admin login:');
    console.log('   Email:    admin@yourdomain.com');
    console.log('   Password: Admin@123');
    console.log('   ⚠️  CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Database setup failed:', err.message);
    process.exit(1);
  }
}

setupDatabase();
