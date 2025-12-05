const db = require('../../db');
const bcrypt = require('bcryptjs');

export default async function handler(req, res) {
    // CORS হেডার যোগ করা (ব্রাউজার থেকে কল করার জন্য জরুরি)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;

    try {
        console.log("Login attempt for:", email); // লগে ইমেইল দেখাবে

        const [users] = await db.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            console.log("User not found");
            return res.status(401).json({ error: 'User not found' });
        }

        const user = users[0];
        console.log("User found:", user.username);

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            console.log("Password mismatch");
            return res.status(401).json({ error: 'Wrong password' });
        }

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            user: { id: user.id, username: user.username, role: user.role }
        });

    } catch (error) {
        console.error('FULL ERROR:', error); // পুরো এরর লগে দেখাবে
        return res.status(500).json({ error: error.message, stack: error.stack });
    }
}
