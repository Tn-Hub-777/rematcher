const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();

// 1. Setup Port (Render sets process.env.PORT automatically)
const PORT = process.env.PORT || 3000;

// 2. Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Serves your HTML/JS files

// 3. Database Connection
// Uses the Cloud variable if available, otherwise falls back to local string
const connectionString = process.env.DATABASE_URL || 'postgres://neondb_owner:PASTE_YOUR_FULL_NEON_STRING_HERE@...';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false } // Required for Neon
});

// --- API ROUTES ---

// GET buyers
app.get('/api/buyers', async (req, res) => {
  try {
    const result = await pool.query('SELECT doc FROM buyers');
    const cleanData = result.rows.map(row => row.doc);
    res.json(cleanData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADD buyer
app.post('/api/buyers', async (req, res) => {
  try {
    const record = req.body;
    await pool.query(
      'INSERT INTO buyers (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = $2', 
      [record.id, record]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET listings
app.get('/api/listings', async (req, res) => {
  try {
    const result = await pool.query('SELECT doc FROM listings');
    const cleanData = result.rows.map(row => row.doc);
    res.json(cleanData);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ADD listing
app.post('/api/listings', async (req, res) => {
  try {
    const record = req.body;
    await pool.query(
      'INSERT INTO listings (id, doc) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET doc = $2', 
      [record.id, record]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ... existing routes ...

// 5. DELETE a buyer
app.delete('/api/buyers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Run SQL to remove from Neon
    await pool.query('DELETE FROM buyers WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 6. DELETE a listing
app.delete('/api/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM listings WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ... existing DELETE routes ...

// 7. EDIT (UPDATE) a buyer
app.put('/api/buyers/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedRecord = req.body; // This is the full new data
    
    // We update the 'doc' column with the new JSON object
    await pool.query('UPDATE buyers SET doc = $1 WHERE id = $2', [updatedRecord, id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 8. EDIT (UPDATE) a listing
app.put('/api/listings/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedRecord = req.body;
    
    await pool.query('UPDATE listings SET doc = $1 WHERE id = $2', [updatedRecord, id]);
    res.json({ success: true });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ error: err.message });
  }
});
// ... app.listen ...
// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});