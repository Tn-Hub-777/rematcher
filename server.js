// ... top of file ...
const app = express();
// CHANGE 1: Use the system port OR 3000
const PORT = process.env.PORT || 3000; 

// ... inside middleware ...
app.use(express.static('public'));

// ... connection string ...
// CHANGE 2: Look for the environment variable first
const connectionString = process.env.DATABASE_URL || 'postgres://neondb_owner:.......(YOUR_FULL_STRING_HERE)';

const pool = new Pool({ 
  connectionString,
  ssl: { rejectUnauthorized: false } // CHANGE 3: Essential for Neon on Cloud
});

// ... bottom of file ...
// CHANGE 4: Listen on the variable PORT
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});