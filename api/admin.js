const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Cache Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body;
    const { type } = body;

    if (!type) return res.status(400).json({ error: 'Missing Request Type' });

    try {
        // --- 🎮 CATEGORY ---
        if (type === 'get_categories') { 
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); 
            return res.status(200).json(rows); 
        }

        if (type === 'add_category') { 
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', [body.title, body.image, body.cat_type || 'normal', 'open']); 
            return res.status(200).json({ success: true }); 
        }
        
        if (type === 'edit_category') { 
            await db.execute('UPDATE categories SET title=?, image=?, type=? WHERE id=?', [body.title, body.image, body.cat_type, body.id]); 
            return res.status(200).json({ success: true }); 
        }

        if (type === 'delete_category') {
            await db.execute(`DELETE mp FROM match_participants mp JOIN matches m ON mp.match_id = m.id WHERE m.category_id = ?`, [body.id]);
            await db.execute('DELETE FROM matches WHERE category_id = ?', [body.id]);
            await db.execute('DELETE FROM categories WHERE id = ?', [body.id]);
            return res.status(200).json({ success: true }); 
        }


        // --- 🔥 MATCH MANAGEMENT ---
        if (type === 'get_admin_matches') { 
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            let params = [];
            // Category ID থাকলে সেটা দিয়ে ফিল্টার করবে, না হলে সব দেখাবে (Safe Logic)
            if(body.category_id && body.category_id != 'null') {
                sql = `SELECT * FROM matches WHERE category_id = ? ORDER BY match_time DESC`;
                params = [body.category_id];
            }
            const [matches] = await db.execute(sql, params); 
            return res.status(200).json(matches); 
        }

        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?)`,
                [body.category_id, body.title, body.entry_fee||0, body.prize_pool||0, body.per_kill||0, body.match_type, body.match_time, body.map, body.total_spots||48]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=? WHERE id=?`, 
                [body.title, body.entry_fee, body.prize_pool, body.per_kill, body.match_type, body.match_time, body.map, body.total_spots, body.match_id]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_match') { 
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [body.id]);
            await db.execute('DELETE FROM matches WHERE id = ?', [body.id]); 
            return res.status(200).json({ success: true }); 
        }

        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [body.new_status, body.match_id]); 
            return res.status(200).json({ success: true }); 
        }

        // --- STATS & USERS ---
        if (type === 'dashboard_stats') {
            const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status = "pending"');
            return res.status(200).json({ total_users: u[0].c, pending_deposits: d[0].c });
        }
        
        // (বাকি ছোট ফাংশনগুলো আগের মতোই থাকবে, কিন্তু মূলত উপরের অংশেই আপনার এরর হচ্ছিল)
        return res.status(400).json({ error: 'Unknown Request' });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: error.message });
    }
};
