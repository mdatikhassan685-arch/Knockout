const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 4000,
    ssl: { rejectUnauthorized: true },
    waitForConnections: true,
    connectionLimit: 1, // কানেকশন লিমিট কমানো হলো
    queueLimit: 0
};

// গ্লোবাল ভেরিয়েবল ব্যবহার করে কানেকশন ক্যাশ করা (Vercel-এর জন্য জরুরি)
let pool;

if (!global.dbPool) {
    global.dbPool = mysql.createPool(dbConfig);
}
pool = global.dbPool;

module.exports = pool;
