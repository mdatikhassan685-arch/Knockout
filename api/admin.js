const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Cache Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Body Parser
    const { 
        type, id, user_id, title, image, cat_type, 
        entry_fee, winning_prize, prize_pool, per_kill, match_type, match_time, map,
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
            const [t] = await db.execute('SELECT COUNT(*) as c FROM categories');
            return res.status(200).json({ 
                total_users: u[0].c, 
                pending_deposits: d[0].c, 
                pending_withdraws: w[0].c, 
                total_tournaments: t[0].c 
            });
        }

        if (type === 'send_notification') {
            const { title, message, send_to_all } = req.body;
            if (send_to_all) {
                await db.execute('INSERT INTO notifications (title, message, user_id) VALUES (?, ?, NULL)', [title, message]);
            }
            return res.status(200).json({ success: true, message: 'Notification Sent!' });
        }

        // ==========================================
        // 🎮 CATEGORY (ADD / EDIT / DELETE - FIXED)
        // ==========================================
        
        // 1. Get Categories
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }

        // 2. Add Category
        if (type === 'add_category') { 
            await db.execute('INSERT INTO categories (title, image, type) VALUES (?, ?, ?)', [title, image, cat_type || 'normal']); 
            return res.status(200).json({ success: true, message: 'Category Added' }); 
        }

        // 3. Edit Category
        if (type === 'edit_category') { 
            await db.execute(
                'UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', 
                [title, image, cat_type, id]
            ); 
            return res.status(200).json({ success: true, message: 'Updated Successfully' }); 
        }

        // ============================
        // 🗑️ SUPER FORCE DELETE CATEGORY
        // ============================
        if (type === 'delete_category') {
            try {
                // ১. চেক করি আগে কোন কোন ম্যাচের সাথে এটা যুক্ত আছে
                const [matches] = await db.execute('SELECT id FROM matches WHERE category_id = ?', [id]);
                
                // যদি ম্যাচ পাওয়া যায়, তাহলে সেই ম্যাচগুলো আগে লুপ করে তাদের প্লেয়ার ডিলিট করি
                if (matches.length > 0) {
                    const matchIds = matches.map(m => m.id);
                    // ইন (IN) কুয়েরি ব্যবহার করে একবারে সব প্লেয়ার ডিলিট
                    await db.execute(`DELETE FROM match_participants WHERE match_id IN (${matchIds.join(',')})`);
                    // এবার ম্যাচগুলো ডিলিট
                    await db.execute(`DELETE FROM matches WHERE id IN (${matchIds.join(',')})`);
                }

                // ২. যদি আগের লজিকে কাজ না করে, ডাইরেক্ট কনস্ট্রেইন্ট বাদে ফোর্স ডিলিট
                // (Optional: কিন্তু আপনার সিস্টেমে কাজ করবে)
                await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);

                // ৩. অবশেষে ক্যাটাগরি ডিলিট
                const [result] = await db.execute('DELETE FROM categories WHERE id = ?', [id]);

                if (result.affectedRows > 0) {
                    return res.status(200).json({ success: true, message: 'Deleted Successfully!' });
                } else {
                    return res.status(400).json({ error: 'Category ID not found or already deleted.' });
                }

            } catch (error) {
                console.error("Delete Error:", error);
                // যদি Foreign Key সমস্যা হয়
                if (error.code === 'ER_ROW_IS_REFERENCED_2') {
                    return res.status(400).json({ error: 'Cannot delete: Matches are linked. Try clearing matches first.' });
                }
                return res.status(500).json({ error: 'Database delete failed: ' + error.message });
            }
        }


        // ==========================================
        // 🔥 MATCH MANAGEMENT (DAILY)
        // ==========================================
        
        // Create Match
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')`,
                [category_id, title, entry_fee || 0, prize_pool || 0, per_kill || 0, match_type, match_time, map]
            );
            return res.status(200).json({ success: true, message: 'Match Created!' });
        }

        // List Admin Matches
        if (type === 'get_admin_matches') { 
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            if(category_id) sql = `SELECT * FROM matches WHERE category_id = ${parseInt(category_id)} ORDER BY match_time DESC`;
            const [matches] = await db.execute(sql); 
            return res.status(200).json(matches); 
        }

        // Delete Match (Safety Delete)
        if (type === 'delete_match') { 
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
            await db.execute('DELETE FROM matches WHERE id = ?', [id]); 
            return res.status(200).json({ success: true }); 
        }

        // Status Update
        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [req.body.new_status, match_id]); 
            return res.status(200).json({ success: true }); 
        }


        // =======================
        // 👤 USER & WALLET (Common)
        // =======================
        if (type === 'list_users') { const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC'); return res.status(200).json(users); }
        if (type === 'list_deposits') { const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC'); return res.status(200).json(rows); }
        if (type === 'handle_deposit') { 
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (action === 'approve') { 
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]); 
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [dep[0].amount, dep[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Deposit", "Add Money")', [dep[0].user_id, dep[0].amount]);
            } else { await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]); }
            return res.status(200).json({ success: true, message: 'Processed!' });
        }
        
        // Final fallback
        return res.status(400).json({ error: 'Invalid Request' });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
