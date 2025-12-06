const pool = require('../../db');
const bcrypt = require('bcryptjs'); // লাইব্রেরি ইমপোর্ট

module.exports = async (req, res) => {
    // ... (CORS Headers আগের মতোই) ...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }

    try {
        // ইমেইল চেক
        const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        // ১. পাসওয়ার্ড হ্যাশ করা (লবণ ছিটিয়ে ১০ বার ঘুরানো!)
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ২. হ্যাশ করা পাসওয়ার্ড সেভ করা
        const [result] = await pool.execute(
            'INSERT INTO users (username, email, password, role, wallet_balance, status, is_verified) VALUES (?, ?, ?, "user", 0, "active", 1)',
            [username, email, hashedPassword] // এখানে প্লেইন পাসওয়ার্ডের বদলে hashedPassword যাবে
        );

        return res.status(201).json({
            success: true,
            message: 'User created successfully',
            userId: result.insertId
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
