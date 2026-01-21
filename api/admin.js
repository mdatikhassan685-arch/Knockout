const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, match_id } = body;

    try {
        // ... (Other parts remain same like categories, match create/edit etc.) ...

        // ==========================================
        // 1. UPDATE STATS ONLY (NO MONEY)
        // ==========================================
        if (type === 'update_match_stats') {
            const { stats, is_solo } = body; 
            // stats = [{ name: 'PlayerName', kills: 5, rank: 1 }]

            for (let item of stats) {
                // Update Kills & Rank in DB
                let query = '';
                if (is_solo) {
                    query = 'UPDATE match_participants SET kills = ?, `rank` = ? WHERE match_id = ? AND game_name = ?';
                } else {
                    query = 'UPDATE match_participants SET kills = ?, `rank` = ? WHERE match_id = ? AND team_name = ?';
                }
                await db.execute(query, [item.kills, item.rank, match_id, item.name]);
            }
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // 2. GET CALCULATED PRIZE LIST (VIEW ONLY)
        // ==========================================
        if (type === 'get_prize_calcs') {
            const [match] = await db.execute('SELECT prize_pool, per_kill, match_type FROM matches WHERE id = ?', [match_id]);
            if(match.length === 0) return res.status(404).json({error: "Match not found"});
            
            const { prize_pool, per_kill, match_type } = match[0];
            const isSolo = (match_type === 'Solo');

            let rows = [];
            if(isSolo) {
                [rows] = await db.execute('SELECT game_name as name, kills, `rank` FROM match_participants WHERE match_id=?', [match_id]);
            } else {
                // Team: Sum kills, but rank should be same for team
                [rows] = await db.execute('SELECT team_name as name, MAX(`rank`) as `rank`, SUM(kills) as kills FROM match_participants WHERE match_id=? GROUP BY team_name', [match_id]);
            }

            // Calculate Prize Logic
            const calculatedList = rows.map(r => {
                let win = parseFloat(r.kills) * parseFloat(per_kill);
                // Simple Logic: Rank 1 gets the pool prize (As per your DB structure which has single prize_pool)
                if(parseInt(r.rank) === 1) {
                    win += parseFloat(prize_pool);
                }
                return { name: r.name, kills: r.kills, rank: r.rank, amount: win };
            }).filter(r => r.amount > 0); // Only show those who won something

            return res.status(200).json({ list: calculatedList });
        }

        // ==========================================
        // 3. DISTRIBUTE PRIZE (SEND MONEY)
        // ==========================================
        if (type === 'distribute_prizes') {
            const { prizes, is_solo } = body; 
            // prizes = [{ name: 'Name', amount: 100 }]
            
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                for (let item of prizes) {
                    const amount = parseFloat(item.amount);
                    if (amount <= 0) continue;

                    let uid = null;

                    if (is_solo) {
                        const [p] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND game_name=?', [match_id, item.name]);
                        if (p.length > 0) uid = p[0].user_id;
                    } else {
                        // Team Logic: Send to Leader (First member found or marked leader)
                        let [leader] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND team_name=? ORDER BY id ASC LIMIT 1', [match_id, item.name]);
                        if (leader.length > 0) uid = leader[0].user_id;
                    }

                    if (uid) {
                        // Add Balance
                        await connection.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?', [amount, uid]);
                        // Update Prize Won Column
                        if(is_solo) {
                            await connection.execute('UPDATE match_participants SET prize_won = prize_won + ? WHERE match_id=? AND user_id=?', [amount, match_id, uid]);
                        } else {
                            // Update prize for whole team records (for display) or just leader? Usually leader record tracks money.
                            await connection.execute('UPDATE match_participants SET prize_won = prize_won + ? WHERE match_id=? AND user_id=?', [amount, match_id, uid]);
                        }
                        // Log Transaction
                        await connection.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Win", ?, "completed", NOW())', 
                            [uid, amount, `Match #${match_id} Prize`]);
                    }
                }

                await connection.execute("UPDATE matches SET status='completed' WHERE id=?", [match_id]);
                await connection.commit();
                connection.release();
                return res.status(200).json({ success: true });

            } catch (err) {
                await connection.rollback();
                connection.release();
                throw err;
            }
        }

        // ... (Keep other admin functions like get_admin_matches, kick_participant etc.) ...
        // (Just ensure create_daily_match, edit_match etc are there from previous code)
        
        // REPEATING ESSENTIAL PARTS FOR CONTEXT (You should merge this with previous admin.js)
        if (type === 'get_admin_matches') {
             // ... existing code ...
             const [matches] = await db.execute(`SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`);
             return res.status(200).json(matches);
        }
        if (type === 'get_match_participants_for_result') {
             // ... existing code ...
             const [matchInfo] = await db.execute('SELECT match_type FROM matches WHERE id = ?', [match_id]);
             const matchType = matchInfo[0]?.match_type;
             if (matchType === 'Solo') {
                const [rows] = await db.execute(`SELECT game_name as name, kills, \`rank\` FROM match_participants WHERE match_id = ?`, [match_id]);
                return res.status(200).json({ type: 'Solo', data: rows });
             } else {
                const [rows] = await db.execute(`SELECT team_name as name, SUM(kills) as kills, MAX(\`rank\`) as \`rank\` FROM match_participants WHERE match_id = ? GROUP BY team_name`, [match_id]);
                return res.status(200).json({ type: 'Team', data: rows });
             }
        }
        // ...

        return res.status(400).json({ error: 'Unknown Type' });
    } catch (e) { return res.status(500).json({ error: e.message }); }
};
