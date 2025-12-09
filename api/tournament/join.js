const pool = require('../../db');

module.exports = async (req, res) => {
    // CORS & Method Check...
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { userId, tournamentId, gameName, gameUid } = req.body;

    if (!userId || !tournamentId || !gameName || !gameUid) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // ১. টুর্নামেন্ট ইনফো আনা
        const [t] = await connection.execute('SELECT entry_fee, status, max_teams FROM tournaments WHERE id = ?', [tournamentId]);
        const tournament = t[0];

        if (!tournament || tournament.status !== 'open') throw new Error('Tournament closed');

        // ২. স্লট চেক
        const [p] = await connection.execute('SELECT COUNT(*) as count FROM participants WHERE tournament_id = ?', [tournamentId]);
        if (p[0].count >= tournament.max_teams) throw new Error('Slots Full');

        // ৩. ব্যালেন্স চেক
        const [u] = await connection.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]);
        if (u[0].wallet_balance < tournament.entry_fee) throw new Error('Insufficient Balance');

        // ৪. টাকা কাটা
        if (tournament.entry_fee > 0) {
            await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [tournament.entry_fee, userId]);
            await connection.execute('INSERT INTO transactions (user_id, amount, type, details) VALUES (?, ?, "Entry Fee", ?)', [userId, -tournament.entry_fee, `Joined Match #${tournamentId}`]);
        }

        // ৫. জয়েন করানো
        await connection.execute('INSERT INTO participants (user_id, tournament_id, in_game_name, in_game_uid) VALUES (?, ?, ?, ?)', [userId, tournamentId, gameName, gameUid]);

        await connection.commit();
        res.json({ success: true, message: 'Joined Successfully!' });

    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: error.message });
    } finally {
        connection.release();
    }
};
