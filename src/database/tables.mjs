export const userTableSQL = `CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);`

export const msgTableSQL = `CREATE TABLE IF NOT EXISTS msg (
    msg_id INTEGER PRIMARY KEY,
    group_id INTEGER,
    msg_content TEXT,
    msg_msgTime INTEGER,
    msg_uid INTEGER,
    msg_fileHash TEXT,
    msg_type INTEGER,
    msg_sender TEXT,
    sended INTEGER DEFAULT 0
);`

export const grpTableSQL = `CREATE TABLE IF NOT EXISTS groups (
    groupid INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT DEFAULT ""
);`

export const grpUsrTableSQL = `CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    nickname TEXT
);`

