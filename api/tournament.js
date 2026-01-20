const db = require('../db');

module.exports = async (req, res) => {
    // Basic Config
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch(e){} }

    const { type, user_id, category_id, match_id, players, team_name } = body;

    try {
        // --- 1. GET DAILY MATCHES ---
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

        // --- 2. JOIN DAILY MATCH ---
        if (type === 'join_daily_match') {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                // A. Match Check
                const [mCheck] = await connection.execute('SELECT entry_fee, match_type, status, total_spots FROM matches WHERE id = ? FOR UPDATE', [match_id]);
                if (mCheck.length === 0) throw new Error("Match not found");
                const match = mCheck[0];

                // B. Status Check
                if (match.status !== 'open') throw new Error(`Match is ${match.status}. Cannot join.`);

                // C. Full Check
                let currentCount = 0;
                if (match.match_type === 'Solo') {
                    const [c] = await connection.execute('SELECT COUNT(*) as cnt FROM match_participants WHERE match_id = ?', [match_id]);
                    currentCount = c[0].cnt;
                } else {
                    const [c] = await connection.execute('SELECT COUNT(DISTINCT team_name) as cnt FROM match_participants WHERE match_id = ?', [match_id]);
                    currentCount = c[0].cnt;
                }
                if (currentCount >= match.total_spots) throw new Error("Match is Full! No slots available.");

                // D. Duplicate Check
                const [joined] = await connection.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
                if (joined.length > 0) throw new Error("You have already joined this match.");

                // E. Fee Deduction
                const fee = parseFloat(match.entry_fee);
                const [u] = await connection.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
                if (parseFloat(u[0].wallet_balance) < fee) throw new Error("Insufficient Balance.");

                if(fee > 0) {
                    await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [fee, user_id]);
                    await connection.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Match Fee", ?, "completed", NOW())', [user_id, fee, `Join Match #${match_id}`]);
                }

                // F. Insert Players
                const tName = (match.match_type !== 'Solo' && team_name) ? team_name : 'Solo';
                for (let p of players) {
                    await connection.execute(
                        `INSERT INTO match_participants (match_id, user_id, game_name, game_uid, game_level, team_name, joined_at) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                        [match_id, user_id, p.name, p.uid, p.level || 0, tName]
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

        // --- 3. GET ROOM INFO ---
        if (type === 'get_daily_room') {
            const [chk] = await db.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
            if(chk.length > 0) {
                const [r] = await db.execute('SELECT room_id, room_pass FROM matches WHERE id=?', [match_id]);
                if (r[0].room_id && r[0].room_id !== 'null' && r[0].room_id !== '') {
                    return res.status(200).json(r[0]);
                }
            }
            return res.json({});
        }

        // --- 4. GET PARTICIPANTS LIST (Updated with user_id) ---
        if (type === 'get_daily_participants') {
            // 🔥 FIX: Added user_id to select query for Admin Result Logic
            const [rows] = await db.execute(`SELECT user_id, game_name, team_name, game_uid, game_level, kills, prize_won, joined_at FROM match_participants WHERE match_id = ? ORDER BY team_name DESC, joined_at ASC`, [match_id]);
            return res.status(200).json(rows);
        }

        return res.status(400).json({ error: "Invalid Type" });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
