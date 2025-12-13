const db = require('../db');

module.exports = async (req, res) => {
    // CORS Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // ইনপুট ভেরিয়েবলগুলো গ্রহণ
    const { type, category_id, user_id, tournament_id, game_name, game_uid, game_level } = req.body;

    try {
        // ============================
        // 1. GET MATCHES
        // ============================
        if (type === 'get_matches') {
            const [matches] = await db.execute(`
                SELECT t.*, 
                (SELECT COUNT(*) FROM participants p WHERE p.tournament_id = t.id) as joined_count,
                (SELECT COUNT(*) FROM participants p WHERE p.tournament_id = t.id AND p.user_id = ?) as is_joined
                FROM tournaments t 
                WHERE t.category_id = ? 
                ORDER BY t.schedule_time DESC
            `, [user_id, category_id]);

            return res.status(200).json(matches);
        }

        // ============================
        // 2. JOIN MATCH (Fixed for your DB)
        // ============================
        if (type === 'join_match') {
            if (!game_name || !game_uid || !game_level) {
                return res.status(400).json({ error: 'All fields are required!' });
            }

            if (parseInt(game_level) < 40) {
                return res.status(400).json({ error: 'Minimum Level 40 required!' });
            }

            const [matchData] = await db.execute('SELECT entry_fee, total_spots FROM tournaments WHERE id = ?', [tournament_id]);
            if (matchData.length === 0) return res.status(404).json({ error: 'Match not found' });

            const [userData] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [checkJoin] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);
            const [countJoin] = await db.execute('SELECT COUNT(*) as c FROM participants WHERE tournament_id = ?', [tournament_id]);

            const match = matchData[0];
            const user = userData[0];

            if (checkJoin.length > 0) return res.status(400).json({ error: 'Already Joined!' });
            if (countJoin[0].c >= match.total_spots) return res.status(400).json({ error: 'Match is Full!' });
            if (parseFloat(user.wallet_balance) < parseFloat(match.entry_fee)) return res.status(400).json({ error: 'Insufficient Balance!' });

            // ১. ব্যালেন্স কাটা
            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [match.entry_fee, user_id]);
            
            // ২. ডাটাবেসে ইনসার্ট (আপনার স্ক্রিনশট অনুযায়ী কলাম নাম ঠিক করা হয়েছে)
            // in_game_name, in_game_uid, joined_at ব্যবহার করা হলো
            await db.execute(
                'INSERT INTO participants (user_id, tournament_id, in_game_name, in_game_uid, game_level, joined_at) VALUES (?, ?, ?, ?, ?, NOW())', 
                [user_id, tournament_id, game_name, game_uid, game_level]
            );
            
            // ৩. ট্রানজ্যাকশন লগ
            await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Match Join", NOW())', [user_id, match.entry_fee]);

            return res.status(200).json({ success: true, message: 'Joined Successfully' });
        }

        // ============================
        // 3. GET ROOM
        // ============================
        if (type === 'get_room') {
            const [check] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);
            
            if (check.length > 0) {
                const [room] = await db.execute('SELECT room_id, room_pass FROM tournaments WHERE id = ?', [tournament_id]);
                return res.status(200).json(room[0]);
            } else {
                return res.status(403).json({ error: 'Not joined' });
            }
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
