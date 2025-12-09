// db.js ফাইলটি ঠিক আছে ধরে নেওয়া হচ্ছে।
const pool = require('../db');
const bcrypt = require('bcryptjs'); // Assuming you use bcrypt for password hashing
// const jwt = require('jsonwebtoken'); // Assuming you use JWT for authentication

// --- Helper Functions ---
// TODO: Implement JWT generation logic. Replace 'your_jwt_secret' with your actual secret.
// function generateAdminToken(userId) {
//     const token = jwt.sign({ userId: userId, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '1h' });
//     return token;
// }

module.exports = async (req, res) => {
    // CORS Configuration (Essential for Vercel)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { type, email, password } = req.body;

    // Input validation (basic)
    if (!type || !email || !password) {
        return res.status(400).json({ success: false, error: 'Missing required parameters.' });
    }

    try {
        // --- Admin Login Logic ---
        if (type === 'admin-login') { // Assuming you have a separate type for admin login
            const [users] = await pool.execute('SELECT id, password, role FROM users WHERE email = ? AND role = "admin"', [email]);

            if (users.length === 0) {
                return res.status(401).json({ success: false, error: 'Invalid email or password.' });
            }

            const user = users[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (passwordMatch) {
                // Generate and return JWT token
                // const token = generateAdminToken(user.id);
                const token = "dummy_admin_token_for_test_" + user.id; // Placeholder token for testing
                return res.json({ success: true, token: token, role: user.role });
            } else {
                return res.status(401).json({ success: false, error: 'Invalid email or password.' });
            }
        }
        
        // --- Regular User Login Logic ---
        if (type === 'login') {
            const [users] = await pool.execute('SELECT id, password, role FROM users WHERE email = ?', [email]);

            if (users.length === 0) {
                return res.status(401).json({ success: false, error: 'Invalid email or password.' });
            }

            const user = users[0];
            const passwordMatch = await bcrypt.compare(password, user.password);

            if (passwordMatch) {
                // Generate and return JWT token for regular user
                // const token = generateUserToken(user.id);
                const token = "dummy_user_token_for_test_" + user.id; // Placeholder token for testing
                return res.json({ success: true, token: token, role: user.role });
            } else {
                return res.status(401).json({ success: false, error: 'Invalid email or password.' });
            }
        }

        // --- If request type is not recognized ---
        return res.status(400).json({ success: false, error: `Invalid request type: ${type}` });

    } catch (error) {
        console.error('API Error in api/auth.js:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
};
