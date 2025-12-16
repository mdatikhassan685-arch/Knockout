const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS এবং Cache বন্ধ করার হেডার (খুবই গুরুত্বপূর্ণ)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');  
    // এই নিচের ৩ লাইন ক্যাশ ধরে রাখা বন্ধ করবে
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, amount, method, account_number, sender_number, trx_id } = req.body;

    try {
        // =======================
        // 🏠 HOME PAGE DATA
        // =======================
        if (type === 'home') {
            // ১. ইউজারের ব্যালেন্স এবং স্ট্যাটাস আনা
            const [userData] = await db.execute('SELECT wallet_balance, status FROM users WHERE id = ?', [user_id]);
            
            if (userData.length === 0) {
                return res.status(404).json({ error: 'User not found' });
            }

            // ২. ব্যানার এবং ক্যাটাগরি আনা
            let banners = [];
            let categories = [];
            try {
                const [b] = await db.execute('SELECT * FROM banners ORDER BY id DESC');
                banners = b;
                const [c] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
                categories = c;
            } catch(e) {
                console.log("Data fetch error", e);
            }

            // ৩. এনাউন্সমেন্ট আনা
            let announcementText = "Welcome to Knockout Esports!";
            try {
                const [notices] = await db.execute('SELECT message FROM announcements ORDER BY id DESC LIMIT 1');
                if (notices.length > 0) announcementText = notices[0].message;
            } catch (err) {}

            return res.status(200).json({
                wallet: parseFloat(userData[0].wallet_balance),
                status: userData[0].status,
                announcement: announcementText,
                banners: banners,
                categories: categories
            });
        }

        // =======================
        // 💰 WALLET INFO
        // =======================
        if (type === 'wallet_info') {
            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [transactions] = await db.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [user_id]);
            
            return res.status(200).json({
                balance: parseFloat(user[0]?.wallet_balance || 0),
                transactions: transactions
            });
        }

        // =======================
        // 📥 DEPOSIT REQUEST
        // =======================
        if (type === 'deposit') {
            const depositAmount = parseFloat(amount);
            if (!depositAmount || depositAmount <= 0) return res.status(400).json({ error: 'Invalid amount' });
            if (!sender_number || !trx_id) return res.status(400).json({ error: 'All fields required' });
            
            await db.execute(
                'INSERT INTO deposits (user_id, amount, sender_number, trx_id, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
                [user_id, depositAmount, sender_number, trx_id]
            );

            return res.status(200).json({ success: true, message: 'Deposit request submitted!' });
        }
               // =======================
        // 👤 PROFILE STATS
        // =======================
        if (type === 'profile_stats') {
            // ১. বেসিক ইনফো
            const [user] = await db.execute('SELECT username, email, phone, wallet_balance, created_at FROM users WHERE id = ?', [user_id]);
            
            // ২. স্ট্যাটাস (Kills, Matches, Winnings)
            const [stats] = await db.execute(`
                SELECT 
                    COUNT(*) as total_matches,
                    SUM(kills) as total_kills,
                    SUM(prize_won) as total_winnings
                FROM participants 
                WHERE user_id = ?
            `, [user_id]);

            // ৩. রিসেন্ট ম্যাচ হিস্ট্রি
            const [recent] = await db.execute(`
                SELECT p.kills, p.rank, p.prize_won, t.title, t.schedule_time 
                FROM participants p
                JOIN tournaments t ON p.tournament_id = t.id
                WHERE p.user_id = ? 
                ORDER BY p.id DESC LIMIT 5
            `, [user_id]);

            return res.status(200).json({
                user: user[0],
                stats: stats[0],
                recent_matches: recent
            });
        }
                // =======================
        // 🏆 LEADERBOARD DATA
        // =======================
        if (type === 'leaderboard') {
            // যাদের Winnings সবচেয়ে বেশি তাদের টপ ১০ লিস্ট
            const [topPlayers] = await db.execute(`
                SELECT u.username, 
                COALESCE(SUM(p.prize_won), 0) as total_won,
                COALESCE(SUM(p.kills), 0) as total_kills
                FROM users u
                LEFT JOIN participants p ON u.id = p.user_id
                GROUP BY u.id
                ORDER BY total_won DESC
                LIMIT 10
            `);
            
            return res.status(200).json(topPlayers);
        }

        // =======================
        // 📤 WITHDRAW REQUEST
        // =======================
        if (type === 'withdraw') {
            const withdrawAmount = parseFloat(amount);
            if (!withdrawAmount || withdrawAmount < 50) return res.status(400).json({ error: 'Minimum withdraw 50 Tk' });
            if (!account_number || !method) return res.status(400).json({ error: 'Fill all fields' });

            const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const currentBalance = parseFloat(user[0].wallet_balance);

            if (currentBalance < withdrawAmount) {
                return res.status(400).json({ error: 'Insufficient balance!' });
            }

            // ব্যালেন্স কেটে রিকোয়েস্ট জমা দেওয়া
            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [withdrawAmount, user_id]);

            await db.execute(
                'INSERT INTO withdrawals (user_id, amount, method, account_number, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())',
                [user_id, withdrawAmount, method, account_number]
            );

            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Withdraw Request", NOW())', [user_id, withdrawAmount]);

            return res.status(200).json({ success: true, message: 'Withdraw request sent!' });
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error("API Error:", error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
