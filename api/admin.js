const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, match_id, category_id, user_id, id } = body;

    try {
        // --- ১. পার্টিসিপেন্ট লিস্ট (র‍্যাঙ্ক ও কিল ইনপুট দেওয়ার জন্য) ---
        if (type === 'get_match_participants_for_result') {
            const [match] = await db.execute('SELECT match_type FROM matches WHERE id = ?', [match_id]);
            if (match.length === 0) return res.status(404).json({ error: "Match not found" });

            const matchType = match[0].match_type;
            if (matchType === 'Solo') {
                const [rows] = await db.execute('SELECT user_id, game_name as name, kills, rank FROM match_participants WHERE match_id = ?', [match_id]);
                return res.status(200).json({ type: 'Solo', data: rows });
            } else {
                const [rows] = await db.execute('SELECT team_name as name, MAX(kills) as kills, MAX(rank) as rank FROM match_participants WHERE match_id = ? GROUP BY team_name', [match_id]);
                return res.status(200).json({ type: 'Team', data: rows });
            }
        }

        // --- ২. শুধুমাত্র স্কোর সেভ করা (টাকা যাবে না) ---
        if (type === 'update_match_results_only') {
            const { stats, is_solo } = body;
            for (let item of stats) {
                const query = is_solo 
                    ? 'UPDATE match_participants SET kills = ?, rank = ? WHERE match_id = ? AND game_name = ?'
                    : 'UPDATE match_participants SET kills = ?, rank = ? WHERE match_id = ? AND team_name = ?';
                await db.execute(query, [item.kills, item.rank, match_id, item.name]);
            }
            return res.status(200).json({ success: true });
        }

        // --- ৩. প্রাইজ ক্যালকুলেশন ডাটা (অটোমেটিক হিসাবের জন্য) ---
        if (type === 'get_prize_distribution_data') {
            const [match] = await db.execute('SELECT per_kill, prize_pool, winners_count, match_type FROM matches WHERE id = ?', [match_id]);
            const m = match[0];
            const perKillRate = parseFloat(m.per_kill || 0);
            
            let rows;
            if (m.match_type === 'Solo') {
                [rows] = await db.execute('SELECT game_name as name, kills, rank FROM match_participants WHERE match_id = ? ORDER BY rank ASC', [match_id]);
            } else {
                [rows] = await db.execute('SELECT team_name as name, MAX(kills) as kills, MAX(rank) as rank FROM match_participants WHERE match_id = ? GROUP BY team_name ORDER BY rank ASC', [match_id]);
            }

            const winners = rows.map(p => {
                let killMoney = p.kills * perKillRate;
                let rankPrize = 0;
                // ১ জন উইনার হলে ১০০%, ৩ জন হলে ৫০-৩০-২০ লজিক
                if (p.rank == 1) rankPrize = parseFloat(m.prize_pool);
                else if (p.rank == 2 && m.winners_count >= 2) rankPrize = m.prize_pool * 0.3;
                else if (p.rank == 3 && m.winners_count >= 3) rankPrize = m.prize_pool * 0.2;

                return { name: p.name, rank: p.rank || 0, kills: p.kills, kill_money: killMoney, rank_prize: rankPrize };
            });

            return res.status(200).json({ data: winners });
        }

        // --- ৪. ফাইনাল পেমেন্ট (অ্যাডমিনের সেট করা টাকা অনুযায়ী) ---
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
                        const [leader] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND team_name=? LIMIT 1', [match_id, item.name]);
                        if (leader.length > 0) uid = leader[0].user_id;
                    }

                    if (uid) {
                        await connection.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?', [amount, uid]);
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

        // --- ৫. অন্যান্য কমন ফাংশন (ক্যাটাগরি, ম্যাচ লিস্ট, ইউজার ম্যানেজ) ---
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }
        if (type === 'get_admin_matches') {
            const [rows] = await db.execute('SELECT * FROM matches ORDER BY id DESC');
            return res.status(200).json(rows);
        }
        if (type === 'create_daily_match') {
            await db.execute('INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots, winners_count, room_id, room_pass) VALUES (?, ?, ?, ?, ?, ?, ?, ?, "open", ?, ?, ?, ?)',
                [category_id, body.title, body.entry_fee, body.prize_pool, body.per_kill, body.match_type, body.match_time, body.map, body.total_spots, body.winners_count, body.room_id, body.room_pass]);
            return res.status(200).json({ success: true });
        }
        if (type === 'edit_match') {
            await db.execute('UPDATE matches SET title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=?, winners_count=?, room_id=?, room_pass=? WHERE id=?',
                [body.title, body.entry_fee, body.prize_pool, body.per_kill, body.match_type, body.match_time, body.map, body.total_spots, body.winners_count, body.room_id, body.room_pass, match_id]);
            return res.status(200).json({ success: true });
        }
        if (type === 'update_match_status') {
            await db.execute('UPDATE matches SET status=? WHERE id=?', [body.new_status, match_id]);
            return res.status(200).json({ success: true });
        }
        if (type === 'kick_participant') {
            const [p] = await db.execute(body.is_solo ? 'SELECT user_id FROM match_participants WHERE match_id=? AND game_name=?' : 'SELECT user_id FROM match_participants WHERE match_id=? AND team_name=?', [match_id, body.target_name]);
            const [m] = await db.execute('SELECT entry_fee FROM matches WHERE id=?', [match_id]);
            const fee = parseFloat(m[0].entry_fee);
            for(let row of p) {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?', [fee, row.user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Refund", "Kicked by Admin", "completed", NOW())', [row.user_id, fee]);
                await db.execute('DELETE FROM match_participants WHERE match_id=? AND user_id=?', [match_id, row.user_id]);
            }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid Type' });
    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
