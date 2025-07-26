// db-compat.js
// 这是一个兼容层，用于在Node.js环境中使用sqlite3，在浏览器环境中使用sql.js

import path from 'path';
import os from 'os';


let db;
let currentDbName; // 用于存储当前数据库名称

async function initializeDatabase(DBPathOnNode, DBNameOnWeb, BaseURL) {
    if (typeof window === 'undefined') {
        // Node.js 环境
        const sqlite3 = await import('sqlite3').then(module => module.default);
        let resolvedDbPath = DBPathOnNode;
        if (DBPathOnNode.startsWith('~')) {
            resolvedDbPath = path.join(os.homedir(), DBPathOnNode.slice(1));
        }
        if (resolvedDbPath.includes('%')) {
            resolvedDbPath = resolvedDbPath.replace('%', BaseURL.replaceAll("/", "-"));
        }

        console.log("[StealthIM]Config dir: " + resolvedDbPath);

        resolvedDbPath = path.resolve(resolvedDbPath);

        db = new sqlite3.Database(resolvedDbPath, (err) => {
            if (err) {
                console.error('[StealthIM]Error connecting to SQLite database:', err.message);
            } else {
                console.log(`[StealthIM]Connected to SQLite database (Node.js) at: ${resolvedDbPath}`);
            }
        });
    } else {
        // 浏览器环境
        const initSqlJs = (await import('sql.js')).default;
        var dbname = DBNameOnWeb;
        if (dbname.includes('%')) {
            dbname = dbname.replace('%', BaseURL.replaceAll("/", "-"));
        }
        currentDbName = dbname; // 保存数据库名称

        let SQLModule; // 存储 initSqlJs 返回的模块
        let dbInstance; // 存储数据库实例

        try {
            SQLModule = await initSqlJs({
                locateFile: file => `https://sql.js.org/dist/${file}`
            });

            const DB_VERSION = 1;
            const request = indexedDB.open(dbname, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                db.createObjectStore('keyval');
            };

            dbInstance = await new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const transaction = db.transaction(['keyval'], 'readonly');
                    const store = transaction.objectStore('keyval');
                    const getRequest = store.get('database');

                    getRequest.onsuccess = () => {
                        let loadedDb;
                        if (getRequest.result) {
                            console.log('[StealthIM]Loading database from IndexedDB.');
                            loadedDb = new SQLModule.Database(getRequest.result);
                        } else {
                            console.log('[StealthIM]Creating new database.');
                            loadedDb = new SQLModule.Database();
                        }
                        resolve(loadedDb);
                    };

                    getRequest.onerror = (event) => {
                        console.error('[StealthIM]Error getting database from IndexedDB:', event.target.error);
                        reject(event.target.error);
                    };
                };

                request.onerror = (event) => {
                    console.error('[StealthIM]Error opening IndexedDB:', event.target.error);
                    reject(event.target.error);
                };
            });
        } catch (e) {
            console.error('[StealthIM]IndexedDB initialization failed, falling back to in-memory:', e);
            SQLModule = await initSqlJs({
                locateFile: file => `https://sql.js.org/dist/${file}`
            });
            dbInstance = new SQLModule.Database(); // 在内存中创建
        }

        db = dbInstance;
        console.log('[StealthIM]Connected to SQLite database (Browser).');
        startAutoSave(dbname);

        // 在窗口关闭时自动保存
        window.addEventListener('beforeunload', async () => {
            console.log('[StealthIM]Window is closing, attempting to save database...');
            await closeDatabase(); // 尝试在关闭前保存
        });
    }
}

function startAutoSave(dbname) {
    setInterval(async () => {
        console.log('[StealthIM]Start auto save');
        if (!db) return;
        try {
            const data = db.export();
            const request = indexedDB.open(dbname, 1);

            request.onsuccess = (event) => {
                const dbInstance = event.target.result;
                const transaction = dbInstance.transaction(['keyval'], 'readwrite');
                const store = transaction.objectStore('keyval');
                const putRequest = store.put(data, 'database');

                putRequest.onsuccess = () => {
                    console.log('[StealthIM]Database saved to IndexedDB.');
                };

                putRequest.onerror = (event) => {
                    console.error('[StealthIM]Error saving database to IndexedDB:', event.target.error);
                };
            };

            request.onerror = (event) => {
                console.error('[StealthIM]Error opening IndexedDB for save:', event.target.error);
            };
        } catch (e) {
            console.error('[StealthIM]Error exporting or saving database:', e);
        }
    }, 30000); // 每30秒保存一次
}

/**
 * 执行一个SQL查询。
 * @param {string} sql - 要执行的SQL查询字符串。
 * @param {Array} [params=[]] - 查询参数。
 * @returns {Promise<Array|Object>} - 对于SELECT查询返回结果数组，对于其他查询返回一个对象（例如，包含lastID或changes）。
 */
async function runQuery(sql, params = []) {
    return await new Promise((resolve, reject) => {
        if (!db) {
            return reject(new Error('Database not initialized. Call initializeDatabase first.'));
        }

        if (typeof window === 'undefined') {
            // Node.js 环境
            if (sql.toUpperCase().startsWith('SELECT')) {
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                });
            } else {
                db.run(sql, params, function (err) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve({ lastID: this.lastID, changes: this.changes });
                    }
                });
            }
        } else {
            // 浏览器环境
            let stmt;
            try {
                stmt = db.prepare(sql);
                stmt.bind(params);

                if (sql.toUpperCase().startsWith('SELECT')) {
                    const rows = [];
                    while (stmt.step()) {
                        rows.push(stmt.getAsObject());
                    }
                    resolve(rows);
                } else {
                    stmt.run();
                    resolve({ lastID: db.lastInsertRowid, changes: db.getRowsModified() });
                }
            } catch (err) {
                reject(err);
            } finally {
                if (stmt) {
                    stmt.free();
                }
            }
        }
    });
}

/**
 * 关闭数据库连接。
 * @returns {Promise<void>}
 */
async function closeDatabase() {
    return new Promise((resolve, reject) => {
        if (!db) {
            return resolve(); // 如果没有初始化，则无需关闭
        }

        if (typeof window === 'undefined') {
            // Node.js 环境
            db.close((err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Closed SQLite database (Node.js).');
                    db = null;
                    resolve();
                }
            });
        } else {
            // 浏览器环境
            try {
                // 在关闭前强制保存一次
                const data = db.export();
                const request = indexedDB.open(currentDbName, 1);

                request.onsuccess = (event) => {
                    const dbInstance = event.target.result;
                    const transaction = dbInstance.transaction(['keyval'], 'readwrite');
                    const store = transaction.objectStore('keyval');
                    const putRequest = store.put(data, 'database');

                    putRequest.onsuccess = () => {
                        console.log('[StealthIM]Database saved to IndexedDB before closing.');
                        db.close();
                        console.log('Closed SQLite database (Browser).');
                        db = null;
                        resolve();
                    };

                    putRequest.onerror = (event) => {
                        console.error('[StealthIM]Error saving database to IndexedDB before closing:', event.target.error);
                        db.close(); // 即使保存失败也尝试关闭
                        console.log('Closed SQLite database (Browser) with save error.');
                        db = null;
                        resolve();
                    };
                };

                request.onerror = (event) => {
                    console.error('[StealthIM]Error opening IndexedDB for close save:', event.target.error);
                    db.close(); // 即使打开失败也尝试关闭
                    console.log('Closed SQLite database (Browser) with IndexedDB open error.');
                    db = null;
                    resolve();
                };

            } catch (err) {
                console.error('[StealthIM]Error exporting or closing database:', err);
                reject(err);
            }
        }
    });
}

export {
    initializeDatabase,
    runQuery,
    closeDatabase
};
