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
            
            // Safe Query for deposits/withdraws (status column check)
            let pendingDeposits = 0;
            let pendingWithdraws = 0;
            
            try {
                const [deposits] = await db.execute('SELECT COUNT(*) as pending FROM deposits WHERE status = "pending"');
                const [withdraws] = await db.execute('SELECT COUNT(*) as pending FROM withdrawals WHERE status = "pending"');
                pendingDeposits = deposits[0].pending;
                pendingWithdraws = withdraws[0].pending;
            } catch (e) { console.log("Status column missing in deposits/withdrawals"); }

            const [tournaments] = await db.execute('SELECT COUNT(*) as total FROM tournaments');
            
            return res.status(200).json({
                total_users: users[0].total,
                pending_deposits: pendingDeposits,
                pending_withdraws: pendingWithdraws,
                total_tournaments: tournaments[0].total
            });
        }

        // ========== USER LIST (SUPER SAFE MODE) ==========
        if (type === 'list_users') {
            // SELECT * ব্যবহার করা হয়েছে যাতে কলামের নাম ভুল না হয়
            const [users] = await db.execute('SELECT * FROM users ORDER BY id DESC LIMIT 50');
            
            const formattedUsers = users.map(u => ({
                id: u.id,
                username: u.username || u.name || "Unknown",
                email: u.email,
                wallet_balance: u.wallet_balance || u.balance || 0,
                status: u.status || 'active'
            }));

            return res.status(200).json(formattedUsers);
        }

        // ========== PENDING DEPOSITS LIST (SAFE) ==========
        if (type === 'list_deposits') {
            const [deposits] = await db.execute(
                `SELECT d.*, COALESCE(u.username, u.name, 'Unknown User') as username 
                FROM deposits d 
                LEFT JOIN users u ON d.user_id = u.id 
                ORDER BY d.created_at DESC LIMIT 50`
            );
            // ফিল্টার করা হচ্ছে জাভাস্ক্রিপ্ট দিয়ে (যদি DB তে case sensitive হয়)
            const pending = deposits.filter(d => d.status && d.status.toLowerCase() === 'pending');
            return res.status(200).json(pending);
        }

        // ========== HANDLE DEPOSIT (Approve/Reject) ==========
        if (type === 'handle_deposit') {
            if (!deposit_id || !action) return res.status(400).json({ error: 'Invalid parameters' });

            const [deposit] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (deposit.length === 0) return res.status(404).json({ error: 'Request not found' });

            const { user_id, amount: depAmount } = deposit[0];

            if (action === 'approve') {
                // ব্যালেন্স যোগ (safe update)
                try {
                    await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [depAmount, user_id]);
                } catch {
                    await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [depAmount, user_id]);
                }
                
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Deposit")', [user_id, depAmount]);
                return res.status(200).json({ success: true, message: 'Deposit Approved' });
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
                return res.status(200).json({ success: true, message: 'Deposit Rejected' });
            }
        }

        // ========== PENDING WITHDRAWALS LIST (SAFE) ==========
        if (type === 'list_withdrawals') {
            const [data] = await db.execute(
                `SELECT w.*, COALESCE(u.username, u.name, 'Unknown User') as username 
                FROM withdrawals w 
                LEFT JOIN users u ON w.user_id = u.id 
                ORDER BY w.created_at DESC LIMIT 50`
            );
            const pending = data.filter(d => d.status && d.status.toLowerCase() === 'pending');
            return res.status(200).json(pending);
        }

        // ========== HANDLE WITHDRAWAL ==========
        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ?', [withdraw_id]);
            if (!wd.length) return res.status(404).json({ error: 'Not found' });
            
            const { user_id, amount: wdAmount } = wd[0];

            if (action === 'approve') {
                try {
                    await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [wdAmount, user_id]);
                } catch {
                    await db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [wdAmount, user_id]);
                }
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Withdraw")', [user_id, -wdAmount]);
                return res.status(200).json({ success: true, message: 'Withdrawal Approved' });
            } else {
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                return res.status(200).json({ success: true, message: 'Withdrawal Rejected' });
            }
        }

        // ========== UPDATE USER STATUS ==========
        if (type === 'update_user_status') {
            try {
                await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
                return res.status(200).json({ success: true, message: 'User updated' });
            } catch (err) {
                // কলাম না থাকলে এরর ইগনোর করবে
                return res.status(200).json({ success: true, message: 'Updated (Status column missing in DB)' });
            }
        }

        else {
            return res.status(400).json({ error: 'Invalid type' });
        }

    } catch (error) {
        console.error('Admin API Error:', error);
        // JSON Error Return (যাতে ফ্রন্টএন্ড ক্র্যাশ না করে)
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
