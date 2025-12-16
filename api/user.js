const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Cache Control
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { type, user_id, amount, method, account_number, sender_number, trx_id } = req.body;

    try {
        // =======================
        // ⚙️ GET SETTINGS
        // =======================
        if (type === 'get_app_settings') {
            const [rows] = await db.execute('SELECT * FROM settings');
            const settings = {};
            rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
            return res.status(200).json(settings);
        }

        // =======================
        // 🏠 HOME PAGE DATA
        // =======================
        if (type === 'home') {
            const [userData] = await db.execute('SELECT wallet_balance, status FROM users WHERE id = ?', [user_id]);
            if (userData.length === 0) return res.status(404).json({ error: 'User not found' });

            let banners = [], categories = [];
            try { 
                const [b] = await db.execute('SELECT * FROM banners ORDER BY id DESC'); banners = b; 
                const [c] = await db.execute('SELECT * FROM categories ORDER BY id ASC'); categories = c; 
            } catch(e) {}
            
            // Get Dynamic Announcement & Notification
            let announcementText = "Welcome to Knockout Esports!";
            let notificationText = "No new notifications.";
            try {
                const [s] = await db.execute('SELECT * FROM settings WHERE setting_key IN ("announcement", "notification_msg")');
                s.forEach(row => {
                    if (row.setting_key === 'announcement') announcementText = row.setting_value;
                    if (row.setting_key === 'notification_msg') notificationText = row.setting_value;
                });
            } catch (err) {}

            return res.status(200).json({ 
                wallet: parseFloat(userData[0].wallet_balance), 
                status: userData[0].status, 
                announcement: announcementText,
                notification_msg: notificationText, // Added Notification
                banners: banners, 
                categories: categories 
            });
        }

        // =======================
        // 💰 WALLET & DEPOSIT & WITHDRAW
        // =======================
        if (type === 'wallet_info') { const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]); const [transactions] = await db.execute('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', [user_id]); return res.status(200).json({ balance: parseFloat(user[0]?.wallet_balance || 0), transactions: transactions }); }
        if (type === 'deposit') { const depositAmount = parseFloat(amount); if (!depositAmount || depositAmount <= 0) return res.status(400).json({ error: 'Invalid amount' }); await db.execute('INSERT INTO deposits (user_id, amount, sender_number, trx_id, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())', [user_id, depositAmount, sender_number, trx_id]); return res.status(200).json({ success: true, message: 'Submitted!' }); }
        if (type === 'withdraw') { const withdrawAmount = parseFloat(amount); if (!withdrawAmount || withdrawAmount < 50) return res.status(400).json({ error: 'Min withdraw 50 Tk' }); const [user] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]); if (parseFloat(user[0].wallet_balance) < withdrawAmount) return res.status(400).json({ error: 'Insufficient balance!' }); await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [withdrawAmount, user_id]); await db.execute('INSERT INTO withdrawals (user_id, amount, method, account_number, status, created_at) VALUES (?, ?, ?, ?, "pending", NOW())', [user_id, withdrawAmount, method, account_number]); await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Withdraw Request", NOW())', [user_id, withdrawAmount]); return res.status(200).json({ success: true, message: 'Request sent!' }); }

        // =======================
        // 👤 PROFILE STATS
        // =======================
        if (type === 'profile_stats') {
            const [user] = await db.execute('SELECT username, email, phone, wallet_balance, created_at FROM users WHERE id = ?', [user_id]);
            const [stats] = await db.execute('SELECT COUNT(*) as total_matches, SUM(kills) as total_kills, SUM(prize_won) as total_winnings FROM participants WHERE user_id = ?', [user_id]);
            const [recent] = await db.execute('SELECT p.kills, p.rank, p.prize_won, t.title, t.schedule_time FROM participants p JOIN tournaments t ON p.tournament_id = t.id WHERE p.user_id = ? ORDER BY p.id DESC LIMIT 5', [user_id]);
            return res.status(200).json({ user: user[0], stats: stats[0], recent_matches: recent });
        }
        // =======================
        // 🔔 GET NOTIFICATIONS
        // =======================
        if (type === 'get_notifications') {
            const [notis] = await db.execute('SELECT * FROM notifications ORDER BY created_at DESC');
            return res.status(200).json(notis);
        }

        // =======================
        // 🏆 LEADERBOARD
        // =======================
        if (type === 'leaderboard') {
            const [earners] = await db.execute('SELECT u.username, COALESCE(SUM(p.prize_won), 0) as value FROM users u LEFT JOIN participants p ON u.id = p.user_id GROUP BY u.id ORDER BY value DESC LIMIT 10');
            const [killers] = await db.execute('SELECT u.username, COALESCE(SUM(p.kills), 0) as value FROM users u LEFT JOIN participants p ON u.id = p.user_id GROUP BY u.id ORDER BY value DESC LIMIT 10');
            const [depositors] = await db.execute('SELECT u.username, COALESCE(SUM(d.amount), 0) as value FROM users u LEFT JOIN deposits d ON u.id = d.user_id WHERE d.status = "approved" OR d.status IS NULL GROUP BY u.id ORDER BY value DESC LIMIT 10');
            return res.status(200).json({ earners, killers, depositors });
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
