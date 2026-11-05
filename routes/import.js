const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');

router.use((req, res, next) => {
  if (!req.adapter) return res.redirect('/');
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

async function getDatabasesList(adapter) {
  return await adapter.getDatabases();
}

router.get('/', async (req, res) => {
  try {
    const databases = await getDatabasesList(req.adapter);
    res.render('import', { user: req.session.user, databases, error: null, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    res.render('import', { user: req.session.user, databases: [], error: err.message, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.post('/sql', upload.single('sqlfile'), async (req, res) => {
  try {
    const databases = await getDatabasesList(req.adapter);

    if (!req.file) {
      return res.render('import', { user: req.session.user, databases, error: 'No file uploaded.', success: null,
        dbType: req.connConfig ? req.connConfig.db_type : null });
    }

    const database = req.body.database;
    const disableFK = req.body.disableFK === '1' && (req.connConfig && req.connConfig.db_type === 'mysql');

    if (disableFK) {
      await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 0');
    }

    const sql = req.file.buffer.toString('utf8');
    const statements = sql.split(';').map(s => s.trim()).filter(s => s.length > 0);

    let executed = 0;
    const errors = [];

    for (const stmt of statements) {
      try {
        await req.adapter.runQuery(stmt);
        executed++;
      } catch (err) {
        errors.push({ statement: stmt.substring(0, 100), error: err.message });
      }
    }

    if (disableFK) {
      await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    }

    const errorMsg = errors.length > 0
      ? `${executed} statement(s) executed. ${errors.length} error(s): ${errors.map(e => e.error).join('; ')}`
      : null;
    const successMsg = errors.length === 0 ? `${executed} statement(s) executed successfully.` : null;

    res.render('import', { user: req.session.user, databases, error: errorMsg, success: successMsg,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    if (req.connConfig && req.connConfig.db_type === 'mysql') {
      await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    }
    const databases = await getDatabasesList(req.adapter).catch(() => []);
    res.render('import', { user: req.session.user, databases, error: err.message, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  }
});

router.post('/csv', upload.single('csvfile'), async (req, res) => {
  try {
    const databases = await getDatabasesList(req.adapter);

    if (!req.file) {
      return res.render('import', { user: req.session.user, databases, error: 'No file uploaded.', success: null,
        dbType: req.connConfig ? req.connConfig.db_type : null });
    }

    const database = req.body.database;
    const table = req.body.table;
    const disableFK = req.body.disableFK === '1' && (req.connConfig && req.connConfig.db_type === 'mysql');
    if (!database || !table) {
      return res.render('import', { user: req.session.user, databases, error: 'Database and table are required.', success: null,
        dbType: req.connConfig ? req.connConfig.db_type : null });
    }

    if (disableFK) {
      await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 0');
    }

    const csv = req.file.buffer.toString('utf8');
    const lines = csv.split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) {
      if (disableFK) await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 1');
      return res.render('import', { user: req.session.user, databases, error: 'CSV must have a header row and at least one data row.', success: null,
        dbType: req.connConfig ? req.connConfig.db_type : null });
    }

    const delimiter = req.body.delimiter || ',';
    const headers = parseCSVLine(lines[0], delimiter);

    let inserted = 0;
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const valuesArr = parseCSVLine(lines[i], delimiter);
        const values = {};
        headers.forEach((h, idx) => {
          values[h] = idx < valuesArr.length ? valuesArr[idx] : null;
        });
        await req.adapter.insertRow(database, table, values);
        inserted++;
      } catch (err) {
        errors.push({ line: i + 1, error: err.message });
      }
    }

    if (disableFK) {
      await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 1');
    }

    const errorMsg = errors.length > 0
      ? `${inserted} row(s) inserted. ${errors.length} error(s).`
      : null;
    const successMsg = errors.length === 0 ? `${inserted} row(s) inserted successfully into ${table}.` : null;

    res.render('import', { user: req.session.user, databases, error: errorMsg, success: successMsg,
      dbType: req.connConfig ? req.connConfig.db_type : null });
  } catch (err) {
    if (req.connConfig && req.connConfig.db_type === 'mysql') {
      await req.adapter.runQuery('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    }
    const databases = await getDatabasesList(req.adapter).catch(() => []);
    res.render('import', { user: req.session.user, databases, error: err.message, success: null,
      dbType: req.connConfig ? req.connConfig.db_type : null });
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
