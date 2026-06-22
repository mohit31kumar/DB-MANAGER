# DB Manager

A powerful, web-based database management tool built with Node.js — a modern alternative to phpMyAdmin.

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-4479A1?style=for-the-badge&logo=mysql&logoColor=white)
![Bootstrap](https://img.shields.io/badge/Bootstrap-563D7C?style=for-the-badge&logo=bootstrap&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)

## Features

### Multi-Connection Support
- Connect to multiple MySQL/MariaDB databases simultaneously
- Add, edit, delete database connections
- Connection string auto-parse (supports `mysql://`, JDBC, and simple formats)
- SSL/TLS auto-detection for cloud databases (TiDB Cloud, AWS RDS, Google Cloud SQL)
- Per-user isolated connections

### User Management
- User registration and login system
- Per-user connection storage (SQLite)
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

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- MySQL/MariaDB server (local or remote)

### Installation

```bash
# Clone the repository
git clone https://github.com/mohit31kumar/db-manager.git
cd db-manager

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings (only SESSION_SECRET and APP_PORT needed)

# Start the server
npm start
```

### First Run

1. Open `http://localhost:3000` in your browser
2. You'll be redirected to the registration page
3. Create your admin account
4. Add your first database connection
5. Start managing your databases!

## Configuration

Edit `.env` file:

```env
SESSION_SECRET=your-secret-key-here
APP_PORT=3000
```

## Project Structure

```
db-manager/
├── server.js              # Express app entry point
├── db.js                  # MySQL connection pool manager
├── store.js               # SQLite store (users, connections)
├── users.db               # SQLite database (auto-created)
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

## Tech Stack

| Component | Technology |
|-----------|------------|
| Backend | Node.js + Express |
| Database Driver | mysql2 (with promises) |
| User Storage | SQLite (better-sqlite3) |
| Templating | EJS |
| Frontend | Bootstrap 5 + CodeMirror |
| Authentication | bcrypt + express-session |

## License

MIT License - see [LICENSE](LICENSE) file.

## Author

**Mohit Kumar** — [@mohit31kumar](https://github.com/mohit31kumar)

---

Built with ❤️ by [Mohit Kumar](https://github.com/mohit31kumar)
