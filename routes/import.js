const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

router.use((req, res, next) => {
  if (!req.pool) return res.redirect('/');
  next();
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.sql' || ext === '.csv') {
      cb(null, true);
    } else {
      cb(new Error('Only .sql and .csv files are allowed.'));
    }
  }
});

router.get('/', async (req, res) => {
  try {
    const [databases] = await req.pool.query('SHOW DATABASES');
    const dbList = databases.map(r => Object.values(r)[0]);
    res.render('import', { user: req.session.user, databases: dbList, error: null, success: null });
  } catch (err) {
    res.render('import', { user: req.session.user, databases: [], error: err.message, success: null });
  }
});

router.post('/sql', upload.single('sqlfile'), async (req, res) => {
  try {
    const [databases] = await req.pool.query('SHOW DATABASES');
    const dbList = databases.map(r => Object.values(r)[0]);

    if (!req.file) {
      return res.render('import', { user: req.session.user, databases: dbList, error: 'No file uploaded.', success: null });
    }

    const database = req.body.database;
    if (database) {
      await req.pool.query(`USE \`${database}\``);
    }

    const sql = req.file.buffer.toString('utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    let executed = 0;
    let errors = [];

    for (const stmt of statements) {
      try {
        await req.pool.query(stmt);
        executed++;
      } catch (err) {
        errors.push({ statement: stmt.substring(0, 100), error: err.message });
      }
    }

    const errorMsg = errors.length > 0
      ? `${executed} statement(s) executed. ${errors.length} error(s): ${errors.map(e => e.error).join('; ')}`
      : null;
    const successMsg = errors.length === 0 ? `${executed} statement(s) executed successfully.` : null;

    res.render('import', { user: req.session.user, databases: dbList, error: errorMsg, success: successMsg });
  } catch (err) {
    const [databases] = await req.pool.query('SHOW DATABASES').catch(() => [[]]);
    const dbList = databases.map(r => Object.values(r)[0]);
    res.render('import', { user: req.session.user, databases: dbList, error: err.message, success: null });
  }
});

router.post('/csv', upload.single('csvfile'), async (req, res) => {
  try {
    const [databases] = await req.pool.query('SHOW DATABASES');
    const dbList = databases.map(r => Object.values(r)[0]);

    if (!req.file) {
      return res.render('import', { user: req.session.user, databases: dbList, error: 'No file uploaded.', success: null });
    }

    const database = req.body.database;
    const table = req.body.table;
    if (!database || !table) {
      return res.render('import', { user: req.session.user, databases: dbList, error: 'Database and table are required.', success: null });
    }

    await req.pool.query(`USE \`${database}\``);

    const csv = req.file.buffer.toString('utf8');
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      return res.render('import', { user: req.session.user, databases: dbList, error: 'CSV must have a header row and at least one data row.', success: null });
    }

    const delimiter = req.body.delimiter || ',';
    const headers = parseCSVLine(lines[0], delimiter);
    const placeholders = headers.map(() => '?').join(', ');
    const insertSQL = `INSERT INTO \`${table}\` (${headers.map(h => '`' + h + '`').join(', ')}) VALUES (${placeholders})`;

    let inserted = 0;
    let errors = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i], delimiter);
        const paddedValues = headers.map((_, idx) => idx < values.length ? values[idx] : null);
        await req.pool.query(insertSQL, paddedValues);
        inserted++;
      } catch (err) {
        errors.push({ line: i + 1, error: err.message });
      }
    }

    const errorMsg = errors.length > 0
      ? `${inserted} row(s) inserted. ${errors.length} error(s).`
      : null;
    const successMsg = errors.length === 0 ? `${inserted} row(s) inserted successfully into ${table}.` : null;

    res.render('import', { user: req.session.user, databases: dbList, error: errorMsg, success: successMsg });
  } catch (err) {
    const [databases] = await req.pool.query('SHOW DATABASES').catch(() => [[]]);
    const dbList = databases.map(r => Object.values(r)[0]);
    res.render('import', { user: req.session.user, databases: dbList, error: err.message, success: null });
  }
});

function parseCSVLine(line, delimiter) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

module.exports = router;
