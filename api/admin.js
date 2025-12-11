const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Method Check
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, status, amount, deposit_id, withdraw_id, action, suspend_days } = req.body;

    try {
        // ========== DASHBOARD STATS ==========
        if (type === 'dashboard_stats') {
            let totalUsers = 0, pendingDeposits = 0, pendingWithdraws = 0, totalTournaments = 0;
            try { const [u] = await db.execute('SELECT COUNT(*) as total FROM users'); totalUsers = u[0].total; } catch(e){}
            try { const [d] = await db.execute('SELECT COUNT(*) as pending FROM deposits WHERE status = "pending"'); pendingDeposits = d[0].pending; } catch(e){}
            try { const [w] = await db.execute('SELECT COUNT(*) as pending FROM withdrawals WHERE status = "pending"'); pendingWithdraws = w[0].pending; } catch(e){}
            try { const [t] = await db.execute('SELECT COUNT(*) as total FROM tournaments'); totalTournaments = t[0].total; } catch(e){}
            
            return res.status(200).json({ total_users: totalUsers, pending_deposits: pendingDeposits, pending_withdraws: pendingWithdraws, total_tournaments: totalTournaments });
        }

        // ========== USER LIST (SAFE MODE) ==========
        if (type === 'list_users') {
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

        // ========== UPDATE USER STATUS (BLOCK/ACTIVE/SUSPEND) ==========
        if (type === 'update_user_status') {
            // যদি ব্লক বা অ্যাক্টিভ হয়, সরাসরি আপডেট হবে
            if (status === 'blocked' || status === 'active') {
                await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
                return res.status(200).json({ success: true, message: `User ${status} successfully` });
            }

            // যদি সাসপেন্ড হয়
            if (status === 'suspended') {
                let suspendUntil = null;
                if (suspend_days) {
                    const date = new Date();
                    date.setDate(date.getDate() + parseInt(suspend_days));
                    suspendUntil = date.toISOString().slice(0, 19).replace('T', ' ');
                }

                try {
                    // কলাম থাকলে টাইমসহ আপডেট হবে
                    await db.execute('UPDATE users SET status = ?, suspended_until = ? WHERE id = ?', [status, suspendUntil, user_id]);
                } catch (err) {
                    // কলাম না থাকলে শুধু স্ট্যাটাস আপডেট হবে (Safe Fallback)
                    await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]);
                }
                return res.status(200).json({ success: true, message: 'User suspended' });
            }
        }

        // ========== MANAGE BALANCE (ADD / CUT) ==========
        if (type === 'manage_balance') {
            const finalAmount = action === 'deduct' ? -Math.abs(amount) : Math.abs(amount);
            const typeText = action === 'deduct' ? 'Admin Penalty' : 'Admin Gift';

            try {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [finalAmount, user_id]);
            } catch {
                await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [finalAmount, user_id]);
            }

            await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, ?)', [user_id, finalAmount, typeText]);
            return res.status(200).json({ success: true, message: 'Balance updated' });
        }

        // ========== PENDING DEPOSITS & WITHDRAWALS ==========
        if (type === 'list_deposits') {
            const [deposits] = await db.execute(
                `SELECT d.*, COALESCE(u.username, u.name, 'Unknown') as username FROM deposits d LEFT JOIN users u ON d.user_id = u.id ORDER BY d.created_at DESC LIMIT 50`
            );
            return res.status(200).json(deposits.filter(d => d.status && d.status.toLowerCase() === 'pending'));
        }

        if (type === 'list_withdrawals') {
            const [data] = await db.execute(
                `SELECT w.*, COALESCE(u.username, u.name, 'Unknown') as username FROM withdrawals w LEFT JOIN users u ON w.user_id = u.id ORDER BY w.created_at DESC LIMIT 50`
            );
            return res.status(200).json(data.filter(d => d.status && d.status.toLowerCase() === 'pending'));
        }

        // ========== HANDLE REQUESTS ==========
        if (type === 'handle_deposit') {
            const [deposit] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (!deposit.length) return res.status(404).json({ error: 'Not found' });
            const { user_id: uid, amount: amt } = deposit[0];

            if (action === 'approve') {
                try { await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amt, uid]); } 
                catch { await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [amt, uid]); }
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Deposit")', [uid, amt]);
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
            }
            return res.status(200).json({ success: true, message: 'Deposit Processed' });
        }

        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ?', [withdraw_id]);
            if (!wd.length) return res.status(404).json({ error: 'Not found' });
            const { user_id: uid, amount: amt } = wd[0];

            if (action === 'approve') {
                try { await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amt, uid]); }
                catch { await db.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [amt, uid]); }
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type) VALUES (?, ?, "Withdraw")', [uid, -amt]);
            } else {
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
            }
            return res.status(200).json({ success: true, message: 'Withdrawal Processed' });
        }

        // ========== CATEGORIES ==========
        if (type === 'list_categories') {
            const [cats] = await db.execute('SELECT * FROM tournaments WHERE is_category = 1');
            return res.status(200).json(cats);
        }
        if (type === 'create_category') {
            const { title, image } = req.body;
            await db.execute('INSERT INTO tournaments (title, image, is_category, is_official) VALUES (?, ?, 1, 0)', [title, image]);
            return res.status(200).json({ success: true });
        }
        if (type === 'delete_category') {
            const { id } = req.body;
            await db.execute('DELETE FROM tournaments WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        else { return res.status(400).json({ error: 'Invalid type' }); }

    } catch (error) {
        console.error('Admin API Error:', error);
        return res.status(500).json({ error: 'Server error', details: error.message });
    }
};
