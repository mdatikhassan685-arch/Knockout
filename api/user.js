const db = require('../db');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, user_id, amount, method, account_number, sender_number, trx_id } = req.body;

    try {
        // ========== HOME DATA (REQUIRED FOR HOME.HTML) ==========
        if (type === 'home') {
            // ১. ইউজার ব্যালেন্স ও স্ট্যাটাস আনা
            const [userData] = await db.execute('SELECT wallet_balance, status FROM users WHERE id = ?', [user_id]);
            
            if (userData.length === 0) return res.status(404).json({ error: 'User not found' });

            // ২. ব্যানার এবং ক্যাটাগরি (এখন ডামি ডাটা, পরে DB থেকে আনবেন)
            // রিয়েল প্রজেক্টে: const [banners] = await db.execute('SELECT * FROM banners');
            const banners = [
                { id: 1, image: 'https://placehold.co/600x400/000000/FFF?text=PUBG+Tournament' },
                { id: 2, image: 'https://placehold.co/600x400/1e3a8a/FFF?text=FreeFire+League' }
            ];

            const categories = [
                { id: 1, title: 'Free Fire - Solo', image: 'https://cdn-icons-png.flaticon.com/512/2933/2933116.png' },
                { id: 2, title: 'Ludo King', image: 'https://cdn-icons-png.flaticon.com/512/3408/3408506.png' }
            ];

            return res.status(200).json({
                wallet: userData[0].wallet_balance || 0,
                status: userData[0].status,
                announcement: "Big Tournament coming this Friday! Join now.",
                banners: banners,
                categories: categories
            });
        }

        // ========== WALLET INFO ==========
        if (type === 'wallet_info') {
            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [transactions] = await db.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [user_id]);
            return res.status(200).json({
                balance: user[0]?.wallet_balance || 0,
                transactions
            });
        }

        // ========== DEPOSIT REQUEST ==========
        if (type === 'deposit') {
            if (!amount || !sender_number || !trx_id) return res.status(400).json({ error: 'Missing fields' });
            
            await db.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status) VALUES (?, ?, ?, ?, "pending")',
                [user_id, amount, sender_number, trx_id]
            );
            return res.status(200).json({ success: true, message: 'Deposit request sent! Wait for admin approval.' });
        }

        // ========== WITHDRAW REQUEST ==========
        if (type === 'withdraw') {
            if (!amount || !account_number) return res.status(400).json({ error: 'Missing fields' });

            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            if (user[0].wallet_balance < amount) return res.status(400).json({ error: 'Insufficient balance' });

            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status) VALUES (?, ?, ?, ?, "pending")',
                [user_id, amount, method, account_number]
            );
            return res.status(200).json({ success: true, message: 'Withdraw request sent!' });
        }

        return res.status(400).json({ error: 'Invalid type' });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: 'Server Error: ' + error.message });
    }
};
