const db = require('../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, user_id, tournament_id, category_id, team_name, players, tour_id, stage_id, match_id, title, map, time, room_id, room_pass, status, team_ids, target_group, next_stage_id } = body;

    try {
        // ... (Previous Admin & Match Logic - Keep same) ...
        // (আমি পুরো কোড রিপিট করছি না, শুধু নতুন অংশ নিচে দিচ্ছি। আপনি চাইলে পুরো ফাইল আবার দেব?)
        
        // ⚠️ ভালো হবে আমি পুরো ফাইলটাই আবার দিই যাতে কোনো কনফিউশন না থাকে।

        /* ============================================================
           🔧 ADMIN: TOURNAMENT MANAGEMENT
        ============================================================ */
        if (type === 'get_admin_tournaments') {
            const [rows] = await db.execute('SELECT * FROM tournaments WHERE category_id = ? ORDER BY schedule_time DESC', [category_id]);
            return res.status(200).json(rows);
        }

        if (type === 'create_tournament') {
            const [result] = await db.execute(
                `INSERT INTO tournaments (category_id, title, entry_fee, winning_prize, total_spots, schedule_time, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [category_id, body.title, body.entry_fee, body.winning_prize, body.total_spots, body.schedule_time]
            );
            const newTourId = result.insertId;
            if (body.stages) {
                const stageList = body.stages.split(',').map(s => s.trim());
                for (let i = 0; i < stageList.length; i++) {
                    await db.execute(`INSERT INTO tournament_stages (tournament_id, stage_name, stage_order, status) VALUES (?, ?, ?, 'upcoming')`, [newTourId, stageList[i], i + 1]);
                }
            }
            return res.status(200).json({ success: true });
        }

        /* ============================================================
           🎮 ADMIN: STAGE & MATCH MANAGEMENT
        ============================================================ */
        if (type === 'get_stages_and_matches') {
            const [stages] = await db.execute('SELECT * FROM tournament_stages WHERE tournament_id = ? ORDER BY stage_order ASC', [tournament_id]);
            for (let stage of stages) {
                const [matches] = await db.execute('SELECT * FROM stage_matches WHERE stage_id = ? ORDER BY schedule_time ASC', [stage.id]);
                stage.matches = matches;
            }
            return res.status(200).json(stages);
        }

        if (type === 'create_stage_match') {
            await db.execute(`INSERT INTO stage_matches (stage_id, match_title, map_name, schedule_time, status) VALUES (?, ?, ?, ?, 'upcoming')`, [stage_id, title, map, time]);
            return res.status(200).json({ success: true });
        }

        if (type === 'update_stage_room') {
            await db.execute(`UPDATE stage_matches SET room_id=?, room_pass=?, status=? WHERE id=?`, [room_id, room_pass, status, match_id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_stage_match') {
            await db.execute('DELETE FROM stage_matches WHERE id=?', [match_id]);
            return res.status(200).json({ success: true });
        }

        /* ============================================================
           👥 ADMIN: TEAM & GROUP MANAGEMENT (NEW 🔥)
        ============================================================ */
        
        // 1. Get Teams for a specific Stage (From stage_standings or participants if first stage)
        if (type === 'get_stage_teams') {
            // First check if teams exist in stage_standings for this stage
            let [teams] = await db.execute('SELECT * FROM stage_standings WHERE stage_id = ? ORDER BY total_points DESC', [stage_id]);
            
            // If empty (First Stage), fetch from participants and insert into stage_standings
            if (teams.length === 0) {
                // Check if it is the first stage
                const [stageInfo] = await db.execute('SELECT tournament_id, stage_order FROM tournament_stages WHERE id=?', [stage_id]);
                if(stageInfo.length > 0 && stageInfo[0].stage_order === 1) {
                    const [allParticipants] = await db.execute('SELECT team_name FROM participants WHERE tournament_id=?', [stageInfo[0].tournament_id]);
                    
                    for(let p of allParticipants) {
                        await db.execute('INSERT INTO stage_standings (tournament_id, stage_id, team_name) VALUES (?, ?, ?)', [stageInfo[0].tournament_id, stage_id, p.team_name]);
                    }
                    // Fetch again
                    [teams] = await db.execute('SELECT * FROM stage_standings WHERE stage_id = ?', [stage_id]);
                }
            }
            return res.status(200).json(teams);
        }

        // 2. Assign Group
        if (type === 'assign_group') {
            // team_ids is an array [1, 2, 5]
            for(let tid of team_ids) {
                await db.execute('UPDATE stage_standings SET group_name = ? WHERE id = ?', [target_group, tid]);
            }
            return res.status(200).json({ success: true });
        }
              // --- 🤖 ADD TEST TEAMS (FOR TESTING) ---
        if (type === 'add_test_teams') {
            const count = body.count || 10;
            const prefixes = ["Dark", "Red", "Blue", "Team", "Pro", "BD", "Royal", "King", "Elite", "Max"];
            const suffixes = ["Warriors", "Snipers", "Esports", "Gaming", "Squad", "Killers", "Legends", "Hunters", "Army", "Boys"];

            for (let i = 0; i < count; i++) {
                // 1. Generate Fake User
                const username = "BotUser_" + Math.floor(Math.random() * 10000);
                const email = `bot${Date.now()}_${i}@test.com`;
                const [uRes] = await db.execute(
                    `INSERT INTO users (username, email, password, phone, role, status) 
                     VALUES (?, ?, 'botpass', '0000000000', 'bot', 'active')`,
                    [username, email]
                );
                const botUserId = uRes.insertId;

                // 2. Generate Random Team Name
                const teamName = prefixes[Math.floor(Math.random() * prefixes.length)] + " " + suffixes[Math.floor(Math.random() * suffixes.length)] + " " + Math.floor(Math.random() * 100);
                
                // 3. Generate Fake Players
                const members = `Player1_${i}, Player2_${i}, Player3_${i}, Player4_${i}`;

                // 4. Register Team directly into Participants
                await db.execute(
                    `INSERT INTO participants (user_id, tournament_id, team_name, team_members, kills, prize_won, joined_at, \`rank\`) 
                     VALUES (?, ?, ?, ?, 0, 0, NOW(), 0)`,
                    [botUserId, tournament_id, teamName, members]
                );
            }
            return res.status(200).json({ success: true, message: `${count} Test Teams Added!` });
                     }

        // 3. Promote Teams to Next Stage
        if (type === 'promote_teams') {
            // Logic: Copy selected teams from current stage_standings to new stage_standings with 0 points
            const [currentTeams] = await db.execute(`SELECT team_name, tournament_id FROM stage_standings WHERE id IN (${team_ids.join(',')})`);
            
            for(let team of currentTeams) {
                // Check duplicate in target stage
                const [dup] = await db.execute('SELECT id FROM stage_standings WHERE stage_id=? AND team_name=?', [next_stage_id, team.team_name]);
                if(dup.length === 0) {
                    await db.execute('INSERT INTO stage_standings (tournament_id, stage_id, team_name, group_name) VALUES (?, ?, ?, "A")', 
                        [team.tournament_id, next_stage_id, team.team_name]);
                }
            }
            return res.status(200).json({ success: true });
        }

        /* ============================================================
           👤 USER ACTIONS
        ============================================================ */
        if (type === 'get_official_details') {
            const [rows] = await db.execute('SELECT * FROM tournaments WHERE id = ?', [tournament_id]);
            if(rows.length === 0) return res.status(404).json({ error: 'Not Found' });
            let isReg = false;
            if(user_id) {
                const [chk] = await db.execute('SELECT id FROM participants WHERE tournament_id=? AND user_id=?', [tournament_id, user_id]);
                if(chk.length > 0) isReg = true;
            }
            return res.status(200).json({ data: rows[0], is_registered: isReg });
        }

        if (type === 'register_official_team') {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                const [tour] = await connection.execute('SELECT entry_fee, total_spots FROM tournaments WHERE id = ?', [tournament_id]);
                if (tour.length === 0) throw new Error("Invalid");
                const [count] = await connection.execute('SELECT COUNT(*) as c FROM participants WHERE tournament_id=?', [tournament_id]);
                if (count[0].c >= tour[0].total_spots) throw new Error("Full");
                const [dup] = await connection.execute('SELECT id FROM participants WHERE tournament_id=? AND user_id=?', [tournament_id, user_id]);
                if (dup.length > 0) throw new Error("Registered");
                const fee = parseFloat(tour[0].entry_fee);
                const [u] = await connection.execute('SELECT wallet_balance FROM users WHERE id=?', [user_id]);
                if (parseFloat(u[0].wallet_balance) < fee) throw new Error("Low Balance");
                if (fee > 0) {
                    await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id=?', [fee, user_id]);
                    await connection.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Tournament Fee", ?, "completed", NOW())', [user_id, fee, `Reg: ${team_name}`]);
                }
                const memberString = players.join(', '); 
                await connection.execute(`INSERT INTO participants (user_id, tournament_id, team_name, team_members, kills, prize_won, joined_at, \`rank\`) VALUES (?, ?, ?, ?, 0, 0, NOW(), 0)`, [user_id, tournament_id, team_name, memberString]);
                await connection.commit();
                connection.release();
                return res.status(200).json({ success: true });
            } catch(e) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: e.message });
            }
        }

        if (type === 'get_official_standings') {
            // Fetch from participants or stage_standings? Default to participants for overall
            const [rows] = await db.execute(`SELECT id, team_name, kills, \`rank\` as total_points FROM participants WHERE tournament_id = ? ORDER BY \`rank\` DESC, kills DESC`, [tournament_id]);
            return res.status(200).json(rows);
        }

        return res.status(400).json({ error: "Invalid Type" });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
