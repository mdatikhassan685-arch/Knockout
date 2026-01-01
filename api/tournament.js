const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();
    
    // Body Parse Check (Vercel Fix)
    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch(e){}
    }

    const { type, user_id, category_id, match_id, players, team_name, game_name, game_uid } = body;

    // Safety check for empty request
    if (!type) return res.status(400).json({ error: 'Missing Type' });

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

        // --- 2. JOIN MATCH ---
        if (type === 'join_daily_match') {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                // Match Info
                const [mCheck] = await connection.execute('SELECT entry_fee, match_type FROM matches WHERE id = ? FOR UPDATE', [match_id]);
                if (mCheck.length === 0) throw new Error("Match not found");
                const match = mCheck[0];

                // Check Existing Join
                const [joined] = await connection.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
                if (joined.length > 0) throw new Error("Already Joined");

                // Check Balance
                const fee = parseFloat(match.entry_fee);
                const [u] = await connection.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
                if (parseFloat(u[0].wallet_balance) < fee) throw new Error("Insufficient Balance");

                // Deduct
                if(fee > 0) {
                    await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [fee, user_id]);
                    await connection.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Match Fee", ?)', [user_id, fee, `Join Match #${match_id}`]);
                }

                // Insert (Solo or Team)
                // If Team: `players` array exists. If Solo: single `game_name`
                
                const tName = (match.match_type !== 'Solo' && team_name) ? team_name : 'Solo';

                if (match.match_type !== 'Solo' && players && players.length > 0) {
                     for (let p of players) {
                        await connection.execute(
                            `INSERT INTO match_participants (match_id, user_id, game_name, game_uid, team_name, joined_at) VALUES (?, ?, ?, ?, ?, NOW())`,
                            [match_id, user_id, p.name, p.uid, tName]
                        );
                     }
                } else {
                     // Single Player Fallback
                     await connection.execute(
                        `INSERT INTO match_participants (match_id, user_id, game_name, game_uid, team_name, joined_at) VALUES (?, ?, ?, ?, ?, NOW())`,
                        [match_id, user_id, game_name, game_uid, 'Solo']
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

        // --- 3. GET ROOM INFO (Safe Check) ---
        if (type === 'get_daily_room') {
            if (!user_id || !match_id) return res.status(400).json({ error: "Missing ID" });

            // Check if user joined
            const [chk] = await db.execute('SELECT id FROM match_participants WHERE user_id = ? AND match_id = ?', [user_id, match_id]);
            
            if(chk.length > 0) {
                const [r] = await db.execute('SELECT room_id, room_pass FROM matches WHERE id=?', [match_id]);
                // If room details are null, send null, client handles text
                return res.status(200).json(r[0] || { room_id: null });
            }
            return res.status(403).json({ error: "Access Denied: Not Joined" });
        }

        // --- 4. PARTICIPANT LIST ---
        if (type === 'get_daily_participants') {
            const [rows] = await db.execute('SELECT game_name, team_name, kills, prize_won, game_uid FROM match_participants WHERE match_id = ? ORDER BY team_name, joined_at', [match_id]);
            return res.status(200).json(rows);
        }

        return res.status(400).json({ error: "Invalid Type" });

    } catch (e) {
        console.error("API ERROR:", e);
        return res.status(500).json({ error: e.message });
    }
};
