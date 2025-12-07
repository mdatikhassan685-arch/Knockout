const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
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
        // ১. ইমেইল চেক
        const [existing] = await db.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) return res.status(409).json({ error: 'Email already exists' });

        // ২. পাসওয়ার্ড হ্যাস করা
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // ৩. ইউজার তৈরি
        const [result] = await db.execute(
            'INSERT INTO users (username, email, password, role, wallet_balance, status, is_verified) VALUES (?, ?, ?, "user", 0, "active", 1)',
            [username, email, hashedPassword]
        );

        return res.status(201).json({ success: true, message: 'User created' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
