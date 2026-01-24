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
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [body.title, body.image, body.cat_type || 'normal', 'active']);
            return res.status(200).json({ success: true });
        }

        if (type === 'edit_category') {
            await db.execute('UPDATE categories SET title=?, image=?, type=? WHERE id=?', 
                [body.title, body.image, body.cat_type, body.id]);
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
            let sql = `SELECT * FROM matches ORDER BY id DESC LIMIT 50`;
            let params = [];
            if (category_id && category_id != 'null') {
                sql = `SELECT * FROM matches WHERE category_id = ? ORDER BY id DESC`;
                params = [category_id];
            }
            const [matches] = await db.execute(sql, params);
            return res.status(200).json(matches);
        }

        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots, winners_count, room_id, room_pass) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?)`,
                [category_id, body.title, body.entry_fee||0, body.prize_pool||0, body.per_kill||0, body.match_type, body.match_time, body.map, body.total_spots||48, body.winners_count||1, body.room_id||null, body.room_pass||null]
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
        // 3. PARTICIPANTS & KICK LOGIC
        // ==========================================
        if (type === 'get_match_participants_for_result') {
            const [matchInfo] = await db.execute('SELECT match_type FROM matches WHERE id = ?', [match_id]);
            if (matchInfo.length === 0) return res.status(404).json({ error: "Match not found" });

            const isSolo = matchInfo[0].match_type === 'Solo';
            let rows;
            if (isSolo) {
                [rows] = await db.execute('SELECT game_name as name, kills, `rank` FROM match_participants WHERE match_id = ?', [match_id]);
            } else {
                [rows] = await db.execute('SELECT team_name as name, SUM(kills) as kills, MAX(`rank`) as `rank` FROM match_participants WHERE match_id = ? GROUP BY team_name', [match_id]);
            }
            return res.status(200).json({ type: isSolo ? 'Solo' : 'Team', data: rows });
        }

        if (type === 'kick_participant') {
            const [match] = await db.execute('SELECT entry_fee FROM matches WHERE id = ?', [match_id]);
            const refund = parseFloat(match[0]?.entry_fee || 0);

            let query = body.is_solo ? 'SELECT user_id FROM match_participants WHERE match_id=? AND game_name=?' : 'SELECT user_id FROM match_participants WHERE match_id=? AND team_name=?';
            const [players] = await db.execute(query, [match_id, body.target_name]);

            for (let p of players) {
                if (refund > 0) {
                    await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [refund, p.user_id]);
                    await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Refund", "Kicked by Admin", "completed", NOW())', [p.user_id, refund]);
                }
            }
            let delQuery = body.is_solo ? 'DELETE FROM match_participants WHERE match_id=? AND game_name=?' : 'DELETE FROM match_participants WHERE match_id=? AND team_name=?';
            await db.execute(delQuery, [match_id, body.target_name]);
            return res.status(200).json({ success: true });
        }

        // ==========================================
        // 4. SCORING & PRIZE DISTRIBUTION
        // ==========================================
        if (type === 'update_match_results_only') {
            for (let item of body.stats) {
                let query = body.is_solo ? 'UPDATE match_participants SET kills=?, `rank`=? WHERE match_id=? AND game_name=?' : 'UPDATE match_participants SET kills=?, `rank`=? WHERE match_id=? AND team_name=?';
                await db.execute(query, [item.kills, item.rank, match_id, item.name]);
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'get_prize_distribution_data') {
            const [match] = await db.execute('SELECT per_kill, prize_pool, winners_count, match_type FROM matches WHERE id = ?', [match_id]);
            const m = match[0];
            const perKillRate = parseFloat(m.per_kill || 0);
            const prizePool = parseFloat(m.prize_pool || 0);
            const winnersCount = parseInt(m.winners_count || 1);

            let rows;
            if (m.match_type === 'Solo') {
                [rows] = await db.execute('SELECT game_name as name, kills, `rank` FROM match_participants WHERE match_id = ? ORDER BY `rank` ASC', [match_id]);
            } else {
                [rows] = await db.execute('SELECT team_name as name, MAX(kills) as kills, MAX(`rank`) as `rank` FROM match_participants WHERE match_id = ? GROUP BY team_name ORDER BY `rank` ASC', [match_id]);
            }

            const results = rows.map(p => {
                let killMoney = p.kills * perKillRate;
                let rankPrize = 0;
                if (p.rank > 0 && p.rank <= winnersCount) {
                    if (winnersCount === 1 && p.rank === 1) rankPrize = prizePool;
                    else if (winnersCount === 2) {
                        if (p.rank === 1) rankPrize = prizePool * 0.7;
                        if (p.rank === 2) rankPrize = prizePool * 0.3;
                    } else if (winnersCount === 3) {
                        if (p.rank === 1) rankPrize = prizePool * 0.5;
                        if (p.rank === 2) rankPrize = prizePool * 0.3;
                        if (p.rank === 3) rankPrize = prizePool * 0.2;
                    } else { rankPrize = prizePool / winnersCount; }
                }
                return { name: p.name, rank: p.rank || 0, kills: p.kills, kill_money: killMoney, rank_prize: rankPrize };
            });
            return res.status(200).json({ data: results });
        }

        if (type === 'distribute_prizes_final') {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                for (let item of body.prizes) {
                    const amount = parseFloat(item.amount);
                    if (amount <= 0) continue;
                    let uid;
                    if (body.is_solo) {
                        const [p] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND game_name=?', [match_id, item.name]);
                        if (p.length > 0) uid = p[0].user_id;
                    } else {
                        const [leader] = await connection.execute('SELECT user_id FROM match_participants WHERE match_id=? AND team_name=? LIMIT 1', [match_id, item.name]);
                        if (leader.length > 0) uid = leader[0].user_id;
                    }
                    if (uid) {
                        await connection.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, uid]);
                        await connection.execute('UPDATE match_participants SET prize_won = prize_won + ? WHERE match_id=? AND user_id=?', [amount, match_id, uid]);
                        await connection.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Win", ?, "completed", NOW())', [uid, amount, `Match #${match_id} Prize`]);
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

        // ==========================================
        // 5. USER & FINANCE MANAGEMENT
        // ==========================================
        if (type === 'list_users') { 
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC'); 
            return res.status(200).json(users); 
        }

        if (type === 'update_user_status') {
            await db.execute('UPDATE users SET status=? WHERE id=?', [body.status, user_id]);
            return res.status(200).json({ success: true });
        }

        if (type === 'manage_balance') {
            const amount = parseFloat(body.amount);
            const sql = body.action === 'add' ? 'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?' : 'UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?';
            const transType = body.action === 'add' ? 'Admin Gift' : 'Penalty';
            await db.execute(sql, [amount, user_id]);
            await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, ?, "Action by Admin", "completed", NOW())', [user_id, amount, transType]);
            return res.status(200).json({ success: true });
        }

        if (type === 'list_deposits') {
            const [rows] = await db.execute('SELECT d.*, u.username FROM deposits d JOIN users u ON d.user_id = u.id WHERE d.status = "pending" ORDER BY d.id DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_deposit') {
            if (body.action === 'approve') {
                const [dep] = await db.execute('SELECT user_id, amount FROM deposits WHERE id=?', [body.deposit_id]);
                if (dep.length > 0) {
                    await db.execute("UPDATE deposits SET status='approved' WHERE id=?", [body.deposit_id]);
                    await db.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?", [dep[0].amount, dep[0].user_id]);
                    await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Deposit", "Approved", "completed", NOW())', [dep[0].user_id, dep[0].amount]);
                }
            } else { await db.execute("UPDATE deposits SET status='rejected' WHERE id=?", [body.deposit_id]); }
            return res.status(200).json({ success: true });
        }

        if (type === 'list_withdrawals') {
            const [rows] = await db.execute('SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.id DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_withdrawal') {
            if (body.action === 'approve') {
                await db.execute("UPDATE withdrawals SET status='approved' WHERE id=?", [body.withdraw_id]);
            } else {
                const [wd] = await db.execute('SELECT user_id, amount FROM withdrawals WHERE id=?', [body.withdraw_id]);
                if (wd.length > 0) {
                    await db.execute("UPDATE withdrawals SET status='rejected' WHERE id=?", [body.withdraw_id]);
                    await db.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?", [wd[0].amount, wd[0].user_id]);
                    await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Refund", "Withdraw Rejected", "completed", NOW())', [wd[0].user_id, wd[0].amount]);
                }
            }
            return res.status(200).json({ success: true });
        }

        if (type === 'dashboard_stats') {
            const [[u]] = await db.execute('SELECT COUNT(*) as c FROM users');
            const [[d]] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"');
            const [[w]] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"');
            return res.status(200).json({ total_users: u.c, pending_deposits: d.c, pending_withdraws: w.c });
        }

        if (type === 'get_settings') {
            const [rows] = await db.execute('SELECT setting_key, setting_value FROM settings');
            const settings = {};
            rows.forEach(r => settings[r.setting_key] = r.setting_value);
            return res.status(200).json(settings);
        }

        if (type === 'update_settings') {
            const sets = [{k:'youtube_link', v:body.youtube}, {k:'telegram_link', v:body.telegram}, {k:'whatsapp_number', v:body.whatsapp}, {k:'announcement', v:body.announcement}, {k:'notification_msg', v:body.notification}, {k:'about_us', v:body.about}, {k:'privacy_policy', v:body.policy}, {k:'app_version', v:body.version}];
            for (let s of sets) await db.execute('UPDATE settings SET setting_value=? WHERE setting_key=?', [s.v, s.k]);
            return res.status(200).json({ success: true });
        }

        if (type === 'send_notification') {
            await db.execute('INSERT INTO notifications (title, message, is_global, created_at) VALUES (?, ?, 1, NOW())', [body.title, body.message]);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Invalid Type' });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
};
