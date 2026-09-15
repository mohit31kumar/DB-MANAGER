# DB Manager

**DB Manager** is a powerful, web-based database management tool built with Node.js. Connect to any MySQL/MariaDB database (local or remote) by simply pasting a connection string, then browse, manage, and query your data right from the browser — no database client installation required.

- ✅ **Paste a connection string, you're in** — no tedious setup
- ✅ **Manage remote databases** from anywhere, in the browser
- ✅ **No local DB client or GUI app** — works on any device with a browser
- ✅ **Built for everyone** — developers and non-technical users alike

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)
![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=for-the-badge)

## Screenshots

### Connect — paste a connection string

![Connect — paste a connection string](docs/screenshots/connection.png)
*Paste your `mysql://` connection string and click "Parse & Fill" — the form is populated automatically.*

### Dashboard — browse your databases

![Dashboard — browse databases](docs/screenshots/dashboard.png)
*Every connection you've added, on one screen.*

### Table data browser

![Table data browser with CRUD](docs/screenshots/table.png)
*Browse, insert, edit, and delete rows with pagination and sorting.*

### SQL query editor

![SQL query editor with results](docs/screenshots/query-editor.png)
*Syntax-highlighted editor with exportable results.*

### Import / Export

![Import / export](docs/screenshots/import-export.png)
*Import SQL dumps and CSV files, export results in multiple formats.*

## Features

### Multi-Connection Support
- Connect to multiple MySQL/MariaDB databases simultaneously
- Add, edit, delete database connections
- Connection string auto-parse (supports `mysql://`, JDBC, and simple formats)
- SSL/TLS auto-detection for cloud databases (TiDB Cloud, AWS RDS, Google Cloud SQL)
- Per-user isolated connections

### User Management
- User registration and login system
- Per-user connection storage (MySQL)
- Password hashing with bcrypt
- Session-based authentication

### Database Operations
- Browse all databases and tables
- Create new databases with collation selection
- Drop databases with confirmation

### Table Management
- View table structure (columns, indexes, CREATE TABLE SQL)
- Add, modify, drop columns with full type configuration
- Change table engine (InnoDB, MyISAM, MEMORY)
- Change table collation
- Rename tables
- Drop tables with confirmation
- Truncate tables

### Data Manipulation (CRUD)
- Browse table data with pagination and column sorting
- Insert new rows with type-appropriate forms
- Edit existing rows with pre-filled forms
- Delete single or multiple rows
- NULL value toggle for nullable columns

### SQL Query Editor
- Syntax-highlighted code editor (CodeMirror)
- Execute arbitrary SQL queries
- EXPLAIN query support
- SQL formatting/prettification
- Export results as CSV, SQL, or JSON
- Query history (localStorage)
- Ctrl+Enter keyboard shortcut

### Import/Export
- Import SQL dump files with error reporting
- Import CSV files with column mapping
- Export query results in multiple formats
- Custom CSV delimiter support

### UI/UX
- Responsive design (desktop + mobile)
- Collapsible sidebar navigation
- Bootstrap 5 with clean, modern styling
- Dark navbar with connection switcher
- Toast notifications and loading spinners

## Connect with a Connection String

No need to hunt through settings — just paste a connection string. DB Manager auto-parses it and fills in the rest:

### URI format

```
mysql://user:password@host:port/dbname
```

```bash
mysql://admin:mypassword@db.example.com:3306/mydb
```

With SSL (cloud databases):

```
mysql://user:password@host:port/dbname?sslMode=require
```

### JDBC format

```
jdbc:mysql://host:port/dbname?user=...&password=...&sslMode=require
```

### Simple format

```
user:password@host:port/dbname
```

Paste any of these into the connection form, click **Parse & Fill**, and the fields are populated for you — hit **Test Connection** to verify, then save.

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MySQL/MariaDB server (local or remote)

### Installation

```bash
# Clone the repository
git clone https://github.com/mohit31kumar/DB-MANAGER.git
cd DB-MANAGER

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (SESSION_SECRET, APP_PORT, and internal MySQL credentials)

# Start the server
npm start
```

### First Run

1. Open `http://localhost:3000` in your browser
2. You'll be redirected to the registration page
3. Create your admin account
4. Add your first database connection (or paste a connection string)
5. Start managing your databases!

## Configuration

Edit `.env` file:

```env
SESSION_SECRET=your-secret-key-here
APP_PORT=3000

# Internal MySQL database for app data
INTERNAL_DB_HOST=localhost
INTERNAL_DB_PORT=3306
INTERNAL_DB_USER=root
INTERNAL_DB_PASSWORD=
INTERNAL_DB_NAME=db_manager
# Set INTERNAL_DB_SSL=true if your MySQL server requires SSL (e.g., TiDB Cloud, AWS RDS)
INTERNAL_DB_SSL=false
```

## Architecture

```mermaid
flowchart TD
    User[User / Browser] -->|HTTP| Express[Express Server]
    Express --> Auth[Auth Routes\nlogin / register / logout]
    Express --> Conn[Connection Routes\nmanage connections]
    Express --> DB[Database Routes\nbrowse / create / drop]
    Express --> Table[Table Routes\nstructure / CRUD]
    Express --> Query[Query Routes\nSQL editor]
    Express --> Import[Import Routes\nSQL / CSV]
    Auth --> Store[(Internal MySQL\nusers · connections)]
    Conn --> Store
    DB --> Pool{Connection Pools}
    Table --> Pool
    Query --> Pool
    Import --> Pool
    Pool -->|mysql2| Remote[(User Databases\nMySQL / MariaDB)]
```

Routes in `routes/` talk to the user's MySQL databases through per-connection pools managed by `db.js`, while application data (users and saved connections) is stored in the internal `db_manager` database via `store.js`.

## Project Structure

```
db-manager/
├── server.js              # Express app entry point
├── db.js                  # MySQL connection pool manager for user connections
├── store.js               # MySQL store (users, connections, saved queries)
├── routes/
│   ├── auth.js            # Login/register/logout
│   ├── connections.js     # Connection management
│   ├── index.js           # Dashboard
│   ├── database.js        # Database operations
│   ├── table.js           # Table structure/browse/CRUD
│   ├── query.js           # SQL editor
│   └── import.js          # Import SQL/CSV
├── views/                 # EJS templates
│   ├── partials/          # Header, footer, credit
│   └── table/             # Table-specific views
└── public/                # CSS, JavaScript
```

## Security

- Passwords hashed with **bcrypt**
- **Session-based authentication** via express-session
- **Per-user isolated connections** — users only see their own databases
- Optional **SSL/TLS** for secure connections to cloud databases

## FAQ / Troubleshooting

**My cloud database (TiDB Cloud / AWS RDS / Google Cloud SQL) won't connect.**
Enable the **Use SSL/TLS Connection** option when saving the connection. DB Manager auto-detects whether the server requires or rejects SSL.

**I get an error after pasting my connection string.**
Make sure the format is one of `mysql://user:pass@host:port/db`, `jdbc:mysql://...`, or `user:pass@host:port/db`, then click **Test Connection** before saving.

**Can I connect to multiple databases at once?**
Yes — add as many connections as you need and switch between them from the navbar dropdown.

**Is a local MySQL server required?**
Only one MySQL server is needed to store app data (users and connections). The databases you manage can be anywhere — local or remote.

## Roadmap

- [x] Add captured UI screenshots to `docs/screenshots/`
- [ ] Saved query execution history (server-side)
- [ ] Visual explain plan viewer
- [ ] Schema export / diff
- [ ] Dark theme toggle

## Contributing

Contributions are welcome! Feel free to open an [issue](https://github.com/mohit31kumar/DB-MANAGER/issues) or submit a pull request.

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + Express |
| Database Driver | mysql2 (with promises) |
| User Storage | MySQL |
| Templating | EJS |
| Frontend | Bootstrap 5 + CodeMirror |
| Authentication | bcrypt + express-session |

## License

MIT License — see [LICENSE](LICENSE) file.

## Author

**Mohit Kumar** — [@mohit31kumar](https://github.com/mohit31kumar)

---

Built with ❤️ by [Mohit Kumar](https://github.com/mohit31kumar)