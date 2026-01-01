const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, user_id, category_id, match_id, players, team_name } = req.body;

    try {
        // --- 1. Get Daily Matches ---
        if (type === 'get_daily_matches') {
            const [matches] = await db.execute(`
                SELECT m.*, 
                (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id) as joined_players,
                (SELECT COUNT(DISTINCT team_name) FROM match_participants mp WHERE mp.match_id = m.id AND mp.team_name != 'Solo') as joined_teams,
                (SELECT COUNT(*) FROM match_participants mp WHERE mp.match_id = m.id AND mp.user_id = ?) as is_joined
                FROM matches m WHERE m.category_id = ? ORDER BY m.match_time DESC
            `, [user_id, category_id]);
            return res.status(200).json(matches);
        }

        // --- 2. JOIN MATCH (Fixed) ---
        if (type === 'join_daily_match') {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                // Match Check
                const [mCheck] = await connection.execute('SELECT entry_fee, match_type FROM matches WHERE id = ? FOR UPDATE', [match_id]);
                if (mCheck.length === 0) throw new Error("Match not found");
                const match = mCheck[0];

                // Duplicate Check
                const [joined] = await connection.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
                if (joined.length > 0) throw new Error("Already Joined");

                // Fee Deduction
                const fee = parseFloat(match.entry_fee);
                const [u] = await connection.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
                if (parseFloat(u[0].wallet_balance) < fee) throw new Error("Insufficient Balance");

                if(fee > 0) {
                    await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [fee, user_id]);
                    await connection.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Match Fee", ?)', [user_id, fee, `Join Match #${match_id}`]);
                }

                // Insert All Players
                // যদি সোলো না হয়, তাহলে যে টিম নেম দিয়েছে সেটা সেভ হবে
                const tName = (match.match_type !== 'Solo' && team_name) ? team_name : 'Solo';

                for (let p of players) {
                    await connection.execute(
                        `INSERT INTO match_participants (match_id, user_id, game_name, game_uid, team_name, joined_at) VALUES (?, ?, ?, ?, ?, NOW())`,
                        [match_id, user_id, p.name, p.uid, tName]
                    );
                }

                await connection.commit();
                connection.release();
                return res.status(200).json({ success: true });

            } catch (err) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: err.message });
            }
        }

        // --- 3. GET PARTICIPANTS (TEAM FIX) ---
        if (type === 'get_daily_participants') {
            const [rows] = await db.execute(`
                SELECT game_name, team_name, game_uid, joined_at 
                FROM match_participants 
                WHERE match_id = ? 
                ORDER BY team_name, joined_at
            `, [match_id]);
            return res.status(200).json(rows);
        }

        // --- 4. ROOM DETAILS ---
        if (type === 'get_daily_room') {
            const [chk] = await db.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
            if(chk.length>0) {
                const [r] = await db.execute('SELECT room_id, room_pass FROM matches WHERE id=?', [match_id]);
                // শুধু যদি রুম আইডি থাকে তবে পাঠাবে
                if (r[0].room_id && r[0].room_id !== 'null' && r[0].room_id !== '') {
                    return res.status(200).json(r[0]);
                }
            }
            return res.json({}); // Empty object means no room yet
        }

        return res.status(400).json({ error: "Bad Request" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
