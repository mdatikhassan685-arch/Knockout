const pool = require('../db');

module.exports = async (req, res) => {
    // CORS এবং মেথড চেক
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { email, password } = req.body;
        console.log("Login attempt for:", email); // লগে দেখার জন্য

        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length > 0) {
            const user = rows[0];
            // পাসওয়ার্ড চেক (সাধারণ টেক্সট)
            // আপনার ডেটাবেসে পাসওয়ার্ড যদি হ্যাশ করা থাকে, তাহলে এটি কাজ করবে না।
            // আপাতত আমরা শুধু ইউজার পাওয়া গেছে কিনা চেক করছি।
            res.status(200).json({ success: true, message: 'User found', user });
        } else {
            res.status(404).json({ success: false, message: 'User not found' });
        }
    } catch (error) {
        console.error("Database Error:", error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
};
