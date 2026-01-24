const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS & Headers Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, match_id, category_id, user_id, id } = body;

    try {
        // ==========================================
        // 1. CATEGORY MANAGEMENT
        // ==========================================
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }
        if (type === 'add_category') {
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, "active")', [body.title, body.image, body.cat_type || 'normal']);
            return res.status(200).json({ success: true });
        }
        if (type === 'edit_category') {
            await db.execute('UPDATE categories SET title=?, image=?, type=? WHERE id=?', [body.title, body.image, body.cat_type, body.id]);
            return res.status(200).json({ success: true });
        }
        if (type === 'delete_category') {
            await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // 2. DAILY MATCH MANAGEMENT
        // ==========================================
        if (type === 'get_admin_matches') {
            let sql = 'SELECT * FROM matches ORDER BY match_time DESC';
            let params = [];
            if (category_id) { sql = 'SELECT * FROM matches WHERE category_id = ? ORDER BY match_time DESC'; params = [category_id]; }
            const [rows] = await db.execute(sql, params);
            return res.status(200).json(rows);
        }

        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots, winners_count, room_id, room_pass) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?)`,
                [category_id, body.title, body.entry_fee, body.prize_pool, body.per_kill, body.match_type, body.match_time, body.map, body.total_spots, body.winners_count, body.room_id, body.room_pass]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=?, winners_count=?, room_id=?, room_pass=? WHERE id=?`, 
                [body.title, body.entry_fee, body.prize_pool, body.per_kill, body.match_type, body.match_time, body.map, body.total_spots, body.winners_count, body.room_id, body.room_pass, match_id]
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'update_match_status') {
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [body.new_status, match_id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'delete_match') {
            await db.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
            await db.execute('DELETE FROM matches WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // 3. NEW PRIZE & RESULT SYSTEM (FOR NORMAL MATCH)
        // ==========================================
        if (type === 'get_match_participants_for_result') {
            const [match] = await db.execute('SELECT match_type FROM matches WHERE id = ?', [match_id]);
            if (match.length === 0) return res.status(404).json({ error: "Match not found" });
            const isSolo = match[0].match_type === 'Solo';
            
            let query = isSolo 
                ? 'SELECT DISTINCT game_name as name FROM match_participants WHERE match_id = ?' 
                : 'SELECT team_name as name FROM match_participants WHERE match_id = ? GROUP BY team_name';
            
            const [rows] = await db.execute(query, [match_id]);
            return res.status(200).json({ type: match[0].match_type, data: rows });
        }

        if (type === 'get_prize_distribution_data') {
            const { stats } = body; // stats = [{name, rank, kills}]
            const [match] = await db.execute('SELECT per_kill, prize_pool, winners_count FROM matches WHERE id = ?', [match_id]);
            const m = match[0];
            const totalPool = parseFloat(m.prize_pool);
            const winCount = parseInt(m.winners_count);

            // Prize Split Logic: 1=(100%), 2=(70,30), 3=(50,30,20)
            const split = { 1:[1], 2:[0.7, 0.3], 3:[0.5, 0.3, 0.2], 5:[0.3, 0.25, 0.2, 0.15, 0.1] };
            const percentages = split[winCount] || [1 / winCount];

            const calculated = stats.map(p => {
                let rankPrize = (p.rank > 0 && p.rank <= winCount) ? totalPool * (percentages[p.rank - 1] || 0) : 0;
                let killPrize = p.kills * parseFloat(m.per_kill);
                return { name: p.name, rank: p.rank, kills: p.kills, total: rankPrize + killPrize };
            });

            return res.status(200).json({ data: calculated });
        }

        if (type === 'distribute_prizes_final') {
            const { prizes, is_solo } = body;
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                for (let p of prizes) {
                    if (p.total <= 0) continue;
                    
                    // Find Leader/User ID (Duo/Squad হলে শুধু একজনকে টাকা দিবে)
                    const query = is_solo 
                        ? 'SELECT user_id FROM match_participants WHERE match_id=? AND game_name=? LIMIT 1' 
                        : 'SELECT user_id FROM match_participants WHERE match_id=? AND team_name=? LIMIT 1';
                    
                    const [user] = await connection.execute(query, [match_id, p.name]);
                    
                    if (user.length > 0) {
                        const uid = user[0].user_id;
                        await connection.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [p.total, uid]);
                        await connection.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Win", ?, "completed", NOW())', 
                            [uid, p.total, `Match #${match_id} Prize (Rank ${p.rank})`]);
                        
                        const updateTable = is_solo 
                            ? 'UPDATE match_participants SET prize_won=?, kills=?, rank=? WHERE match_id=? AND game_name=?' 
                            : 'UPDATE match_participants SET prize_won=?, kills=?, rank=? WHERE match_id=? AND team_name=?';
                        await connection.execute(updateTable, [p.total, p.kills, p.rank, match_id, p.name]);
                    }
                }
                await connection.execute("UPDATE matches SET status = 'completed' WHERE id = ?", [match_id]);
                await connection.commit();
                return res.status(200).json({ success: true });
            } catch (e) { await connection.rollback(); throw e; } finally { connection.release(); }
        }

        // ==========================================
        // 4. USER & FINANCE MANAGEMENT
        // ==========================================
        if (type === 'list_users') {
            const [rows] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC LIMIT 200');
            return res.status(200).json(rows);
        }
        if (type === 'update_user_status') {
            await db.execute('UPDATE users SET status=? WHERE id=?', [body.status, user_id]);
            return res.status(200).json({ success: true });
        }
        if (type === 'manage_balance') {
            const amount = parseFloat(body.amount);
            const sql = body.action === 'add' ? 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?' : 'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?';
            await db.execute(sql, [amount, user_id]);
            await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, ?, "Admin Action", "completed", NOW())', [user_id, amount, body.action === 'add' ? 'Admin Gift' : 'Penalty']);
            return res.status(200).json({ success: true });
        }
        if (type === 'list_deposits') {
            const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.created_at DESC');
            return res.status(200).json(rows);
        }
        if (type === 'handle_deposit') {
            if (body.action === 'approve') {
                const [dep] = await db.execute('SELECT user_id, amount FROM deposits WHERE id=?', [body.deposit_id]);
                if (dep.length > 0) {
                    await db.execute("UPDATE deposits SET status='approved' WHERE id=?", [body.deposit_id]);
                    await db.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?", [dep[0].amount, dep[0].user_id]);
                    await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Deposit", "Approved", "completed", NOW())', [dep[0].user_id, dep[0].amount]);
                    return res.status(200).json({ success: true });
                }
            } else {
                await db.execute("UPDATE deposits SET status='rejected' WHERE id=?", [body.deposit_id]);
                return res.status(200).json({ success: true });
            }
        }
        if (type === 'list_withdrawals') {
            const [rows] = await db.execute('SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.created_at DESC');
            return res.status(200).json(rows);
        }
        if (type === 'handle_withdrawal') {
            if (body.action === 'approve') {
                await db.execute("UPDATE withdrawals SET status='approved' WHERE id=?", [body.withdraw_id]);
                return res.status(200).json({ success: true });
            } else {
                const [wd] = await db.execute('SELECT user_id, amount FROM withdrawals WHERE id=?', [body.withdraw_id]);
                await db.execute("UPDATE withdrawals SET status='rejected' WHERE id=?", [body.withdraw_id]);
                await db.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?", [wd[0].amount, wd[0].user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Refund", "Withdraw Rejected", "completed", NOW())', [wd[0].user_id, wd[0].amount]);
                return res.status(200).json({ success: true });
            }
        }
        if (type === 'dashboard_stats') {
            const [[u]] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [[d]] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"');
            const [[w]] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"');
            return res.status(200).json({ total_users: u.c, pending_deposits: d.c, pending_withdraws: w.c });
        }

        // ==========================================
        // 5. SYSTEM SETTINGS
        // ==========================================
        if (type === 'get_settings') {
            const [rows] = await db.execute('SELECT setting_key, setting_value FROM settings');
            const settings = {};
            rows.forEach(r => settings[r.setting_key] = r.setting_value);
            return res.status(200).json(settings);
        }
        if (type === 'update_settings') {
            const sets = [{k:'youtube_link', v:body.youtube}, {k:'telegram_link', v:body.telegram}, {k:'whatsapp_number', v:body.whatsapp}, {k:'announcement', v:body.announcement}, {k:'app_version', v:body.version}, {k:'about_us', v:body.about}, {k:'privacy_policy', v:body.policy}];
            for (let s of sets) { await db.execute('UPDATE settings SET setting_value=? WHERE setting_key=?', [s.v, s.k]); }
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid Request Type' });

    } catch (e) {
        console.error("ADMIN API ERROR:", e);
        return res.status(500).json({ error: e.message });
    }
};
