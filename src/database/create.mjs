import { runQuery } from './db.mjs'
import * as cst from './tables.mjs';

export async function createTable() {
    console.log("[StealthIM]Creating tables...")
    await runQuery(cst.userTableSQL)
    await runQuery(cst.msgTableSQL)
    await runQuery(cst.grpTableSQL)
    await runQuery(cst.grpUsrTableSQL)
    console.log("[StealthIM]Tables created.")
}
