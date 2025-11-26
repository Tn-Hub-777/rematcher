const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Increased limit for bulk uploads
app.use(express.static('public'));

const connectionString = process.env.DATABASE_URL || 'postgres://neondb_owner:YOUR_NEON_STRING_HERE';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

// --- HELPER: GENERIC CRUD ---
const createRoutes = (table) => {
    // GET ALL
    app.get(`/api/${table}`, async (req, res) => {
        try {
            const result = await pool.query(`SELECT doc FROM ${table}`);
            res.json(result.rows.map(r => r.doc));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // ADD / UPDATE SINGLE
    app.post(`/api/${table}`, async (req, res) => {
        try {
            const record = req.body;
            await pool.query(
                `INSERT INTO ${table} (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = $2`, 
                [record.id, record]
            );
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // DELETE SINGLE
    app.delete(`/api/${table}/:id`, async (req, res) => {
        try {
            await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
    
    // PUT (Update)
    app.put(`/api/${table}/:id`, async (req, res) => {
        try {
            const { id } = req.params;
            const record = req.body;
            await pool.query(`UPDATE ${table} SET doc = $1 WHERE id = $2`, [record, id]);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    // --- NEW: CLEAR TABLE (DANGEROUS) ---
    app.delete(`/api/${table}_clear/all`, async (req, res) => {
        try {
            await pool.query(`TRUNCATE TABLE ${table}`);
            res.json({ success: true, message: `Table ${table} cleared` });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });
};

// Create standard routes for all 3 tables
createRoutes('buyers');
createRoutes('listings');
createRoutes('matches');

// --- SPECIAL: BULK SAVE MATCHES ---
app.post('/api/matches/bulk', async (req, res) => {
    const client = await pool.connect();
    try {
        const matches = req.body; // Expecting Array
        await client.query('BEGIN');
        // Optional: Clear old matches first? Uncomment next line if you want to replace matches every run
        // await client.query('TRUNCATE TABLE matches');
        
        for (const m of matches) {
            await client.query(
                `INSERT INTO matches (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = $2`,
                [m.id, m]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, count: matches.length });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});