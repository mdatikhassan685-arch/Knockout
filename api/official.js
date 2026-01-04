const db = require('../db');

module.exports = async (req, res) => {
    // Basic Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, user_id, tournament_id, category_id, team_name, players, tour_id, stage_id, match_id, title, map, time, room_id, room_pass, status, team_ids, target_group, next_stage_id, points_to_add, kills_to_add, team_id } = body;

    try {
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

            // Auto-Create Stages
            if (body.stages) {
                const stageList = body.stages.split(',').map(s => s.trim());
                for (let i = 0; i < stageList.length; i++) {
                    await db.execute(
                        `INSERT INTO tournament_stages (tournament_id, stage_name, stage_order, status) 
                         VALUES (?, ?, ?, 'upcoming')`,
                        [newTourId, stageList[i], i + 1]
                    );
                }
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'edit_tournament') {
            await db.execute(
                `UPDATE tournaments SET title=?, entry_fee=?, winning_prize=?, total_spots=?, schedule_time=? WHERE id=?`,
                [body.title, body.entry_fee, body.winning_prize, body.total_spots, body.schedule_time, tour_id]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_tournament') {
            await db.execute('DELETE FROM tournaments WHERE id = ?', [tour_id]);
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
            await db.execute(
                `INSERT INTO stage_matches (stage_id, match_title, map_name, schedule_time, status) 
                 VALUES (?, ?, ?, ?, 'upcoming')`,
                [stage_id, title, map, time]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'update_stage_room') {
            await db.execute(
                `UPDATE stage_matches SET room_id=?, room_pass=?, status=? WHERE id=?`,
                [room_id, room_pass, status, match_id]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_stage_match') {
            await db.execute('DELETE FROM stage_matches WHERE id=?', [match_id]);
            return res.status(200).json({ success: true });
        }

        /* ============================================================
           👥 ADMIN: TEAM & GROUP MANAGEMENT
        ============================================================ */
        
        if (type === 'get_stage_teams') {
            // Check stage_standings first
            let [teams] = await db.execute('SELECT * FROM stage_standings WHERE stage_id = ? ORDER BY total_points DESC', [stage_id]);
            
            // If empty (First Stage), fetch from participants and seed
            if (teams.length === 0) {
                const [stageInfo] = await db.execute('SELECT tournament_id, stage_order FROM tournament_stages WHERE id=?', [stage_id]);
                if(stageInfo.length > 0 && stageInfo[0].stage_order === 1) {
                    const [allParticipants] = await db.execute('SELECT team_name FROM participants WHERE tournament_id=?', [stageInfo[0].tournament_id]);
                    for(let p of allParticipants) {
                        await db.execute('INSERT INTO stage_standings (tournament_id, stage_id, team_name) VALUES (?, ?, ?)', [stageInfo[0].tournament_id, stage_id, p.team_name]);
                    }
                    [teams] = await db.execute('SELECT * FROM stage_standings WHERE stage_id = ?', [stage_id]);
                }
            }
            return res.status(200).json(teams);
        }

        if (type === 'assign_group') {
            for(let tid of team_ids) {
                await db.execute('UPDATE stage_standings SET group_name = ? WHERE id = ?', [target_group, tid]);
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'promote_teams') {
            const [currentTeams] = await db.execute(`SELECT team_name, tournament_id FROM stage_standings WHERE id IN (${team_ids.join(',')})`);
            for(let team of currentTeams) {
                const [dup] = await db.execute('SELECT id FROM stage_standings WHERE stage_id=? AND team_name=?', [next_stage_id, team.team_name]);
                if(dup.length === 0) {
                    await db.execute('INSERT INTO stage_standings (tournament_id, stage_id, team_name, group_name) VALUES (?, ?, ?, "A")', 
                        [team.tournament_id, next_stage_id, team.team_name]);
                }
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'admin_update_points') {
            await db.execute(`
                UPDATE stage_standings 
                SET kills = kills + ?, 
                    position_points = position_points + ?,
                    total_points = total_points + ? + ? 
                WHERE id = ?`, 
                [kills_to_add, points_to_add, kills_to_add, points_to_add, team_id]
            );
            return res.status(200).json({ success: true });
        }

        // --- 🤖 ADD TEST TEAMS (BOTS) ---
        if (type === 'add_test_teams') {
            const count = parseInt(body.count) || 10;
            const prefixes = ["Dark", "Red", "Blue", "Team", "Pro", "BD", "Royal", "King", "Elite", "Max"];
            const suffixes = ["Warriors", "Snipers", "Esports", "Gaming", "Squad", "Killers", "Legends", "Hunters", "Army", "Boys"];

            for (let i = 0; i < count; i++) {
                // 1. Generate Fake User
                const username = "Bot_" + Math.floor(Math.random() * 100000);
                const email = `bot${Date.now()}_${i}@test.local`;
                const [uRes] = await db.execute(
                    `INSERT INTO users (username, email, password, phone, role, status, wallet_balance, created_at) 
                     VALUES (?, ?, '$2a$10$FakeHashForBot123456', '0000000000', 'bot', 'active', 0, NOW())`,
                    [username, email]
                );
                const botUserId = uRes.insertId;

                // 2. Generate Team
                const teamName = prefixes[Math.floor(Math.random() * prefixes.length)] + " " + suffixes[Math.floor(Math.random() * suffixes.length)] + " " + Math.floor(Math.random() * 999);
                const members = `P1_${i}, P2_${i}, P3_${i}, P4_${i}`;

                // 3. Register
                await db.execute(
                    `INSERT INTO participants (user_id, tournament_id, team_name, team_members, kills, prize_won, joined_at, \`rank\`) 
                     VALUES (?, ?, ?, ?, 0, 0, NOW(), 0)`,
                    [botUserId, tournament_id, teamName, members]
                );
            }
            return res.status(200).json({ success: true, message: `${count} Bots Added!` });
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
                if (tour.length === 0) throw new Error("Invalid Tournament");
                
                const [count] = await connection.execute('SELECT COUNT(*) as c FROM participants WHERE tournament_id=?', [tournament_id]);
                if (count[0].c >= tour[0].total_spots) throw new Error("Tournament Full");

                const [dup] = await connection.execute('SELECT id FROM participants WHERE tournament_id=? AND user_id=?', [tournament_id, user_id]);
                if (dup.length > 0) throw new Error("Already Registered");

                const fee = parseFloat(tour[0].entry_fee);
                const [u] = await connection.execute('SELECT wallet_balance FROM users WHERE id=?', [user_id]);
                if (parseFloat(u[0].wallet_balance) < fee) throw new Error("Insufficient Balance");

                if (fee > 0) {
                    await connection.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id=?', [fee, user_id]);
                    await connection.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Tournament Fee", ?, "completed", NOW())', 
                        [user_id, fee, `Reg: ${team_name}`]);
                }

                const memberString = players.join(', '); 
                await connection.execute(
                    `INSERT INTO participants (user_id, tournament_id, team_name, team_members, kills, prize_won, joined_at, \`rank\`) 
                     VALUES (?, ?, ?, ?, 0, 0, NOW(), 0)`, 
                    [user_id, tournament_id, team_name, memberString]
                );

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
            // Return participants as default standings (for users)
            // Or fetch from stage_standings if stage_id provided. Assuming default overview:
            const [rows] = await db.execute(`
                SELECT id, team_name, kills, \`rank\` as total_points 
                FROM participants 
                WHERE tournament_id = ? 
                ORDER BY \`rank\` DESC, kills DESC`, 
                [tournament_id]
            );
            return res.status(200).json(rows);
        }

        return res.status(400).json({ error: "Invalid Type" });

    } catch (e) {
        console.error("OFFICIAL API ERROR:", e);
        return res.status(500).json({ error: e.message });
    }
};
