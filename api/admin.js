const db = require('../db');

module.exports = async (req, res) => {
    // CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, match_id } = body;

    try {
        // --- MATCH MANAGEMENT ---

        // 1. Create Match (New Field: winners_count added)
        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots, winners_count, room_id, room_pass) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?)`,
                [body.category_id, body.title, body.entry_fee||0, body.prize_pool||0, body.per_kill||0, body.match_type, body.match_time, body.map, body.total_spots||48, body.winners_count||1, body.room_id||null, body.room_pass||null]
            );
            return res.status(200).json({ success: true });
        }

        // 2. Edit Match
        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=?, winners_count=?, room_id=?, room_pass=? WHERE id=?`, 
                [body.title, body.entry_fee, body.prize_pool, body.per_kill, body.match_type, body.match_time, body.map, body.total_spots, body.winners_count||1, body.room_id, body.room_pass, match_id]
            );
            return res.status(200).json({ success: true });
        }

        // 3. DELETE MATCH FIX (Foreign Key Constraint Handle)
        if (type === 'delete_match') {
            const id = body.id;
            // প্রথমে চাইল্ড টেবিল থেকে ডাটা ডিলিট করতে হবে
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
            // তারপর মেইন টেবিল থেকে ডিলিট
            await db.execute('DELETE FROM matches WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // --- RESULT & PRIZE LOGIC ---

        // 4. Update ONLY Results (Rank & Kills) - No Money
        if (type === 'update_match_results_only') {
            const { stats, is_solo } = body; 
            for (let item of stats) {
                const query = is_solo 
                    ? 'UPDATE match_participants SET kills = ?, rank = ? WHERE match_id = ? AND game_name = ?'
                    : 'UPDATE match_participants SET kills = ?, rank = ? WHERE match_id = ? AND team_name = ?';
                
                // Rank 0 means unranked or didn't place
                await db.execute(query, [item.kills, item.rank || 0, match_id, item.name]);
            }
            return res.status(200).json({ success: true });
        }

        // 5. Get Data for Prize Distribution (With Auto Calc)
        if (type === 'get_prize_distribution_data') {
            const [match] = await db.execute('SELECT per_kill, prize_pool, winners_count, match_type FROM matches WHERE id = ?', [match_id]);
            if (match.length === 0) return res.status(404).json({ error: "Match not found" });
            
            const m = match[0];
            const isSolo = m.match_type === 'Solo';
            const perKillRate = parseFloat(m.per_kill);
            
            // Get Participants with Saved Rank & Kills
            let rows;
            if (isSolo) {
                [rows] = await db.execute(`SELECT game_name as name, kills, rank FROM match_participants WHERE match_id = ? ORDER BY rank ASC`, [match_id]);
            } else {
                [rows] = await db.execute(`SELECT team_name as name, MAX(kills) as kills, MAX(rank) as rank FROM match_participants WHERE match_id = ? GROUP BY team_name ORDER BY rank ASC`, [match_id]);
            }

            // Calculate Suggested Amounts
            const winners = [];
            const others = [];

            // Rank 0 means 'Not Set', Rank 999 or high means 'Lost'
            rows.forEach(p => {
                let killMoney = p.kills * perKillRate;
                let rankPrize = 0;

                // Logic: Only Top X get prize pool share suggestion
                // (Admin can override this in frontend, but we give a default suggestion)
                if (p.rank > 0 && p.rank <= m.winners_count) {
                    // Simple Logic: If 1 winner, they get full pool. If 2, split 60/40 or equal? 
                    // For now, we put full pool in rank 1, admin distributes manually for others if split needed.
                    if (p.rank === 1) rankPrize = parseFloat(m.prize_pool);
                }

                winners.push({
                    name: p.name,
                    rank: p.rank,
                    kills: p.kills,
                    kill_money: killMoney,
                    rank_prize: rankPrize,
                    total: killMoney + rankPrize
                });
            });

            // Sort by Rank (1, 2, 3...) then others (0)
            winners.sort((a, b) => {
                if (a.rank === 0) return 1;
                if (b.rank === 0) return -1;
                return a.rank - b.rank;
            });

            return res.status(200).json({ winners_count: m.winners_count, data: winners });
        }

        // 6. Send Money (Final Step)
        if (type === 'distribute_prizes_final') {
            const { prizes, is_solo } = body; 
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                for (let item of prizes) {
                    const amount = parseFloat(item.amount);
                    if (amount <= 0) continue;

                    let uid;
                    if (is_solo) {
                        const [p] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND game_name=?', [match_id, item.name]);
                        if (p.length > 0) uid = p[0].user_id;
                    } else {
                        // Team: Leader Only
                        let [leader] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND team_name=? AND is_leader=1 LIMIT 1', [match_id, item.name]);
                        if (leader.length === 0) {
                            [leader] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND team_name=? ORDER BY id ASC LIMIT 1', [match_id, item.name]);
                        }
                        if (leader.length > 0) uid = leader[0].user_id;
                    }

                    if (uid) {
                        await connection.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?', [amount, uid]);
                        await connection.execute('UPDATE match_participants SET prize_won = prize_won + ? WHERE match_id=? AND user_id=?', [amount, match_id, uid]);
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

        // ... Other existing functions (kick, update status, etc.) ...
        
        return res.status(400).json({ error: 'Invalid Type' });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
