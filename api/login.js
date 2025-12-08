const pool = require('../db');

module.exports = async (req, res) => {
    // CORS Headers...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { email, password } = req.body;

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];

            // ১. ব্লক চেক
            if (user.status === 'blocked') {
                return res.status(403).json({ error: 'Your account is permanently BLOCKED.' });
            }

            // ২. সাসপেনশন চেক (Auto Reactivate Logic)
            if (user.status === 'suspended') {
                const now = new Date();
                const suspendDate = new Date(user.suspended_until);

                if (suspendDate > now) {
                    // এখনো সময় বাকি আছে
                    return res.status(403).json({ 
                        error: `Account Suspended until ${suspendDate.toLocaleString()}` 
                    });
                } else {
                    // সময় শেষ, অটোমেটিক অ্যাক্টিভ করা হচ্ছে
                    await pool.execute('UPDATE users SET status = "active", suspended_until = NULL WHERE id = ?', [user.id]);
                    user.status = 'active'; // লোকাল অবজেক্ট আপডেট
                }
            }

            // ৩. পাসওয়ার্ড চেক
            if (user.password === password) {
                return res.status(200).json({
                    success: true,
                    message: 'Login successful',
                    user: {
                        id: user.id,
                        username: user.username,
                        email: user.email,
                        role: user.role,
                        balance: user.wallet_balance
                    }
                });
            } else {
                return res.status(401).json({ error: 'Invalid password' });
            }
        } else {
            return res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
