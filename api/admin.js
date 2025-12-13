const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, title, image, id, user_id, status, suspend_days, amount, action, deposit_id, withdraw_id } = req.body;

    try {
        // =======================
        // 🎮 CATEGORY MANAGEMENT (UPDATED)
        // =======================
        if (type === 'add_category') {
            const { title, image, cat_type } = req.body; // cat_type গ্রহণ করা হচ্ছে

            if (!title || !image) {
                return res.status(400).json({ error: 'Title and Image required' });
            }
            // ডিফল্ট হিসেবে 'normal' সেট করা হলো যদি টাইপ না আসে
            const finalType = cat_type || 'normal';

            const [result] = await db.execute('INSERT INTO categories (title, image, type) VALUES (?, ?, ?)', [title, image, finalType]);
            return res.status(200).json({ success: true, message: 'Category Added!', id: result.insertId });
        }

        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }

        if (type === 'delete_category') {
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true, message: 'Deleted' });
        }
                // ✅ EDIT CATEGORY API (NEW)
        if (type === 'edit_category') {
            const { id, title, image, cat_type } = req.body;
            
            if (!id || !title || !image) {
                return res.status(400).json({ error: 'All fields are required' });
            }

            await db.execute(
                'UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', 
                [title, image, cat_type, id]
            );

            return res.status(200).json({ success: true, message: 'Category Updated!' });
        }

        // =======================
        // 📊 DASHBOARD & USERS
        // =======================
        if (type === 'dashboard_stats') {
            const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"');
            const [w] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"');
            return res.status(200).json({ total_users: u[0].c, pending_deposits: d[0].c, pending_withdraws: w[0].c, total_tournaments: 0 });
        }

        if (type === 'list_users') {
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC');
            return res.status(200).json(users);
        }

        if (type === 'update_user_status') {
            let sql = 'UPDATE users SET status = ? WHERE id = ?';
            let params = [status, user_id];
            if (status === 'suspended' && suspend_days) {
                sql = 'UPDATE users SET status = ?, suspended_until = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?';
                params = [status, suspend_days, user_id];
            }
            await db.execute(sql, params);
            return res.status(200).json({ success: true });
        }

        // =======================
        // 💰 BALANCE & TRANSACTIONS
        // =======================
        if (type === 'manage_balance') {
            const finalAmount = parseFloat(amount);
            if (action === 'add') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Admin Gift", NOW())', [user_id, finalAmount]);
            } else {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [finalAmount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Penalty", NOW())', [user_id, finalAmount]);
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'list_deposits') {
            const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_deposit') {
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (dep.length === 0) return res.status(400).json({ error: 'Not found' });
            
            if (action === 'approve') {
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(dep[0].amount), dep[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Deposit", NOW())', [dep[0].user_id, parseFloat(dep[0].amount)]);
            } else {
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]);
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'list_withdrawals') {
            const [rows] = await db.execute('SELECT w.*, u.username, u.wallet_balance FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_withdrawal') {
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ?', [withdraw_id]);
            if (wd.length === 0) return res.status(400).json({ error: 'Not found' });

            if (action === 'approve') {
                await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]);
            } else {
                // Refund logic
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]);
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [parseFloat(wd[0].amount), wd[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Refund", NOW())', [wd[0].user_id, parseFloat(wd[0].amount)]);
            }
            return res.status(200).json({ success: true });
        }

        // =======================
        // 🔥 TOURNAMENT MANAGEMENT
        // =======================
        if (type === 'get_admin_matches') {
            const { category_id } = req.body;
            const [matches] = await db.execute('SELECT * FROM tournaments WHERE category_id = ? ORDER BY schedule_time DESC', [category_id]);
            return res.status(200).json(matches);
        }

        if (type === 'add_match') {
            const { category_id, title, entry_fee, winning_prize, schedule_time, match_type, total_spots } = req.body;
            await db.execute(`INSERT INTO tournaments (category_id, title, entry_fee, winning_prize, schedule_time, match_type, total_spots, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`, [category_id, title, entry_fee, winning_prize, schedule_time, match_type, total_spots]);
            return res.status(200).json({ success: true });
        }
        
        if (type === 'delete_match') {
            await db.execute('DELETE FROM tournaments WHERE id = ?', [req.body.id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'update_room') {
            const { id, room_id, room_pass } = req.body;
            await db.execute('UPDATE tournaments SET room_id = ?, room_pass = ? WHERE id = ?', [room_id, room_pass, id]);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid Type' });

    } catch (error) {
        console.error("Admin API Error:", error);
        return res.status(500).json({ error: error.message });
    }
}

        // =======================
        // 🏆 RESULT MANAGEMENT
        // =======================
        
        // ১. ম্যাচের সব প্লেয়ারের লিস্ট আনা
        if (type === 'get_match_participants') {
            const { match_id } = req.body;
            const [players] = await db.execute(`
                SELECT p.*, u.username 
                FROM participants p 
                JOIN users u ON p.user_id = u.id 
                WHERE p.tournament_id = ?
            `, [match_id]);
            return res.status(200).json(players);
        }

        // ২. রেজাল্ট সেভ করা এবং টাকা পাঠানো
        if (type === 'save_result') {
            const { participant_id, user_id, kills, rank, prize } = req.body;

            // Update Participant Stats
            await db.execute(
                'UPDATE participants SET kills = ?, rank = ?, prize_won = ? WHERE id = ?',
                [kills, rank, prize, participant_id]
            );

            // যদি প্রাইজ থাকে, তবে ইউজারের ব্যালেন্স আপডেট করা
            if (parseFloat(prize) > 0) {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [prize, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Match Winnings", NOW())', [user_id, prize]);
            }

            return res.status(200).json({ success: true, message: 'Updated' });
        }

        // ৩. ম্যাচ শেষ ঘোষণা করা
        if (type === 'finish_match') {
            const { match_id } = req.body;
            await db.execute('UPDATE tournaments SET status = "completed" WHERE id = ?', [match_id]);
            return res.status(200).json({ success: true });
        };
