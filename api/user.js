const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Headers (Security & Access Control)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, amount, method, account_number, sender_number, trx_id } = req.body;

    try {
        // ============================================
        // 🏠 HOME PAGE DATA (REAL DATABASE FETCH)
        // ============================================
        if (type === 'home') {
            // ১. ইউজারের বর্তমান ব্যালেন্স ও স্ট্যাটাস চেক
            const [userData] = await db.execute('SELECT wallet_balance, status FROM users WHERE id = ?', [user_id]);
            
            if (userData.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            // ২. ডাটাবেস থেকে ব্যানার আনা (banners টেবিল)
            const [banners] = await db.execute('SELECT * FROM banners ORDER BY id DESC');

            // ৩. ডাটাবেস থেকে গেম ক্যাটাগরি আনা (categories টেবিল)
            const [categories] = await db.execute('SELECT * FROM categories ORDER BY id ASC');

            // ৪. অ্যানাউন্সমেন্ট আনা (announcements টেবিল থেকে লেটেস্টটা)
            let announcementText = "Welcome to Knockout Esports!";
            try {
                const [notices] = await db.execute('SELECT message FROM announcements ORDER BY id DESC LIMIT 1');
                if (notices.length > 0) {
                    announcementText = notices[0].message;
                }
            } catch (err) {
                console.log("Announcement table empty or error");
            }

            // ৫. সব ডাটা ফ্রন্টএন্ডে পাঠানো
            return res.status(200).json({
                wallet: userData[0].wallet_balance || 0,
                status: userData[0].status,
                announcement: announcementText,
                banners: banners,       // এখন ডাটাবেস থেকে যাবে
                categories: categories  // এখন ডাটাবেস থেকে যাবে
            });
        }

        // ============================================
        // 💰 WALLET INFO & TRANSACTIONS
        // ============================================
        if (type === 'wallet_info') {
            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [transactions] = await db.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [user_id]);
            
            return res.status(200).json({
                balance: user[0]?.wallet_balance || 0,
                transactions: transactions
            });
        }

        // ============================================
        // 📥 DEPOSIT REQUEST
        // ============================================
        if (type === 'deposit') {
            if (!amount || !sender_number || !trx_id) return res.status(400).json({ error: 'All fields are required' });
            
            // deposits টেবিলে ইনসার্ট
            await db.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
                [user_id, amount, sender_number, trx_id]
            );

            // ট্রানজ্যাকশন হিস্ট্রিতেও পেন্ডিং হিসেবে দেখাতে পারেন (Optional)
            // await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Deposit Pending", NOW())', [user_id, amount]);

            return res.status(200).json({ success: true, message: 'Deposit request submitted successfully! Wait for Admin approval.' });
        }

        // ============================================
        // 📤 WITHDRAW REQUEST
        // ============================================
        if (type === 'withdraw') {
            if (!amount || !account_number || !method) return res.status(400).json({ error: 'All fields are required' });

            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            
            if (!user[0] || user[0].wallet_balance < amount) {
                return res.status(400).json({ error: 'Insufficient balance!' });
            }

            // withdrawals টেবিলে ইনসার্ট
            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
                [user_id, amount, method, account_number]
            );

            // সাথে সাথে ব্যালেন্স কাটা হবে না, এডমিন অ্যাপ্রুভ করলে কাটবে (আপনার লজিক অনুযায়ী)
            // অথবা রিকোয়েস্ট করার সাথে সাথেই ব্যালেন্স কেটে রাখতে পারেন:
            // await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount, user_id]);

            return res.status(200).json({ success: true, message: 'Withdraw request sent successfully!' });
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Server Error', details: error.message });
    }
};
