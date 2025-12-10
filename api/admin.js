const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, status, amount, deposit_id, action } = req.body;

    try {
        // ========== DASHBOARD STATS (ড্যাশবোর্ড তথ্য) ==========
        if (type === 'dashboard_stats') {
            const [users] = await db.execute('SELECT COUNT(*) as total FROM users');
            const [deposits] = await db.execute('SELECT COUNT(*) as pending FROM deposits WHERE status = "pending"');
            const [withdraws] = await db.execute('SELECT COUNT(*) as pending FROM withdrawals WHERE status = "pending"');
            const [tournaments] = await db.execute('SELECT COUNT(*) as total FROM tournaments');
            
            return res.status(200).json({
                total_users: users[0].total,
                pending_deposits: deposits[0].pending,
                pending_withdraws: withdraws[0].pending,
                total_tournaments: tournaments[0].total
            });
        }

        // ========== PENDING DEPOSITS LIST (ডিপোজিট লিস্ট) ==========
        if (type === 'list_deposits') {
            const [deposits] = await db.execute(
                'SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC LIMIT 20'
            );
            return res.status(200).json(deposits);
        }

        // ========== APPROVE/REJECT DEPOSIT (পেমেন্ট অ্যাকশন) ==========
        if (type === 'handle_deposit') {
            if (!deposit_id || !action) return res.status(400).json({ error: 'Invalid parameters' });

            // 1. ডিপোজিট খুঁজে বের করা
            const [deposit] = await db.execute('SELECT * FROM deposits WHERE id = ? AND status = "pending"', [deposit_id]);
            
            if (deposit.length === 0) {
                return res.status(404).json({ error: 'Request not found or already processed' });
            }

            const { user_id, amount: depAmount } = deposit[0];

            if (action === 'approve') {
                // ব্যালেন্স যোগ করা
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depAmount, user_id]);
                // স্ট্যাটাস আপডেট
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                // ট্রানজেকশন হিস্ট্রি
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Deposit")', [user_id, depAmount]);
                
                return res.status(200).json({ success: true, message: 'Deposit Approved & Balance Added' });
            } 
            else if (action === 'reject') {
                // শুধু স্ট্যাটাস আপডেট (রিজেক্ট)
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
                return res.status(200).json({ success: true, message: 'Deposit Rejected' });
            }
        }

        // ========== MANAGE USERS (ইউজার স্ট্যাটাস আপডেট) ==========
        if (type === 'update_user_status') {
            await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
            return res.status(200).json({ success: true, message: 'User status updated' });
        }

        else {
            return res.status(400).json({ error: 'Invalid admin action type' });
        }

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
