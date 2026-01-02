const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Headers Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Only POST allowed' });

    const body = req.body || {};
    const { type } = body;

    if (!type) return res.status(400).json({ error: 'Type is missing' });

    try {
        // --- ১. ড্যাশবোর্ড স্ট্যাটাস (কার্ডের জন্য) ---
        if (type === 'get_stats') {
            const [userCount] = await db.execute('SELECT COUNT(id) as total FROM users');
            const [matchCount] = await db.execute('SELECT COUNT(id) as total FROM matches');
            const [depositSum] = await db.execute('SELECT SUM(amount) as total FROM transactions WHERE type = "deposit" AND status = "success"');
            const [withdrawSum] = await db.execute('SELECT SUM(amount) as total FROM withdrawals WHERE status = "success"');

            return res.status(200).json({
                total_users: userCount[0].total || 0,
                total_matches: matchCount[0].total || 0,
                total_deposit: depositSum[0].total || 0,
                total_withdraw: withdrawSum[0].total || 0
            });
        }

        // --- ২. পেন্ডিং রিকোয়েস্ট লিস্ট আনা ---
        if (type === 'get_pending_requests') {
            const [deposits] = await db.execute('SELECT id, user_id, amount, details FROM transactions WHERE type="deposit" AND status="pending" ORDER BY id DESC');
            const [withdrawals] = await db.execute('SELECT id, user_id, amount, method, account_number FROM withdrawals WHERE status="pending" ORDER BY id DESC');
            
            return res.status(200).json({ deposits, withdrawals });
        }

        // --- ৩. ডিপোজিট/উইথড্র এক্সেপ্ট বা রিজেক্ট করা ---
        if (type === 'update_request_status') {
            const { category, id, status } = body;

            if (category === 'deposit') {
                if (status === 'success') {
                    const [trx] = await db.execute('SELECT user_id, amount FROM transactions WHERE id = ?', [id]);
                    if (trx.length > 0) {
                        // ইউজারের ব্যালেন্সে টাকা যোগ করা
                        await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [trx[0].amount, trx[0].user_id]);
                    }
                }
                await db.execute('UPDATE transactions SET status = ? WHERE id = ?', [status, id]);
            } 
            else if (category === 'withdraw') {
                if (status === 'rejected') {
                    const [wd] = await db.execute('SELECT user_id, amount FROM withdrawals WHERE id = ?', [id]);
                    if (wd.length > 0) {
                        // রিজেক্ট করলে টাকা ব্যালেন্সে ব্যাক দেওয়া
                        await db.execute('UPDATE users SET balance = balance + ? WHERE id = ?', [wd[0].amount, wd[0].user_id]);
                    }
                }
                await db.execute('UPDATE withdrawals SET status = ? WHERE id = ?', [status, id]);
            }
            return res.status(200).json({ success: true });
        }

        // --- ৪. ক্যাটাগরি ম্যানেজমেন্ট ---
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }

        if (type === 'add_category') {
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [body.title, body.image, body.cat_type || 'normal', 'open']);
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_category') {
            await db.execute('DELETE FROM categories WHERE id = ?', [body.id]);
            await db.execute('DELETE FROM matches WHERE category_id = ?', [body.id]);
            return res.status(200).json({ success: true });
        }

        // --- ৫. ম্যাচ ম্যানেজমেন্ট ---
        if (type === 'get_matches_by_cat') {
            const [rows] = await db.execute('SELECT * FROM matches WHERE category_id = ? ORDER BY id DESC', [body.category_id]);
            return res.status(200).json(rows);
        }

        if (type === 'add_match') {
            const { category_id, title, entry_fee, prize_pool, per_kill, match_type, map, match_time, total_spots } = body;
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, map, match_time, total_spots, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
                [category_id, title, entry_fee, prize_pool, per_kill, match_type, map, match_time, total_spots]
            );
            return res.status(200).json({ success: true });
        }

        // --- ৬. সেটিংস ও নোটিফিকেশন ---
        if (type === 'update_settings') {
            const { youtube, telegram, whatsapp, announcement, notification, about, policy, version } = body;
            const settings = { youtube, telegram, whatsapp, announcement, notification, about, policy, version };
            for (let key in settings) {
                await db.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [settings[key], key]);
            }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown Type: ' + type });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
