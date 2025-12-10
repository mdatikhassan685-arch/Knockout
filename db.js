const mysql = require('mysql2');

// Vercel Environment থেকে তথ্য নেবে
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
    ssl: { rejectUnauthorized: true }
});

module.exports = pool.promise();
