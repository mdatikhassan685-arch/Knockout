const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Cache Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Request Body Parsing (Safe extraction)
    const { 
        type, id, title, image, cat_type, 
        entry_fee, winning_prize, prize_pool, per_kill, match_type, match_time, map,
        status, amount, action, deposit_id, withdraw_id, user_id,
        match_id, category_id,
        youtube, telegram, whatsapp, version, announcement, notification, about, policy, 
        send_to_all, message
    } = req.body;

    try {
        
        // --- 🟢 CATEGORY MANAGEMENT ---
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }

        if (type === 'add_category') { 
            if (!title || !image) return res.status(400).json({ error: 'Missing title or image' });
            await db.execute('INSERT INTO categories (title, image, type) VALUES (?, ?, ?)', [title, image, cat_type || 'normal']); 
            return res.status(200).json({ success: true, message: 'Category Added' }); 
        }

        if (type === 'edit_category') { 
            await db.execute(
                'UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', 
                [title, image, cat_type || 'normal', id]
            ); 
            return res.status(200).json({ success: true, message: 'Category Updated' }); 
        }

        if (type === 'delete_category') {
            try {
                // Force delete related matches first to avoid foreign key error
                await db.execute('DELETE match_participants FROM match_participants JOIN matches ON match_participants.match_id = matches.id WHERE matches.category_id = ?', [id]);
                await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
                const [del] = await db.execute('DELETE FROM categories WHERE id = ?', [id]);
                
                if(del.affectedRows > 0) return res.status(200).json({ success: true });
                else return res.status(404).json({ error: 'Category not found' });
            } catch(e) {
                return res.status(500).json({ error: e.message });
            }
        }


        // --- 🔥 DAILY MATCH MANAGEMENT ---
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')`,
                [category_id, title, entry_fee || 0, prize_pool || 0, per_kill || 0, match_type, match_time, map]
            );
            return res.status(200).json({ success: true, message: 'Match Created!' });
        }

        if (type === 'get_admin_matches') { 
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            // এখানে category_id সঠিকভাবে int এ পার্স করা হয়েছে
            if(category_id) sql = `SELECT * FROM matches WHERE category_id = ${parseInt(category_id)} ORDER BY match_time DESC`;
            const [matches] = await db.execute(sql); 
            return res.status(200).json(matches); 
        }

        if (type === 'delete_match') { 
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
            await db.execute('DELETE FROM matches WHERE id = ?', [id]); 
            return res.status(200).json({ success: true }); 
        }

        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [req.body.new_status, match_id]); 
            return res.status(200).json({ success: true }); 
        }


        // --- ⚙️ SYSTEM & USERS ---
        if (type === 'get_settings') {
            const [r] = await db.execute('SELECT * FROM settings');
            const s={}; r.forEach(row=>{s[row.setting_key]=row.setting_value}); 
            return res.status(200).json(s);
        }

        if (type === 'update_settings') {
            const upsert = async (key, val) => { await db.execute(`INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?`, [key, val, val]); };
            await upsert('youtube_link', youtube); await upsert('telegram_link', telegram); await upsert('whatsapp_number', whatsapp); await upsert('app_version', version); await upsert('announcement', announcement); await upsert('notification_msg', notification); await upsert('about_us', about); await upsert('privacy_policy', policy);
            return res.status(200).json({ success: true });
        }

        if (type === 'dashboard_stats') {
            const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"');
            const [m] = await db.execute('SELECT COUNT(*) as c FROM matches'); // Match Count
            return res.status(200).json({ total_users: u[0].c, pending_deposits: d[0].c, pending_withdraws: 0, total_tournaments: m[0].c });
        }

        if (type === 'list_users') { 
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC'); 
            return res.status(200).json(users); 
        }

        if (type === 'list_deposits') {
            const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC'); 
            return res.status(200).json(rows); 
        }

        if (type === 'handle_deposit') { 
            const [dep] = await db.execute('SELECT * FROM deposits WHERE id = ?', [deposit_id]);
            if (!dep || dep.length === 0) return res.status(404).json({ error: 'Deposit not found' });

            if (action === 'approve') { 
                await db.execute('UPDATE deposits SET status = "approved" WHERE id = ?', [deposit_id]); 
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [dep[0].amount, dep[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Deposit", "Add Money")', [dep[0].user_id, dep[0].amount]);
            } else { 
                await db.execute('UPDATE deposits SET status = "rejected" WHERE id = ?', [deposit_id]); 
            }
            return res.status(200).json({ success: true, message: 'Done!' });
        }

        if (type === 'send_notification') {
            if (send_to_all) await db.execute('INSERT INTO notifications (title, message, user_id) VALUES (?, ?, NULL)', [title, message]);
            return res.status(200).json({ success: true });
        }

        // --- ❌ Default Fallback (If Type Missing) ---
        return res.status(400).json({ error: 'Invalid Request Type: ' + type });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Server Error: ' + error.message });
    }
};
