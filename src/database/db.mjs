// db-compat.js
// 这是一个兼容层，用于在Node.js环境中使用sqlite3，在浏览器环境中使用sql.js

import path from 'path';
import os from 'os';

let db; // 数据库实例
let currentDbName; // 用于存储当前数据库名称

const DB_VERSION = 2; // 统一数据库版本，用于 Node.js 和浏览器环境

/**
 * 初始化数据库连接。
 * @param {string} DBPathOnNode - Node.js 环境下的数据库文件路径。
 * @param {string} DBNameOnWeb - 浏览器环境下的 IndexedDB 数据库名称。
 * @param {string} BaseURL - 用于替换数据库名称中 '%' 的基础 URL。
 * @param {string} [wasmUseLocal="https://sql.js.org/dist"] - sql.js WASM 文件的加载路径。
 */
async function initializeDatabase(DBPathOnNode, DBNameOnWeb, BaseURL, wasmUseLocal = "https://sql.js.org/dist") {
    if (typeof window === 'undefined') {
        // Node.js 环境
        const fs = await import('fs/promises'); // 只在 Node.js 环境下动态导入 fs/promises
        const sqlite3 = await import('sqlite3').then(module => module.default); // 导入 sqlite3 模块
        let resolvedDbPath = DBPathOnNode;
        if (DBPathOnNode.startsWith('~')) {
            resolvedDbPath = path.join(os.homedir(), DBPathOnNode.slice(1)); // 处理 '~' 开头的路径
        }
        if (resolvedDbPath.includes('%')) {
            resolvedDbPath = resolvedDbPath.replace('%', BaseURL.replaceAll("/", "-")); // 替换路径中的 '%'
        }

        console.log("[StealthIM]Config dir: " + resolvedDbPath); // 打印配置目录

        resolvedDbPath = path.resolve(resolvedDbPath); // 解析为绝对路径

        // 检查数据库文件是否存在
        const dbExists = await fs.access(resolvedDbPath).then(() => true).catch(() => false);

        db = new sqlite3.Database(resolvedDbPath, async (err) => {
            if (err) {
                console.error('[StealthIM]Error connecting to SQLite database:', err.message); // 连接错误
                return;
            }
            console.log(`[StealthIM]Connected to SQLite database (Node.js) at: ${resolvedDbPath}`); // 连接成功

            // 数据库升级逻辑
            if (dbExists) {
                try {
                    // 创建或检查版本表
                    await new Promise((resolve, reject) => {
                        db.run("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER)", (err) => {
                            if (err) reject(err);
                            else resolve();
                        });
                    });

                    // 查询当前版本
                    const versionResult = await new Promise((resolve, reject) => {
                        db.get("SELECT version FROM schema_version LIMIT 1", (err, row) => {
                            if (err) reject(err);
                            else resolve(row ? row.version : 0);
                        });
                    });

                    const currentVersion = versionResult || 0;

                    if (currentVersion < DB_VERSION) {
                        console.log(`[StealthIM]Database version ${currentVersion} is outdated. Deleting and recreating database.`);

                        // 关闭当前 db
                        db.close((closeErr) => {
                            if (closeErr) {
                                console.error('[StealthIM]Error closing database before upgrade:', closeErr);
                                return;
                            }

                            // 删除数据库文件
                            fs.unlink(resolvedDbPath).then(() => {
                                console.log('[StealthIM]Old database file deleted.');

                                // 重新创建数据库
                                db = new sqlite3.Database(resolvedDbPath, (newErr) => {
                                    if (newErr) {
                                        console.error('[StealthIM]Error recreating database:', newErr);
                                        return;
                                    }
                                    console.log(`[StealthIM]New database created at: ${resolvedDbPath}`);

                                    // 初始化新版本
                                    new Promise((resolve, reject) => {
                                        db.run("INSERT INTO schema_version (version) VALUES (?)", [DB_VERSION], (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        });
                                    }).then(() => {
                                        console.log(`[StealthIM]Database upgraded to version ${DB_VERSION}.`);
                                    }).catch(err => {
                                        console.error('[StealthIM]Error setting new version:', err);
                                    });
                                });
                            }).catch(unlinkErr => {
                                console.error('[StealthIM]Error deleting old database file:', unlinkErr);
                            });
                        });
                    } else {
                        console.log(`[StealthIM]Database is up to date (version ${currentVersion}).`);
                    }
                } catch (upgradeErr) {
                    console.error('[StealthIM]Error during database upgrade check:', upgradeErr);
                }
            } else {
                // 新数据库，创建版本表
                await new Promise((resolve, reject) => {
                    db.run("CREATE TABLE schema_version (version INTEGER)", (err) => {
                        if (err) reject(err);
                        else {
                            db.run("INSERT INTO schema_version (version) VALUES (?)", [DB_VERSION], (insertErr) => {
                                if (insertErr) reject(insertErr);
                                else resolve();
                            });
                        }
                    });
                });
                console.log(`[StealthIM]New database initialized with version ${DB_VERSION}.`);
            }
        });
    } else {
        // 浏览器环境
        const initSqlJs = (await import('sql.js')).default; // 导入 sql.js 模块
        var dbname = DBNameOnWeb;
        if (dbname.includes('%')) {
            dbname = dbname.replace('%', BaseURL.replaceAll("/", "-")); // 替换数据库名称中的 '%'
        }
        currentDbName = dbname; // 保存当前数据库名称

        let SQLModule; // 存储 initSqlJs 返回的模块
        let dbInstance; // 存储数据库实例

        try {

            SQLModule = await initSqlJs({
                locateFile: file => {
                    return wasmUseLocal + "/" + file; // 指定 WASM 文件的加载路径
                }
            });

            const request = indexedDB.open(dbname, DB_VERSION); // 使用全局 DB_VERSION

            // 升级时删除旧存储
            request.onupgradeneeded = (event) => {
                const idbDb = event.target.result;
                if (event.oldVersion < DB_VERSION) {
                    console.log(`[StealthIM]Upgrading database from version ${event.oldVersion} to ${DB_VERSION}. Deleting old data.`);
                    if (idbDb.objectStoreNames.contains('keyval')) {
                        idbDb.deleteObjectStore('keyval'); // 删除旧的对象存储
                    }
                }
                idbDb.createObjectStore('keyval'); // 创建新的对象存储
            };

            dbInstance = await new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    const idbDb = event.target.result;
                    const transaction = idbDb.transaction(['keyval'], 'readonly'); // 创建只读事务
                    const store = transaction.objectStore('keyval'); // 获取对象存储
                    const getRequest = store.get('database'); // 获取数据库数据

                    getRequest.onsuccess = () => {
                        let loadedDb;
                        if (getRequest.result) { // 修复：只检查结果是否存在，移除无效的 event.oldVersion 检查
                            console.log('[StealthIM]Loading database from IndexedDB.'); // 从 IndexedDB 加载数据库
                            loadedDb = new SQLModule.Database(getRequest.result);
                        } else {
                            console.log('[StealthIM]Creating new database due to upgrade or first time.'); // 创建新数据库
                            loadedDb = new SQLModule.Database();
                        }
                        resolve(loadedDb);
                    };

                    getRequest.onerror = (event) => {
                        console.error('[StealthIM]Error getting database from IndexedDB:', event.target.error); // 从 IndexedDB 获取数据库错误
                        reject(event.target.error);
                    };
                };

                request.onerror = (event) => {
                    console.error('[StealthIM]Error opening IndexedDB:', event.target.error); // 打开 IndexedDB 错误
                    reject(event.target.error);
                };
            });
        } catch (e) {
            console.error('[StealthIM]IndexedDB initialization failed, falling back to in-memory:', e); // IndexedDB 初始化失败，回退到内存模式
            SQLModule = await initSqlJs({
                locateFile: file => `https://sql.js.org/dist/${file}` // 指定 WASM 文件路径
            });
            dbInstance = new SQLModule.Database(); // 在内存中创建数据库
        }

        db = dbInstance; // 赋值数据库实例
        console.log('[StealthIM]Connected to SQLite database (Browser).'); // 浏览器环境连接成功
        startAutoSave(dbname); // 启动自动保存

        // 在窗口关闭时自动保存
        window.addEventListener('beforeunload', async () => {
            console.log('[StealthIM]Window is closing, attempting to save database...'); // 窗口关闭前尝试保存数据库
            await closeDatabase(); // 尝试在关闭前保存
        });
    }
}

/**
 * 启动数据库自动保存功能。
 * @param {string} dbname - 数据库名称。
 */
function startAutoSave(dbname) {
    setInterval(async () => {
        console.log('[StealthIM]Start auto save'); // 开始自动保存
        if (!db) return; // 如果数据库未初始化，则返回
        try {
            const data = db.export(); // 导出数据库数据
            const request = indexedDB.open(dbname, DB_VERSION); // 打开 IndexedDB 数据库

            request.onsuccess = (event) => {
                const dbInstance = event.target.result;
                const transaction = dbInstance.transaction(['keyval'], 'readwrite'); // 创建读写事务
                const store = transaction.objectStore('keyval'); // 获取对象存储
                const putRequest = store.put(data, 'database'); // 存储数据库数据

                putRequest.onsuccess = () => {
                    console.log('[StealthIM]Database saved to IndexedDB.'); // 数据库保存成功
                };

                putRequest.onerror = (event) => {
                    console.error('[StealthIM]Error saving database to IndexedDB:', event.target.error); // 数据库保存错误
                };
            };

            request.onerror = (event) => {
                console.error('[StealthIM]Error opening IndexedDB for save:', event.target.error); // 打开 IndexedDB 错误
            };
        } catch (e) {
            console.error('[StealthIM]Error exporting or saving database:', e); // 导出或保存数据库错误
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
            return reject(new Error('Database not initialized. Call initializeDatabase first.')); // 数据库未初始化错误
        }

        if (typeof window === 'undefined') {
            // Node.js 环境
            if (sql.toUpperCase().startsWith('SELECT')) {
                db.all(sql, params, (err, rows) => {
                    if (err) {
                        reject(err); // 查询错误
                    } else {
                        resolve(rows); // 返回查询结果
                    }
                });
            } else {
                db.run(sql, params, function (err) {
                    if (err) {
                        reject(err); // 执行错误
                    } else {
                        resolve({ lastID: this.lastID, changes: this.changes }); // 返回操作结果
                    }
                });
            }
        } else {
            // 浏览器环境
            let stmt; // 声明语句对象
            try {
                stmt = db.prepare(sql); // 准备 SQL 语句
                stmt.bind(params); // 绑定参数

                if (sql.toUpperCase().startsWith('SELECT')) {
                    const rows = [];
                    while (stmt.step()) {
                        rows.push(stmt.getAsObject()); // 获取查询结果行
                    }
                    resolve(rows); // 返回查询结果
                } else {
                    stmt.run(); // 执行语句
                    resolve({ lastID: db.lastInsertRowid, changes: db.getRowsModified() }); // 返回操作结果
                }
            } catch (err) {
                reject(err); // 查询或执行错误
            } finally {
                if (stmt) {
                    stmt.free(); // 释放语句资源
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
            return resolve(); // 如果数据库未初始化，则直接解决 Promise
        }

        if (typeof window === 'undefined') {
            // Node.js 环境
            db.close((err) => {
                if (err) {
                    reject(err); // 关闭错误
                } else {
                    console.log('Closed SQLite database (Node.js).'); // Node.js 数据库关闭成功
                    db = null; // 清空数据库实例
                    resolve();
                }
            });
        } else {
            // 浏览器环境
            try {
                // 在关闭前强制保存一次
                const data = db.export(); // 导出数据库数据
                const request = indexedDB.open(currentDbName, DB_VERSION); // 打开 IndexedDB 数据库

                request.onsuccess = (event) => {
                    const dbInstance = event.target.result;
                    const transaction = dbInstance.transaction(['keyval'], 'readwrite'); // 创建读写事务
                    const store = transaction.objectStore('keyval'); // 获取对象存储
                    const putRequest = store.put(data, 'database'); // 存储数据库数据

                    putRequest.onsuccess = () => {
                        console.log('[StealthIM]Database saved to IndexedDB before closing.'); // 关闭前数据库保存成功
                        db.close(); // 关闭数据库
                        console.log('Closed SQLite database (Browser).'); // 浏览器数据库关闭成功
                        db = null; // 清空数据库实例
                        resolve();
                    };

                    putRequest.onerror = (event) => {
                        console.error('[StealthIM]Error saving database to IndexedDB before closing:', event.target.error); // 关闭前数据库保存错误
                        db.close(); // 即使保存失败也尝试关闭
                        console.log('Closed SQLite database (Browser) with save error.'); // 浏览器数据库关闭（保存错误）
                        db = null; // 清空数据库实例
                        resolve();
                    };
                };

                request.onerror = (event) => {
                    console.error('[StealthIM]Error opening IndexedDB for close save:', event.target.error); // 关闭保存时打开 IndexedDB 错误
                    db.close(); // 即使打开失败也尝试关闭
                    console.log('Closed SQLite database (Browser) with IndexedDB open error.'); // 浏览器数据库关闭（IndexedDB 打开错误）
                    db = null; // 清空数据库实例
                    resolve();
                };

            } catch (err) {
                console.error('[StealthIM]Error exporting or closing database:', err); // 导出或关闭数据库错误
                reject(err);
            }
        }
    });
}

export {
    initializeDatabase, // 导出初始化数据库函数
    runQuery, // 导出执行查询函数
    closeDatabase // 导出关闭数据库函数
};
