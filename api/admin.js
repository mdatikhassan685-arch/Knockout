const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // বডি পার্সিং (সকল প্যারামিটার)
    const { 
        type, id, user_id, title, image, cat_type, 
        entry_fee, winning_prize, prize_pool, per_kill, match_type, match_time, map, total_spots,
        status, suspend_days, amount, action, deposit_id, withdraw_id,
        match_id, category_id,
        youtube, telegram, whatsapp, version, announcement, notification, about, policy
    } = req.body;

    try {
        // ==========================================
        // ⚙️ SETTINGS & STATS
        // ==========================================
        if (type === 'get_settings') {
            const [rows] = await db.execute('SELECT * FROM settings');
            const settings = {};
            rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
            return res.status(200).json(settings);
        }

        if (type === 'update_settings') {
            const upsert = async (key, val) => {
                await db.execute(`INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`, [key, val, val]);
            };
            await upsert('youtube_link', youtube);
            await upsert('telegram_link', telegram);
            await upsert('whatsapp_number', whatsapp);
            await upsert('app_version', version);
            await upsert('announcement', announcement);
            await upsert('notification_msg', notification);
            await upsert('about_us', about);
            await upsert('privacy_policy', policy);
            return res.status(200).json({ success: true, message: 'Settings Updated!' });
        }

        if (type === 'dashboard_stats') {
            const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"');
            const [w] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status = "pending"');
            const [m] = await db.execute('SELECT COUNT(*) as c FROM matches'); // Daily matches count
            const [t] = await db.execute('SELECT COUNT(*) as c FROM categories WHERE type="official"'); // Official count
            
            return res.status(200).json({ 
                total_users: u[0].c, 
                pending_deposits: d[0].c, 
                pending_withdraws: w[0].c, 
                total_tournaments: parseInt(m[0].c) + parseInt(t[0].c) 
            });
        }

        // ==========================================
        // 🎮 CATEGORY (Create Games)
        // ==========================================
        
        // List Categories
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }

        // Add Category
        if (type === 'add_category') { 
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [title, image, cat_type || 'normal', 'open']); 
            return res.status(200).json({ success: true, message: 'Category Added' }); 
        }

        // Edit Category
        if (type === 'edit_category') { 
            await db.execute(
                'UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', 
                [title, image, cat_type, id]
            ); 
            return res.status(200).json({ success: true, message: 'Updated' }); 
        }

        // Delete Category (WITH SAFETY)
        if (type === 'delete_category') {
            await db.execute(`DELETE match_participants FROM match_participants JOIN matches m ON match_participants.match_id = m.id WHERE m.category_id = ?`, [id]);
            await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
            const [result] = await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            
            if(result.affectedRows > 0) return res.status(200).json({ success: true });
            else return res.status(404).json({ error: 'Not found' });
        }


        // ==========================================
        // 🔥 DAILY MATCH MANAGEMENT (Add / Edit / Delete)
        // ==========================================
        
        // 1. Create Match
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?)`,
                [category_id, title, entry_fee || 0, prize_pool || 0, per_kill || 0, match_type, match_time, map, total_spots || 48]
            );
            return res.status(200).json({ success: true, message: 'Match Created!' });
        }

        // 2. Get Matches
        if (type === 'get_admin_matches') { 
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            if(category_id) sql = `SELECT * FROM matches WHERE category_id = ${parseInt(category_id)} ORDER BY match_time DESC`;
            const [matches] = await db.execute(sql); 
            return res.status(200).json(matches); 
        }

        // 3. 🔥 EDIT MATCH FIX (This was important for time update)
        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET 
                title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=? 
                WHERE id=?`, 
                [title, entry_fee, prize_pool, per_kill, match_type, match_time, map, total_spots, match_id]
            );
            return res.status(200).json({ success: true, message: 'Match Updated!' });
        }

        // 4. Delete Match
        if (type === 'delete_match') { 
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
            await db.execute('DELETE FROM matches WHERE id = ?', [id]); 
            return res.status(200).json({ success: true }); 
        }

        // 5. Update Status
        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [req.body.new_status, match_id]); 
            return res.status(200).json({ success: true }); 
        }


        // =======================
        // 👤 USER & WALLET (Core Functions)
        // =======================
        if (type === 'list_users') { const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC'); return res.status(200).json(users); }
        if (type === 'manage_balance') {
            const finalAmount = parseFloat(amount);
            const updateSql = action === 'add' ? 'wallet_balance + ?' : 'wallet_balance - ?';
            const trxType = action === 'add' ? 'Admin Gift' : 'Penalty';
            await db.execute(`UPDATE users SET wallet_balance = ${updateSql} WHERE id = ?`, [finalAmount, user_id]);
            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, ?, NOW())', [user_id, finalAmount, trxType]);
            return res.status(200).json({ success: true });
        }
        if (type === 'update_user_status') { await db.execute('UPDATE users SET status = ? WHERE id = ?', [status, user_id]); return res.status(200).json({ success: true }); }

        // Deposits & Withdraws
        if (type === 'list_deposits') { const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC'); return res.status(200).json(rows); }
        if (type === 'handle_deposit') { 
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (action === 'approve') { 
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]); 
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [dep[0].amount, dep[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Deposit", "Add Money")', [dep[0].user_id, dep[0].amount]);
            } else { await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]); }
            return res.status(200).json({ success: true });
        }
        if (type === 'list_withdrawals') { const [rows] = await db.execute('SELECT w.*, u.username, u.wallet_balance FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.created_at DESC'); return res.status(200).json(rows); }
        if (type === 'handle_withdrawal') { 
            const [wd] = await db.execute('SELECT * FROM withdrawals WHERE id = ?', [withdraw_id]);
            if (action === 'approve') { await db.execute('UPDATE withdrawals SET status = "approved" WHERE id = ?', [withdraw_id]); } 
            else { 
                await db.execute('UPDATE withdrawals SET status = "rejected" WHERE id = ?', [withdraw_id]); 
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [wd[0].amount, wd[0].user_id]); 
                await db.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Refund", "Withdraw Rejected")', [wd[0].user_id, wd[0].amount]); 
            } 
            return res.status(200).json({ success: true }); 
        }

        if (type === 'send_notification') {
            const { title, message, send_to_all } = req.body;
            if (send_to_all) await db.execute('INSERT INTO notifications (title, message, user_id) VALUES (?, ?, NULL)', [title, message]);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid Request' });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
