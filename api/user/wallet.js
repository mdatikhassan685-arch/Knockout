const pool = require('../../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { userId } = req.body;

    try {
        // ১. ব্যালেন্স জানা
        const [user] = await pool.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
        if (user.length === 0) return res.status(404).json({ error: 'User not found' });

        // ২. ট্রানজেকশন হিস্ট্রি (শেষ ১০টি)
        const [transactions] = await pool.execute(
            'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', 
            [userId]
        );

        res.status(200).json({
            success: true,
            balance: user[0].wallet_balance,
            transactions
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
