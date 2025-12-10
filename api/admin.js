const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, status, deposit_id, withdraw_id, action } = req.body;

    try {
        // ========== DASHBOARD STATS ==========
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

        // ========== PENDING DEPOSITS LIST (Case Insensitive Fix) ==========
        if (type === 'list_deposits') {
            const [deposits] = await db.execute(
                `SELECT d.id, d.user_id, d.amount, d.sender_number, d.trx_id, d.status, d.created_at, 
                COALESCE(u.username, 'Unknown User') as username 
                FROM deposits d 
                LEFT JOIN users u ON d.user_id = u.id 
                WHERE LOWER(d.status) = 'pending' 
                ORDER BY d.created_at DESC LIMIT 50`
            );
            return res.status(200).json(deposits);
        }

        // ========== HANDLE DEPOSIT (Approve/Reject) ==========
        if (type === 'handle_deposit') {
            if (!deposit_id || !action) return res.status(400).json({ error: 'Invalid parameters' });

            const [deposit] = await db.execute('SELECT * FROM deposits WHERE id = ? AND status = "pending"', [deposit_id]);
            if (deposit.length === 0) return res.status(404).json({ error: 'Request not found' });

            const { user_id, amount: depAmount } = deposit[0];

            if (action === 'approve') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depAmount, user_id]);
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Deposit")', [user_id, depAmount]);
                return res.status(200).json({ success: true, message: 'Deposit Approved' });
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
                return res.status(200).json({ success: true, message: 'Deposit Rejected' });
            }
        }

        // ========== PENDING WITHDRAWALS LIST (FIXED) ==========
        if (type === 'list_withdrawals') {
            const [data] = await db.execute(
                `SELECT w.id, w.user_id, w.amount, w.method, w.account_number, w.status, w.created_at, 
                COALESCE(u.username, 'Unknown User') as username 
                FROM withdrawals w 
                LEFT JOIN users u ON w.user_id = u.id 
                WHERE w.status = 'pending' 
                ORDER BY w.created_at DESC LIMIT 50`
            );
            return res.status(200).json(data);
        }

        // ========== HANDLE WITHDRAWAL (Approve/Reject) ==========
        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ? AND status = "pending"', [withdraw_id]);
            if (!wd.length) return res.status(404).json({ error: 'Request not found' });
            
            const { user_id, amount: wdAmount } = wd[0];

            if (action === 'approve') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [wdAmount, user_id]);
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Withdraw")', [user_id, -wdAmount]);
                return res.status(200).json({ success: true, message: 'Withdrawal Approved' });
            } else {
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                return res.status(200).json({ success: true, message: 'Withdrawal Rejected' });
            }
        }

        // ========== USER LIST ==========
        if (type === 'list_users') {
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC LIMIT 50');
            return res.status(200).json(users);
        }

        // ========== UPDATE USER STATUS ==========
        if (type === 'update_user_status') {
            await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
            return res.status(200).json({ success: true, message: 'User updated' });
        }

        else {
            return res.status(400).json({ error: 'Invalid type' });
        }

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
