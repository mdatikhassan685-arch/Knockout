// db.js ফাইলটি ঠিক আছে ধরে নেওয়া হচ্ছে।
const pool = require('../db');

module.exports = async (req, res) => {
    // CORS Configuration (Essential for Vercel)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { type, userId, catId, tournamentId } = req.body;

    // input validation (New addition)
    if (!type) {
        return res.status(400).json({ success: false, error: 'Request type is missing.' });
    }

    try {
        if (type === 'home') {
            // Optimization: Use Promise.all to fetch data concurrently
            const [userPromise, catsPromise, bannersPromise] = await Promise.all([
                pool.execute('SELECT wallet_balance FROM users WHERE id = ?', [userId]),
                pool.execute('SELECT * FROM tournaments WHERE is_category = 1 ORDER BY id DESC'),
                pool.execute('SELECT * FROM banners ORDER BY sort_order')
            ]);
            
            const [userRows] = userPromise;
            const [catsRows] = catsPromise;
            const [bannersRows] = bannersPromise;

            return res.json({ 
                success: true, 
                user: userRows[0] || null, // Handle case where user might not be found
                categories: catsRows, 
                banners: bannersRows 
            });
        }

        if (type === 'category-tournaments') {
            // Input validation for catId (New addition)
            if (!catId) {
                return res.status(400).json({ success: false, error: 'Category ID is required.' });
            }

            // Optimization: Use Promise.all to fetch data concurrently
            const [catPromise, tournamentsPromise] = await Promise.all([
                pool.execute('SELECT title FROM tournaments WHERE id = ?', [catId]),
                pool.execute('SELECT * FROM tournaments WHERE parent_id = ? AND is_category = 0', [catId])
            ]);
            
            const [catRows] = catPromise;
            const [tournamentsRows] = tournamentsPromise;

            return res.json({ 
                success: true, 
                category: catRows[0] || null,
                tournaments: tournamentsRows 
            });
        }

        if (type === 'tournament-details') {
            // Input validation for tournamentId and userId (New addition)
            if (!tournamentId || !userId) {
                return res.status(400).json({ success: false, error: 'Tournament ID and User ID are required.' });
            }

            // Optimization: Use Promise.all for concurrent queries
            const [tPromise, joinedPromise, isJoinedPromise] = await Promise.all([
                pool.execute('SELECT * FROM tournaments WHERE id = ?', [tournamentId]),
                pool.execute('SELECT COUNT(*) as count FROM teams WHERE tournament_id = ?', [tournamentId]),
                pool.execute('SELECT id FROM teams WHERE tournament_id = ? AND leader_user_id = ?', [tournamentId, userId])
            ]);
            
            const [tRows] = tPromise;
            const [joinedRows] = joinedPromise;
            const [isJoinedRows] = isJoinedPromise;

            return res.json({ 
                success: true, 
                tournament: tRows[0] || null, 
                joinedCount: joinedRows[0].count, 
                isJoined: isJoinedRows.length > 0 
            });
        }

        // Add more functionality (like wallet logic) as needed...

        // If the type parameter is not recognized
        return res.status(400).json({ success: false, error: 'Invalid request type.' });

    } catch (error) {
        // Log the error for debugging and return a generic error message for security
        console.error('API Error:', error);
        return res.status(500).json({ success: false, error: 'Internal server error.' });
    }
};
