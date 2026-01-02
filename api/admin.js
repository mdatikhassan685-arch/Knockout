const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    const body = req.body || {};
    const { type } = body;

    if (!type) return res.status(400).json({ error: 'Type is missing' });

    try {
        // --- ১. অ্যাডমিন ড্যাশবোর্ড স্ট্যাটাস কার্ড ---
        if (type === 'get_stats') {
            const [users] = await db.execute('SELECT COUNT(id) as total FROM users');
            const [matches] = await db.execute('SELECT COUNT(id) as total FROM matches');
            const [depositSum] = await db.execute('SELECT SUM(amount) as total FROM transactions WHERE type="deposit" AND status="success"');
            const [withdrawSum] = await db.execute('SELECT SUM(amount) as total FROM withdrawals WHERE status="success"');

            return res.status(200).json({
                total_users: users[0].total || 0,
                total_matches: matches[0].total || 0,
                total_deposit: depositSum[0].total || 0,
                total_withdraw: withdrawSum[0].total || 0
            });
        }

        // --- ২. পেন্ডিং ডিপোজিট ও উইথড্র লিস্ট ---
        if (type === 'get_pending_requests') {
            const [deposits] = await db.execute('SELECT id, user_id, amount, details FROM transactions WHERE type="deposit" AND status="pending" ORDER BY id DESC');
            const [withdrawals] = await db.execute('SELECT id, user_id, amount, method, account_number FROM withdrawals WHERE status="pending" ORDER BY id DESC');
            
            return res.status(200).json({ deposits, withdrawals });
        }

        if (type === 'update_request_status') {
    const { category, id, status } = body;

    // --- ১. ডিপোজিট ম্যানেজমেন্ট ---
    if (category === 'deposit') {
        if (status === 'success') {
            const [trx] = await db.execute('SELECT user_id, amount FROM transactions WHERE id = ?', [id]);
            if (trx.length > 0) {
                // ইউজারের wallet_balance এ টাকা যোগ করা
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [trx[0].amount, trx[0].user_id]);
            }
        }
        await db.execute('UPDATE transactions SET status = ? WHERE id = ?', [status, id]);
    } 

    // --- ২. উইথড্রয়াল ম্যানেজমেন্ট (টাকা ফেরতের লজিক সহ) ---
    else if (category === 'withdraw') {
        if (status === 'rejected') {
            // উইথড্রয়াল টেবিল থেকে ওই ট্রানজেকশনের ইউজার এবং এমাউন্ট খুঁজে বের করা
            const [wd] = await db.execute('SELECT user_id, amount FROM withdrawals WHERE id = ?', [id]);
            
            if (wd.length > 0) {
                const userId = wd[0].user_id;
                const refundAmount = wd[0].amount;

                // ইউজারের wallet_balance এ টাকা ফেরত দেওয়া
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [refundAmount, userId]);
                
                // ট্রানজেকশন টেবিলে রিফান্ডের একটি রেকর্ড রাখা (ইউজারের স্টেটমেন্টের জন্য)
                await db.execute('INSERT INTO transactions (user_id, amount, type, details, status) VALUES (?, ?, "Refund", "Withdrawal Rejected", "success")', [userId, refundAmount]);
            }
        }
        
        // উইথড্রয়াল স্ট্যাটাস আপডেট করা (success বা rejected)
        await db.execute('UPDATE withdrawals SET status = ? WHERE id = ?', [status, id]);
    }

    return res.status(200).json({ success: true });
               }
        
        // --- ৪. আপনার আগের ক্যাটাগরি ও ম্যাচ ম্যানেজমেন্ট কোড ---
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }

        if (type === 'add_category') {
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [body.title, body.image, body.cat_type || 'normal', 'open']);
            return res.status(200).json({ success: true });
        }

        if (type === 'get_matches_by_cat') {
            const [rows] = await db.execute('SELECT * FROM matches WHERE category_id = ? ORDER BY id DESC', [body.category_id]);
            return res.status(200).json(rows);
        }

        return res.status(400).json({ error: 'Unknown Type: ' + type });

    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
