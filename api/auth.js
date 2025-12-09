const pool = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, email, password, username, token } = req.body;

    try {
        if (type === 'login') {
            const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
            if (users.length === 0) return res.status(404).json({ error: 'User not found' });
            const user = users[0];
            const isMatch = await bcrypt.compare(password, user.password).catch(() => false);
            
            if (isMatch || user.password === password) {
                if(user.status === 'blocked') return res.status(403).json({ error: 'Blocked' });
                return res.status(200).json({ success: true, user });
            }
            return res.status(401).json({ error: 'Wrong password' });
        }

        if (type === 'signup') {
            const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
            if (existing.length > 0) return res.status(409).json({ error: 'Email exists' });
            const hash = await bcrypt.hash(password, 10);
            await pool.execute('INSERT INTO users (username, email, password, role, wallet_balance, status, is_verified) VALUES (?, ?, ?, "user", 0, "active", 1)', [username, email, hash]);
            return res.status(201).json({ success: true });
        }

        if (type === 'admin-login') {
            const [rows] = await pool.execute('SELECT * FROM users WHERE email = ? AND role = "admin" AND admin_token = ?', [email, token]);
            if (rows.length > 0) return res.status(200).json({ success: true, admin: rows[0] });
            return res.status(401).json({ error: 'Invalid Admin' });
        }
    } catch (error) { res.status(500).json({ error: error.message }); }
};
