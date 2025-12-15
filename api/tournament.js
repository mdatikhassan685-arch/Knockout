const db = require('../db');

module.exports = async (req, res) => {
    // 1. Headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, category_id, user_id, tournament_id, team_name, players } = req.body;

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
        // 2. JOIN MATCH (SOLO / DUO / SQUAD FIX)
        // ============================
        if (type === 'join_match') {
            // ১. প্লেয়ার ডাটা চেক
            if (!players || !Array.isArray(players) || players.length === 0) {
                return res.status(400).json({ error: 'Player details required!' });
            }

            // ২. লুপ চালিয়ে প্রতিটি প্লেয়ারের তথ্য চেক
            for (let i = 0; i < players.length; i++) {
                const p = players[i];
                if (!p.name || !p.uid || !p.level) {
                    return res.status(400).json({ error: `Details missing for Player ${i+1}` });
                }
                if (parseInt(p.level) < 40) {
                    return res.status(400).json({ error: `Player ${i+1} (${p.name}) needs Level 40+` });
                }
            }

            // ৩. ম্যাচ ডাটা আনা
            const [matchData] = await db.execute('SELECT entry_fee, total_spots, match_type FROM tournaments WHERE id = ?', [tournament_id]);
            if (matchData.length === 0) return res.status(404).json({ error: 'Match not found' });
            const match = matchData[0];

            // ৪. Duo/Squad হলে Team Name চেক
            if (match.match_type !== 'Solo' && !team_name) {
                return res.status(400).json({ error: 'Team Name is required for Duo/Squad!' });
            }

            // ৫. ব্যালেন্স এবং সিট চেক
            const [userData] = await db.execute('SELECT wallet_balance FROM users WHERE id = ?', [user_id]);
            const [checkJoin] = await db.execute('SELECT id FROM participants WHERE user_id = ? AND tournament_id = ?', [user_id, tournament_id]);
            const [countJoin] = await db.execute('SELECT COUNT(*) as c FROM participants WHERE tournament_id = ?', [tournament_id]);

            if (checkJoin.length > 0) return res.status(400).json({ error: 'Already Joined!' });
            if (countJoin[0].c >= match.total_spots) return res.status(400).json({ error: 'Match is Full!' });
            
            const fee = parseFloat(match.entry_fee);
            if (parseFloat(userData[0].wallet_balance) < fee) {
                return res.status(400).json({ error: 'Insufficient Balance!' });
            }

            // ৬. ডাটা প্রস্তুত করা
            // প্রথম প্লেয়ার (লিডার) এর নাম মেইন কলামে যাবে
            const leader = players[0];
            // বাকি প্লেয়ারদের তথ্য JSON হিসেবে text কলামে যাবে
            const otherPlayers = players.slice(1); 
            const teamMembersStr = JSON.stringify(otherPlayers);
            
            // সোলো হলে টিম নেম হবে ইউজারের নাম, না হলে ইনপুট দেওয়া টিম নেম
            const finalTeamName = match.match_type === 'Solo' ? leader.name : team_name;

            // ৭. ডাটাবেসে সেভ করা
            await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [fee, user_id]);
            
            await db.execute(
                `INSERT INTO participants 
                (user_id, tournament_id, in_game_name, in_game_uid, game_level, team_name, team_members, joined_at) 
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`, 
                [user_id, tournament_id, leader.name, leader.uid, leader.level, finalTeamName, teamMembersStr]
            );
            
            if(fee > 0) {
                await db.execute('INSERT INTO transactions (user_id, amount, type, created_at) VALUES (?, ?, "Match Join", NOW())', [user_id, fee]);
            }

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
            } else { return res.status(403).json({ error: 'Not joined' }); }
        }

        // ============================
        // 4. GET PLAYERS LIST
        // ============================
        if (type === 'get_result_board') {
            // এখানে team_name সহ সিলেক্ট করা হলো
            const [results] = await db.execute(`
                SELECT in_game_name, in_game_uid, game_level, team_name, kills, \`rank\`, prize_won 
                FROM participants 
                WHERE tournament_id = ? 
                ORDER BY \`rank\` ASC, kills DESC
            `, [req.body.tournament_id]);
            return res.status(200).json(results);
        }

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: error.message });
    }
};
