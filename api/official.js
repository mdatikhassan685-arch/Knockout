const db = require('../db');

module.exports = async (req, res) => {
    // Basic Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, user_id, tournament_id, category_id, team_name, players, tour_id, stage_id, match_id, title, map, time, room_id, room_pass, status } = body;

    try {
        /* ============================================================
           🔧 ADMIN: TOURNAMENT MANAGEMENT
        ============================================================ */
        if (type === 'get_admin_tournaments') {
            const [rows] = await db.execute('SELECT * FROM tournaments WHERE category_id = ? ORDER BY schedule_time DESC', [category_id]);
            return res.status(200).json(rows);
        }

        if (type === 'create_tournament') {
            const [res] = await db.execute(
                `INSERT INTO tournaments (category_id, title, entry_fee, winning_prize, total_spots, schedule_time, created_at) 
                 VALUES (?, ?, ?, ?, ?, ?, NOW())`,
                [category_id, body.title, body.entry_fee, body.winning_prize, body.total_spots, body.schedule_time]
            );
            
            const newTourId = res.insertId;

            // Auto-Create Stages if provided
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

        /* ============================================================
           🎮 ADMIN: STAGE & MATCH MANAGEMENT (NEW)
        ============================================================ */
        
        // 1. Get Stages & Matches
        if (type === 'get_stages_and_matches') {
            // Get Stages
            const [stages] = await db.execute('SELECT * FROM tournament_stages WHERE tournament_id = ? ORDER BY stage_order ASC', [tournament_id]);
            
            // Get Matches for each stage
            for (let stage of stages) {
                const [matches] = await db.execute('SELECT * FROM stage_matches WHERE stage_id = ? ORDER BY schedule_time ASC', [stage.id]);
                stage.matches = matches;
            }
            return res.status(200).json(stages);
        }

        // 2. Create Match inside a Stage
        if (type === 'create_stage_match') {
            await db.execute(
                `INSERT INTO stage_matches (stage_id, match_title, map_name, schedule_time, status) 
                 VALUES (?, ?, ?, ?, 'upcoming')`,
                [stage_id, title, map, time]
            );
            return res.status(200).json({ success: true });
        }

        // 3. Update Room ID/Pass
        if (type === 'update_stage_room') {
            await db.execute(
                `UPDATE stage_matches SET room_id=?, room_pass=?, status=? WHERE id=?`,
                [room_id, room_pass, status, match_id]
            );
            return res.status(200).json({ success: true });
        }

        // 4. Delete Stage Match
        if (type === 'delete_stage_match') {
            await db.execute('DELETE FROM stage_matches WHERE id=?', [match_id]);
            return res.status(200).json({ success: true });
        }

        /* ============================================================
           👤 USER ACTIONS (View/Register)
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

        // Get Points Table (Updated to use stage_standings later, for now participants table)
        if (type === 'get_official_standings') {
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
