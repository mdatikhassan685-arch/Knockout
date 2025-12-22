const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Cache Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, user_id, category_id, match_id, game_name, game_uid } = req.body;

    try {
        // ============================
        // 🔥 DAILY MATCH LOGIC
        // ============================

        // 1. Get Daily Matches List
        if (type === 'get_daily_matches') {
            const [matches] = await db.execute(`
                SELECT m.*, 
                (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id) as joined_count,
                (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id AND mp.user_id = ?) as is_joined
                FROM matches m 
                WHERE m.category_id = ? 
                ORDER BY m.match_time DESC
            `, [user_id, category_id]);
            
            return res.status(200).json(matches);
        }

        // 2. Join Daily Match
        if (type === 'join_daily_match') {
            const connection = await db.getConnection(); // Transaction for safety

            try {
                await connection.beginTransaction();

                // Check Match Exists
                const [matchData] = await connection.execute('SELECT entry_fee, match_type FROM matches WHERE id = ? FOR UPDATE', [match_id]);
                if (matchData.length === 0) throw new Error('Match not found');
                const match = matchData[0];

                // Check Already Joined
                const [joined] = await connection.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
                if (joined.length > 0) throw new Error('Already Joined!');

                // Check Balance
                const [userData] = await connection.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
                const fee = parseFloat(match.entry_fee);
                
                if (parseFloat(userData[0].wallet_balance) < fee) throw new Error('Insufficient Balance');

                // Deduct Balance
                if (fee > 0) {
                    await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [fee, user_id]);
                    await connection.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Match Fee", ?)', [user_id, fee, `Join Match #${match_id}`]);
                }

                // Add Participant
                await connection.execute(
                    `INSERT INTO match_participants (match_id, user_id, game_name, game_uid, joined_at) VALUES (?, ?, ?, ?, NOW())`,
                    [match_id, user_id, game_name, game_uid]
                );

                await connection.commit();
                connection.release();
                return res.status(200).json({ success: true, message: 'Joined Successfully!' });

            } catch (err) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: err.message });
            }
        }

        // 3. Get Room Details (Daily)
        if (type === 'get_daily_room') {
            const [check] = await db.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
            if (check.length > 0) {
                const [room] = await db.execute('SELECT room_id, room_pass FROM matches WHERE id = ?', [match_id]);
                return res.status(200).json(room[0]);
            } else {
                return res.status(403).json({ error: 'Access Denied' });
            }
        }

        // 4. Get Daily Participants (For Player List / Result)
        if (type === 'get_daily_participants') {
            const [rows] = await db.execute('SELECT game_name, kills, prize_won FROM match_participants WHERE match_id = ? ORDER BY prize_won DESC, kills DESC', [match_id]);
            return res.status(200).json(rows);
        }

        // ============================
        // 🏆 OFFICIAL TOURNAMENT LOGIC (PLACEHOLDER FOR NOW)
        // ============================
        // আমরা পরবর্তী ধাপে অফিসিয়াল টুর্নামেন্ট নিয়ে কাজ করব।
        
        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (error) {
        console.error("Tournament API Error:", error);
        return res.status(500).json({ error: 'Server Error' });
    }
};
