const db = require('../db');

module.exports = async (req, res) => {
    // 1. CORS Setup
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') return res.status(200).end();

    const { type, id, team_name, match_id, user_id, entry_fee, refund_amount } = req.body;
    // ... (অন্যান্য ভেরিয়েবল) ...

    try {
        // ... (Category & Settings কোড আগের মতোই থাকবে, এখানে হাত দেওয়ার দরকার নেই) ...

        // ==========================
        // 🔥 TEAM KICK & REFUND (SMART LOGIC)
        // ==========================
        
        // ১. অ্যাডমিন যখন কোনো নির্দিষ্ট প্লেয়ার বা টিমকে কিক করবে
        if (type === 'kick_participant') {
            const connection = await db.getConnection(); // ট্রানজ্যাকশন ব্যবহার করছি নিরাপদ ডিলিটের জন্য

            try {
                await connection.beginTransaction();

                // স্টেপ ১: চেক করি ওই টিমের বা ইউজারের ইনফো
                // আমরা match_participants টেবিল থেকে শুধু এই ম্যাচ আইডি দিয়ে ওই ইউজার বা টিমকে খুঁজবো
                
                // যদি 'team_name' পাঠানো হয়, তবে পুরো টিমকে কিক করব
                // যদি শুধু 'user_id' বা 'participant_id' পাঠানো হয়, শুধু তাকে কিক করব (Solo)
                
                let selectQuery = "";
                let params = [];
                
                if (team_name && team_name !== 'Solo') {
                    // Squad/Duo Kick Logic: পুরো টিমকে ধরো
                    selectQuery = "SELECT id, user_id FROM match_participants WHERE match_id = ? AND team_name = ?";
                    params = [match_id, team_name];
                } else {
                    // Solo Kick Logic: আইডি ধরে
                    selectQuery = "SELECT id, user_id FROM match_participants WHERE id = ?"; // এখানে `id` হলো পার্টিসিপেন্ট টেবিলের row ID
                    params = [id];
                }
                
                const [players] = await connection.execute(selectQuery, params);

                if (players.length === 0) {
                    throw new Error("Player or Team not found in this match.");
                }

                // স্টেপ ২: টাকা ফেরত দেওয়া (Refund Logic)
                // ম্যাচের ফি চেক করি
                const [matchData] = await connection.execute("SELECT entry_fee FROM matches WHERE id = ?", [match_id]);
                const fee = parseFloat(matchData[0].entry_fee);

                if (fee > 0) {
                    for (let p of players) {
                        // প্রত্যেক প্লেয়ারকে রিফান্ড করা হচ্ছে
                        await connection.execute('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?', [fee, p.user_id]);
                        // ট্রানজ্যাকশন লগ রাখা
                        await connection.execute('INSERT INTO transactions (user_id, amount, type, description) VALUES (?, ?, "Refund", ?)', [p.user_id, fee, "Kicked by Admin"]);
                    }
                }

                // স্টেপ ৩: ডিলিট করা
                if (team_name && team_name !== 'Solo') {
                    await connection.execute("DELETE FROM match_participants WHERE match_id = ? AND team_name = ?", [match_id, team_name]);
                } else {
                    await connection.execute("DELETE FROM match_participants WHERE id = ?", [id]);
                }

                await connection.commit();
                connection.release();
                
                return res.status(200).json({ success: true, message: "Kicked Successfully" });

            } catch (err) {
                await connection.rollback();
                connection.release();
                return res.status(400).json({ error: err.message });
            }
        }
        
        // ... (অন্যান্য Create, Edit ফাংশন আগের মতোই থাকবে) ...

        return res.status(400).json({ error: 'Unknown Type' });

    } catch (e) {
        return res.status(500).json({ error: e.message });
    }
};
