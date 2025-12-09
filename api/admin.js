const pool = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, adminId } = req.body;

    try {
        // অ্যাডমিন ভেরিফিকেশন
        const [admin] = await pool.execute('SELECT role FROM users WHERE id = ?', [adminId]);
        if (!admin[0] || admin[0].role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

        if (type === 'dashboard-stats') {
            const [users] = await pool.query('SELECT COUNT(*) as count FROM users WHERE role = "user"');
            const [deposits] = await pool.query('SELECT COUNT(*) as count FROM deposits WHERE status = "pending"');
            const [tournaments] = await pool.query('SELECT COUNT(*) as count FROM tournaments');
            const [withdrawals] = await pool.query('SELECT COUNT(*) as count FROM withdrawals WHERE status = "pending"');
            
            // Recent Deposits
            const [recent] = await pool.query(`
                SELECT d.id, u.username, d.amount, d.created_at 
                FROM deposits d JOIN users u ON d.user_id = u.id 
                WHERE d.status = "pending" ORDER BY d.created_at DESC LIMIT 5
            `);

            return res.json({
                success: true,
                stats: {
                    totalUsers: users[0].count,
                    pendingDeposits: deposits[0].count,
                    totalTournaments: tournaments[0].count,
                    pendingWithdrawals: withdrawals[0].count
                },
                recentDeposits: recent
            });
        }
        
        // অন্যান্য অ্যাডমিন অ্যাকশন এখানে যোগ হবে...

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
