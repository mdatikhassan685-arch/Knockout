const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS Headers...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { action, type, id, status, adminId } = req.body;

    try {
        // ১. অ্যাডমিন চেক
        const [admin] = await pool.execute('SELECT role FROM users WHERE id = ?', [adminId]);
        if (!admin[0] || admin[0].role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

        // ২. লিস্ট লোড (Deposit / Withdraw)
        if (action === 'get_list') {
            if (type === 'deposits') {
                const [rows] = await pool.query(`
                    SELECT d.id, u.username, d.amount, d.sender_number, d.trx_id, d.created_at 
                    FROM deposits d JOIN users u ON d.user_id = u.id 
                    WHERE d.status = 'pending' ORDER BY d.created_at ASC
                `);
                return res.json({ success: true, data: rows });
            } 
            else if (type === 'withdrawals') {
                const [rows] = await pool.query(`
                    SELECT w.id, u.username, w.amount, w.method, w.account_number, w.created_at 
                    FROM withdrawals w JOIN users u ON w.user_id = u.id 
                    WHERE w.status = 'pending' ORDER BY w.created_at ASC
                `);
                return res.json({ success: true, data: rows });
            }
        }

        // ৩. স্ট্যাটাস আপডেট (Approve / Reject)
        if (action === 'update') {
            if (type === 'deposit') {
                const [dep] = await pool.execute('SELECT user_id, amount FROM deposits WHERE id = ?', [id]);
                if (status === 'approved') {
                    await pool.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [dep[0].amount, dep[0].user_id]);
                    await pool.execute('INSERT INTO transactions (user_id, amount, type, details) VALUES (?, ?, "Deposit", "Admin Approved")', [dep[0].user_id, dep[0].amount]);
                }
                await pool.execute('UPDATE deposits SET status = ? WHERE id = ?', [status, id]);
            } 
            else if (type === 'withdrawal') {
                const [withd] = await pool.execute('SELECT user_id, amount FROM withdrawals WHERE id = ?', [id]);
                if (status === 'approved') {
                    await pool.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [withd[0].amount, withd[0].user_id]);
                    await pool.execute('INSERT INTO transactions (user_id, amount, type, details) VALUES (?, ?, "Withdrawal", "Admin Approved")', [withd[0].user_id, -withd[0].amount]);
                }
                await pool.execute('UPDATE withdrawals SET status = ? WHERE id = ?', [status, id]);
            }
            return res.json({ success: true });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
