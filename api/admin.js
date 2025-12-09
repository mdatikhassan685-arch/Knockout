// db.js ফাইলটি ঠিক আছে ধরে নেওয়া হচ্ছে।
const pool = require('../db');

// --- Helper Functions ---
// TODO: Implement your authentication logic here to verify admin status using JWT or session data.
async function verifyAdminToken(token) {
    // Example: verify token using jwt library (if you are using JWT)
    // const jwt = require('jsonwebtoken');
    // try {
    //     const decoded = jwt.verify(token, process.env.JWT_SECRET);
    //     // Check if user ID from decoded token exists in users table and has admin role
    //     const [user] = await pool.execute('SELECT role FROM users WHERE id = ?', [decoded.userId]);
    //     return user.length > 0 && user[0].role === 'admin';
    // } catch (e) {
    //     return false;
    // }
    // For now, return true as a placeholder, but this must be replaced.
    return true;
}

module.exports = async (req, res) => {
    // CORS Configuration (Essential for Vercel)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { type, ...params } = req.body; // ...params collects all other parameters

    // 1. Authentication Check (Crucial for Admin Panel)
    const adminToken = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
    const isAdmin = await verifyAdminToken(adminToken);
    if (!isAdmin) {
        return res.status(401).json({ success: false, error: 'Unauthorized access.' });
    }

    // 2. Input Validation
    if (!type) {
        return res.status(400).json({ success: false, error: 'Request type is missing.' });
    }

    try {
        // --- Dashboard Stats Logic ---
        if (type === 'dashboard_stats') {
            const [totalUsers] = await pool.execute('SELECT COUNT(*) as count FROM users');
            // Add other stats queries here
            return res.json({ success: true, totalUsers: totalUsers[0].count, newRegistrations: 0, pendingDeposits: 0 });
        }

        // --- Categories Logic (list_categories) ---
        if (type === 'list_categories') {
            const [categories] = await pool.execute('SELECT * FROM tournaments WHERE is_category = 1 ORDER BY id DESC');
            return res.json({ success: true, categories });
        }
        
        // --- If request type is not recognized ---
        return res.status(400).json({ success: false, error: `Invalid request type: ${type}` });

    } catch (error) {
        console.error('API Error in api/admin.js:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
};
