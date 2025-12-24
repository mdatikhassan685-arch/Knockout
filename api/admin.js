const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Request Body Parsing
    const body = req.body || {};
    const { 
        type, id, user_id, title, image, cat_type, 
        entry_fee, winning_prize, prize_pool, per_kill, match_type, match_time, map, total_spots,
        status, suspend_days, amount, action, deposit_id, withdraw_id,
        match_id, category_id,
        youtube, telegram, whatsapp, version, announcement, notification, about, policy
    } = body;

    // Safety check for empty request
    if (!type) return res.status(400).json({ error: 'Invalid Request: Missing Type' });

    try {
        // ==========================================
        // 🎮 CATEGORY (Get, Add, Edit, Delete)
        // ==========================================
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }

        if (type === 'add_category') { 
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [title, image, cat_type || 'normal', 'open']); 
            return res.status(200).json({ success: true, message: 'Category Added' }); 
        }

        if (type === 'edit_category') { 
            await db.execute(
                'UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', 
                [title, image, cat_type, id]
            ); 
            return res.status(200).json({ success: true }); 
        }

        if (type === 'delete_category') {
            // Delete linked matches and players first (Cascade Logic)
            await db.execute('DELETE match_participants FROM match_participants JOIN matches m ON match_participants.match_id = m.id WHERE m.category_id = ?', [id]);
            await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true }); 
        }


        // ==========================================
        // 🔥 MATCH MANAGEMENT (Daily Matches)
        // ==========================================
        
        // 1. Get Matches (Safe Handling for catId)
        if (type === 'get_admin_matches') { 
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            let params = [];

            // যদি category_id পাঠানো হয় এবং সেটি ভ্যালিড হয়, তবে ফিল্টার করবে
            if(category_id && category_id != 'null') {
                sql = `SELECT * FROM matches WHERE category_id = ? ORDER BY match_time DESC`;
                params = [category_id];
            }
            const [matches] = await db.execute(sql, params); 
            return res.status(200).json(matches); 
        }

        // 2. Create Match
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?)`,
                [category_id, title, entry_fee||0, prize_pool||0, per_kill||0, match_type, match_time, map, total_spots||48]
            );
            return res.status(200).json({ success: true, message: 'Created!' });
        }

        // 3. Edit Match (Fixed)
        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=? WHERE id=?`, 
                [title, entry_fee||0, prize_pool||0, per_kill||0, match_type, match_time, map, total_spots||48, match_id]
            );
            return res.status(200).json({ success: true, message: 'Updated!' });
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
        // ⚙️ DASHBOARD & SETTINGS
        // =======================
        if (type === 'get_settings') {
            const [rows] = await db.execute('SELECT * FROM settings');
            const settings = {};
            rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
            return res.status(200).json(settings);
        }

        if (type === 'dashboard_stats') {
            const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"');
            const [m] = await db.execute('SELECT COUNT(*) as c FROM matches');
            
            return res.status(200).json({ 
                total_users: u[0].c, 
                pending_deposits: d[0].c, 
                pending_withdraws: 0, 
                total_tournaments: m[0].c 
            });
        }
        
        // =======================
        // 👤 USERS & WALLET
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
        
        // Final fallback if no type matches
        return res.status(400).json({ error: 'Unknown Request Type' });

    } catch (error) {
        console.error("API Critical Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
