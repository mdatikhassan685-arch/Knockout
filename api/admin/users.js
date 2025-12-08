const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS & Method Check...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, userId, amount, status, search, adminId } = req.body;

    try {
        // ১. অ্যাডমিন ভেরিফিকেশন
        const [admin] = await pool.execute('SELECT role FROM users WHERE id = ?', [adminId]);
        if (!admin[0] || admin[0].role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

        // ২. ইউজার লিস্ট (সার্চ সহ)
        if (action === 'list') {
            let sql = 'SELECT id, username, email, wallet_balance, status, created_at FROM users WHERE role = "user"';
            let params = [];
            
            if (search) {
                sql += ' AND (username LIKE ? OR email LIKE ?)';
                params = [`%${search}%`, `%${search}%`];
            }
            
            sql += ' ORDER BY id DESC LIMIT 50';
            const [users] = await pool.execute(sql, params);
            return res.json({ success: true, users });
        }

        // ৩. স্ট্যাটাস আপডেট (Block/Suspend/Active)
        if (action === 'update_status') {
            const { until } = req.body; // সাসপেনশন ডেট
            
            await pool.execute(
                'UPDATE users SET status = ?, suspended_until = ? WHERE id = ?', 
                [status, until || null, userId]
            );
            return res.json({ success: true, message: `User status updated to ${status}` });
        }

        // ৪. ব্যালেন্স এডিট (Add/Deduct Money)
        if (action === 'update_balance') {
            await pool.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, userId]);
            
            // লগ রাখা
            const type = amount > 0 ? 'Admin Added' : 'Admin Deducted';
            await pool.execute('INSERT INTO transactions (user_id, amount, type, details) VALUES (?, ?, ?, ?)', [userId, amount, type, 'Manual Adjustment']);
            
            return res.json({ success: true, message: 'Balance updated successfully' });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
