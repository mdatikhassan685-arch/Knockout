const db = require('../db');

module.exports = async (req, res) => {
    // 1. Basic Config & CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const body = req.body || {};
    const { type, category_id, id, match_id, user_id } = body;

    try {
        /* ============================ 
           CATEGORIES MANAGEMENT
        ============================ */
        if (type === 'get_categories') {
            const [rows] = await db.execute('SELECT * FROM categories ORDER BY id ASC');
            return res.status(200).json(rows);
        }
        if (type === 'add_category') {
            await db.execute('INSERT INTO categories (title, image, type, status) VALUES (?, ?, ?, ?)', 
                [body.title, body.image, body.cat_type || 'normal', 'open']);
            return res.status(200).json({ success: true });
        }
        if (type === 'edit_category') {
            await db.execute('UPDATE categories SET title=?, image=?, type=? WHERE id=?', 
                [body.title, body.image, body.cat_type, body.id]);
            return res.status(200).json({ success: true });
        }
        if (type === 'delete_category') {
            // Delete matches and participants inside category first
            await db.execute('DELETE FROM match_participants WHERE match_id IN (SELECT id FROM matches WHERE category_id = ?)', [id]);
            await db.execute('DELETE FROM matches WHERE category_id = ?', [id]);
            await db.execute('DELETE FROM categories WHERE id = ?', [id]);
            return res.status(200).json({ success: true });
        }

        /* ============================ 
           MATCHES MANAGEMENT 
        ============================ */
        if (type === 'get_admin_matches') {
            let sql = `SELECT * FROM matches ORDER BY match_time DESC LIMIT 50`;
            let params = [];
            if (category_id && category_id != 'null' && category_id != '') {
                sql = `SELECT * FROM matches WHERE category_id = ? ORDER BY match_time DESC`;
                params = [category_id];
            }
            const [matches] = await db.execute(sql, params);
            return res.status(200).json(matches);
        }

        if (type === 'create_daily_match') {
            await db.execute(
                `INSERT INTO matches (category_id, title, entry_fee, prize_pool, per_kill, match_type, match_time, map, status, total_spots, room_id, room_pass, prize_type) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'upcoming', ?, ?, ?, ?)`,
                [category_id, body.title, body.entry_fee||0, body.prize_pool||0, body.per_kill||0, body.match_type, body.match_time, body.map, body.total_spots||48, body.room_id||null, body.room_pass||null, body.prize_type||'Top1']
            );
            return res.status(200).json({ success: true });
        }

        if (type === 'edit_match') {
            await db.execute(
                `UPDATE matches SET title=?, entry_fee=?, prize_pool=?, per_kill=?, match_type=?, match_time=?, map=?, total_spots=?, room_id=?, room_pass=?, prize_type=? WHERE id=?`, 
                [body.title, body.entry_fee||0, body.prize_pool||0, body.per_kill||0, body.match_type, body.match_time, body.map||'', body.total_spots||48, body.room_id||null, body.room_pass||null, body.prize_type||'Top1', match_id]
            );
            return res.status(200).json({ success: true });
        }

        // 🔥 FIX: MATCH DELETE PROBLEM SOLVED
        if (type === 'delete_match') {
            const connection = await db.getConnection();
            try {
                // Delete Participants First
                await connection.execute('DELETE FROM match_participants WHERE match_id = ?', [id]);
                // Then Delete Match
                await connection.execute('DELETE FROM matches WHERE id = ?', [id]);
                return res.status(200).json({ success: true });
            } catch (err) {
                return res.status(500).json({ error: "Delete failed: " + err.message });
            } finally {
                connection.release();
            }
        }

        if (type === 'update_match_status') { 
            await db.execute('UPDATE matches SET status = ? WHERE id = ?', [body.new_status, match_id]); 
            return res.status(200).json({ success: true }); 
        }

        // 🔥 KICK LOGIC (Auto Refund)
        if (type === 'kick_participant') {
             const [match] = await db.execute('SELECT entry_fee FROM matches WHERE id = ?', [body.match_id]);
             // Find all players in that team
             const [players] = await db.execute('SELECT user_id FROM match_participants WHERE match_id=? AND (team_name=? OR game_name=?)', [body.match_id, body.team_name, body.team_name]);
             
             const refund = parseFloat(match[0]?.entry_fee || 0);
             
             if(refund > 0) {
                 // Refund Logic: Assuming Leader paid, but here we refund every user found in that group to be safe
                 // Or if your system deducts from Leader only, this loop refunds the Leader.
                 for(let p of players) {
                     await db.execute('UPDATE users SET wallet_balance=wallet_balance+? WHERE id=?', [refund, p.user_id]);
                     await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Refund", "Kicked by Admin", "completed", NOW())', [p.user_id, refund]);
                 }
             }
             // Delete them
             await db.execute('DELETE FROM match_participants WHERE match_id=? AND (team_name=? OR game_name=?)', [body.match_id, body.team_name, body.team_name]);
             return res.status(200).json({ success: true });
        }

        /* ============================ 
           🔥 UPDATE RESULT & SEND MONEY 
           (Squad/Duo Logic Included)
        ============================ */
        if (type === 'update_normal_match_result') {
            const { match_id, results } = body; 
            // results = [{ user_id: '101', kills: 5, prize: 500 }, ...]

            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                for (let r of results) {
                    const prize = parseFloat(r.prize) || 0;
                    const kills = parseInt(r.kills) || 0;
                    const userId = r.user_id;

                    // 1. Update Kills/Stats for this User/Team
                    // Squad এর ক্ষেত্রে Leader এর নামে কিল/প্রাইজ জমা হবে (LIMIT 1)
                    await connection.execute(
                        'UPDATE match_participants SET kills = ?, prize_won = ? WHERE match_id = ? AND user_id = ? LIMIT 1',
                        [kills, prize, match_id, userId]
                    );

                    // 2. Add Money to Wallet (Only if Prize > 0)
                    if (prize > 0) {
                        // Update User Balance
                        await connection.execute(
                            'UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?',
                            [prize, userId]
                        );
                        
                        // Transaction History
                        await connection.execute(
                            'INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Match Winnings", ?, "completed", NOW())',
                            [userId, prize, `Won in Match #${match_id}`]
                        );
                    }
                }
                
                // 3. Mark Match as Completed
                await connection.execute('UPDATE matches SET status = "completed" WHERE id = ?', [match_id]);

                await connection.commit();
                connection.release();
                return res.status(200).json({ success: true, message: "Results Published & Money Sent!" });

            } catch (err) {
                await connection.rollback();
                connection.release();
                return res.status(500).json({ error: "Update Failed: " + err.message });
            }
        }

        /* ============================ 
           USERS & FINANCE
        ============================ */
        if (type === 'list_users') { 
            const [users] = await db.execute('SELECT id, username, email, wallet_balance, status FROM users ORDER BY id DESC LIMIT 100'); 
            return res.status(200).json(users); 
        }
        if (type === 'update_user_status') {
            await db.execute('UPDATE users SET status=? WHERE id=?', [body.status, user_id]);
            return res.status(200).json({ success: true });
        }
        if (type === 'manage_balance') {
            const amount = parseFloat(body.amount);
            if (body.action === 'add') {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [amount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Admin Gift", "Added by Admin", "completed", NOW())', [user_id, amount]);
            } else {
                await db.execute('UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?', [amount, user_id]);
                await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Penalty", "Deducted by Admin", "completed", NOW())', [user_id, amount]);
            }
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
                    return res.status(200).json({ success: true, message: "Deposit Approved!" });
                }
            } else {
                await db.execute("UPDATE deposits SET status='rejected' WHERE id=?", [body.deposit_id]);
                return res.status(200).json({ success: true, message: "Deposit Rejected!" });
            }
        }

        if (type === 'list_withdrawals') {
            const [rows] = await db.execute('SELECT w.*, u.username FROM withdrawals w JOIN users u ON w.user_id = u.id WHERE w.status = "pending" ORDER BY w.created_at DESC');
            return res.status(200).json(rows);
        }

        if (type === 'handle_withdrawal') {
            if (body.action === 'approve') {
                await db.execute("UPDATE withdrawals SET status='approved' WHERE id=?", [body.withdraw_id]);
                return res.status(200).json({ success: true, message: "Withdrawal Approved!" });
            } else {
                const [wd] = await db.execute('SELECT user_id, amount FROM withdrawals WHERE id=?', [body.withdraw_id]);
                if (wd.length > 0) {
                    await db.execute("UPDATE withdrawals SET status='rejected' WHERE id=?", [body.withdraw_id]);
                    await db.execute("UPDATE users SET wallet_balance = wallet_balance + ? WHERE id=?", [wd[0].amount, wd[0].user_id]);
                    await db.execute('INSERT INTO transactions (user_id, amount, type, details, status, created_at) VALUES (?, ?, "Refund", "Withdraw Rejected", "completed", NOW())', [wd[0].user_id, wd[0].amount]);
                    return res.status(200).json({ success: true, message: "Rejected & Refunded!" });
                }
            }
        }

        /* ============================ 
           SYSTEM SETTINGS
        ============================ */
        if (type === 'dashboard_stats') {
             try {
                const [u] = await db.execute('SELECT COUNT(*) as c FROM users');
                const [d] = await db.execute('SELECT COUNT(*) as c FROM deposits WHERE status="pending"');
                const [w] = await db.execute('SELECT COUNT(*) as c FROM withdrawals WHERE status="pending"');
                return res.status(200).json({ total_users: u[0].c, pending_deposits: d[0].c, pending_withdraws: w[0].c });
             } catch(e) { return res.status(200).json({ total_users:0, pending_deposits:0, pending_withdraws:0 }); }
        }
        if (type === 'get_settings') {
            const [rows] = await db.execute('SELECT setting_key, setting_value FROM settings');
            const settings = {};
            rows.forEach(row => { settings[row.setting_key] = row.setting_value; });
            return res.status(200).json(settings);
        }
        if (type === 'update_settings') {
            const updates = [
                { k: 'youtube_link', v: body.youtube }, { k: 'telegram_link', v: body.telegram }, { k: 'whatsapp_number', v: body.whatsapp },
                { k: 'announcement', v: body.announcement }, { k: 'notification_msg', v: body.notification }, { k: 'about_us', v: body.about },
                { k: 'privacy_policy', v: body.policy }, { k: 'app_version', v: body.version }
            ];
            for (let item of updates) {
                await db.execute('UPDATE settings SET setting_value = ? WHERE setting_key = ?', [item.v, item.k]);
            }
            return res.status(200).json({ success: true });
        }
        if (type === 'send_notification') {
            await db.execute('INSERT INTO notifications (title, message, is_global, created_at) VALUES (?, ?, 1, NOW())', [body.title, body.message]);
            return res.status(200).json({ success: true });
        }

        return res.status(400).json({ error: 'Unknown Type' });

    } catch (e) {
        console.error("ADMIN ERROR:", e);
        return res.status(500).json({ error: e.message });
    }
};
