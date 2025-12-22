const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    // Body Parser
    const { 
        type, id, user_id, title, image, cat_type, 
        entry_fee, prize_pool, per_kill, match_type, match_time, map,
        status, suspend_days, amount, action, deposit_id, withdraw_id,
        match_id, kills, rank, prize, category_id,
        youtube, telegram, whatsapp, version, announcement, notification, about, policy
    } = req.body;

    try {
        // ==========================================
        // 🎮 CATEGORY (ADD / EDIT / DELETE - FIXED)
        // ==========================================
        
        // 1. List
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }

        // 2. Add
        if (type === 'add_category') { 
            await db.execute('INSERT INTO categories (title, image, type) VALUES (?, ?, ?)', [title, image, cat_type || 'normal']); 
            return res.status(200).json({ success: true, message: 'Category Added' }); 
        }

        // 3. Edit (THIS WAS MISSING BEFORE)
        if (type === 'edit_category') { 
            await db.execute(
                'UPDATE categories SET title = ?, image = ?, type = ? WHERE id = ?', 
                [title, image, cat_type, id]
            ); 
            return res.status(200).json({ success: true, message: 'Category Updated' }); 
        }

        // 4. Delete
        if (type === 'delete_category') {
            // First delete related matches if any (Optional safety, cascading usually handles this)
            await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true, message: 'Category Deleted' }); 
        }


        // ==========================================
        // 🔥 DAILY MATCH MANAGEMENT
        // ==========================================
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming')`,
                [category_id, title, entry_fee || 0, prize_pool || 0, per_kill || 0, match_type, match_time, map]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'get_admin_matches') { 
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
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

        // ... বাকি ইউজার, ডিপোজিট এবং সেটিংস লজিকগুলো নিচে থাকবে ...
        // (আমি কোড ছোট রাখার জন্য বাকি অংশটুকু লিখিনি, কিন্তু আপনার ফাইলের নিচে বাকি অংশ ঠিকই থাকবে)
        
        // Settings & User/Wallet Part... (Keep existing code below)
        if (type === 'get_settings') { const [r] = await db.execute('SELECT * FROM settings'); const s={}; r.forEach(row=>{s[row.setting_key]=row.setting_value}); return res.status(200).json(s); }
        if (type === 'dashboard_stats') { const [u] = await db.execute('SELECT COUNT(*) as c FROM users'); const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"'); return res.status(200).json({total_users:u[0].c, pending_deposits:d[0].c}); }
        if (type === 'list_users') { const [u] = await db.execute('SELECT id,username,email,wallet_balance,status FROM users ORDER BY id DESC'); return res.status(200).json(u); }
        if (type === 'list_deposits') { const [r] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC'); return res.status(200).json(r); }
        if (type === 'handle_deposit') { const [dep]=await db.execute('SELECT * FROM deposits WHERE id=?',[deposit_id]); if(action==='approve'){ await db.execute('UPDATE deposits SET status="approved" WHERE id=?',[deposit_id]); await db.execute('UPDATE users SET wallet_balance=wallet_balance+? WHERE id=?',[dep[0].amount,dep[0].user_id]); await db.execute('INSERT INTO transactions (user_id,amount,type) VALUES (?,?,"Deposit")',[dep[0].user_id,dep[0].amount]); } else { await db.execute('UPDATE deposits SET status="rejected" WHERE id=?',[deposit_id]); } return res.status(200).json({success:true}); }

        // Final Return
        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
