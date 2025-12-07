const db = require('../db');
const bcrypt = require('bcryptjs');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { email, password } = req.body;

    try {
        const [users] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (users.length === 0) return res.status(404).json({ error: 'User not found' });

        const user = users[0];

        // পাসওয়ার্ড যাচাই করা
        const isMatch = await bcrypt.compare(password, user.password);
        
        if (isMatch) {
            return res.status(200).json({
                success: true,
                message: 'Login successful',
                user: { id: user.id, username: user.username, role: user.role, balance: user.wallet_balance }
            });
        } else {
            return res.status(401).json({ error: 'Wrong password' });
        }

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
};
