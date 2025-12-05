const pool = require('../db');

export default async function handler(req, res) {
    // CORS হেডার সেট করা (যাতে সব জায়গা থেকে রিকোয়েস্ট করা যায়)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // প্রিফ্লাইট রিকোয়েস্ট হ্যান্ডেল করা
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // মেথড চেক
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    const { email, password } = req.body;

    // ইনপুট ভ্যালিডেশন
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        // ডেটাবেস কুয়েরি
        console.log("Attempting login for:", email);
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];

            // পাসওয়ার্ড চেক (সরাসরি তুলনা - আপাতত)
            // পরে আমরা bcrypt যোগ করব
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
                return res.status(401).json({ success: false, message: 'Invalid password' });
            }
        } else {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

    } catch (error) {
        console.error("Database Error:", error);
        return res.status(500).json({
            success: false,
            error: 'Database connection failed',
            details: error.message
        });
    }
}
