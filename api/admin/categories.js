const pool = require('../../db');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { action, title, image, type, catId, adminId } = req.body;

    try {
        const [admin] = await pool.execute('SELECT role FROM users WHERE id = ?', [adminId]);
        if (!admin[0] || admin[0].role !== 'admin') return res.status(403).json({ error: 'Unauthorized' });

        if (action === 'create') {
            const isOfficial = type === 'official' ? 1 : 0;
            const isNormal = type === 'normal' ? 1 : 0;
            
            // সব Required ফিল্ডের জন্য ডামি ভ্যালু
            await pool.execute(
                `INSERT INTO tournaments (
                    title, image, is_category, is_official, is_normal, 
                    match_type, map, rules, start_time
                ) VALUES (?, ?, 1, ?, ?, 'Category', 'None', 'Category Rules', NOW())`, 
                [title, image, isOfficial, isNormal]
            );
            return res.json({ success: true, message: 'Category Created!' });
        }

        if (action === 'list') {
            const [rows] = await pool.query('SELECT * FROM tournaments WHERE is_category = 1 ORDER BY id DESC');
            return res.json({ success: true, categories: rows });
        }

        if (action === 'delete') {
            await pool.execute('DELETE FROM tournaments WHERE id = ?', [catId]);
            return res.json({ success: true, message: 'Category Deleted' });
        }

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
