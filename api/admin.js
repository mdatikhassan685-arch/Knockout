// db.js ফাইলটি ঠিক আছে ধরে নেওয়া হচ্ছে।
const pool = require('../db');

// --- Helper Functions ---
// Function to verify Admin status (JWT or Session Check)
// You must implement proper authentication logic here!
// Example: async function checkAdminStatus(userId) { ... }

module.exports = async (req, res) => {
    // CORS Configuration (Essential for Vercel)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Added Authorization header for security
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { type, ...params } = req.body; // ...params collects all other parameters

    // 1. Authentication Check (Crucial for Admin Panel)
    // You must add your admin verification logic here.
    // Example: const isAdmin = await checkAdminStatus(req.headers.authorization);
    // if (!isAdmin) { return res.status(401).json({ success: false, error: 'Unauthorized access.' }); }

    // 2. Input Validation
    if (!type) {
        return res.status(400).json({ success: false, error: 'Request type is missing.' });
    }

    try {
        // --- Categories Logic (list_categories) ---
        if (type === 'list_categories') {
            const [categories] = await pool.execute('SELECT * FROM tournaments WHERE is_category = 1 ORDER BY id DESC');
            return res.json({ success: true, categories });
        }

        // --- Add other Admin Logic here (e.g., Manage Users, Payments) ---
        if (type === 'update_user_status') {
            // ... logic for update user status ...
            // return res.json({ success: true, message: 'User updated successfully.' });
        }
        
        // --- If request type is not recognized ---
        return res.status(400).json({ success: false, error: `Invalid request type: ${type}` });

    } catch (error) {
        console.error('API Error in api/admin.js:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
};
