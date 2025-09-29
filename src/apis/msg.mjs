import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'
import { getUserSession } from './user.mjs'
import SSEClient from '../sse/sse.cjs'
import { runQuery } from '../database/db.mjs'

var BaseURL = "" // 基础 URL

var callback = () => { } // 消息回调函数

/**
 * 设置消息回调函数。
 * @param {Function} cb - 回调函数。
 */
export function setMsgCallback(cb) {
    callback = cb
}

/**
 * 设置基础 URL。
 * @param {string} BaseURLx - 基础 URL。
 */
export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

/**
 * 消息类型枚举。
 * @readonly
 * @enum {number}
 */
export const msgType = {
    Text: 0, // 文本消息
    Image: 1, // 图片消息
    LargeEmoji: 2, // 大型表情
    Emoji: 3, // 表情
    File: 4, // 文件
    Card: 5, // 卡片
    InnerLink: 6, // 内部链接
    Recall: 16 // 撤回消息
}

/**
 * 发送消息。
 * @param {number} groupid - 群组 ID。
 * @param {string} content - 消息内容。
 * @param {number} [contentType=msgType.Text] - 消息类型。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function sendMessage(groupid, content, contentType = msgType.Text) {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof content != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (content == "") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (!Object.values(msgType).includes(contentType)) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }

    // var retx = (await runQuery("SELECT MAX(msg_id) AS mxid FROM msg WHERE group_id = ?", [groupid]))[0].mxid // 获取最大消息 ID
    // if (retx == null) {
    //     retx = 0
    // } else {
    //     retx = BigInt(retx)
    // }

    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/message/" + String(groupid), {
                "msg": content,
                "type": contentType
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送消息请求
            break
        } catch (e) {
            if (retry == 2) {
                return {
                    "success": false,
                    "error": true,
                    "msg": i18n.t.Errorcode[101],
                    "data": null
                }
            }
            console.log("[StealthIM]request retry: " + (retry + 1)) // 打印重试信息
        }
    }
    if (resp.data?.result?.code != 800) { // 如果返回码不是成功
        if (resp.data?.result?.code == 1403 || resp.data?.result?.code == 1402) {
            return {
                "success": false,
                "error": false,
                "msg": i18n.t.Errorcode[resp.data.result.code],
                "data": null
            }
        }
        if (resp.data?.result?.code != void 0) {
            return {
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[resp.data.result.code],
                "data": null
            }
        }
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[101],
            "data": null
        }
    }
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}
// /**
//  * 撤回消息。
//  * @param {number} groupid - 群组 ID。
//  * @param {number} msgID - 消息 ID。
//  * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
//  */
// export async function recallMessage(groupid, msgID) {
//     if (typeof groupid != "number") {
//         return {
//             "success": false,
//             "error": true,
//             "msg": i18n.t.Errorcode[100],
//             "data": null
//         }
//     }
//     if (typeof msgID != "number") {
//         return {
//             "success": false,
//             "error": true,
//             "msg": i18n.t.Errorcode[100],
//             "data": null
//         }
//     }
//     if (groupid <= 0) {
//         return {
//             "success": false,
//             "error": true,
//             "msg": i18n.t.Errorcode[100],
//             "data": null
//         }
//     }
//     if (msgID <= 0) {
//         return {
//             "success": false,
//             "error": true,
//             "msg": i18n.t.Errorcode[100],
//             "data": null
//         }

//     }
//     for (var retry = 0; retry < 3; retry++) { // 重试机制
//         try {
//             var resp = await axios.patch(BaseURL + "/message/" + String(groupid), {
//                 "msgID": String(msgID),
//             }, {
//                 "headers": {
//                     "Authorization": `Bearer ${getUserSession()}`
//                 }
//             }) // 发送撤回消息请求
//             break
//         } catch (e) {
//             if (retry == 2) {
//                 return {
//                     "success": false,
//                     "error": true,
//                     "msg": i18n.t.Errorcode[101],
//                     "data": null
//                 }
//             }
//             console.log("[StealthIM]request retry: " + (retry + 1)) // 打印重试信息
//         }
//     }
//     if (resp.data?.result?.code != 800) { // 如果返回码不是成功
//         if (resp.data?.result?.code == 1403 || resp.data?.result?.code == 1402) {
//             return {
//                 "success": false,
//                 "error": false,
//                 "msg": i18n.t.Errorcode[resp.data.result.code],
//                 "data": null
//             }
//         }
//         if (resp.data?.result?.code != void 0) {
//             return {
//                 "success": false,
//                 "error": true,
//                 "msg": i18n.t.Errorcode[resp.data.result.code],
//                 "data": null
//             }
//         }
//         return {
//             "success": false,
//             "error": true,
//             "msg": i18n.t.Errorcode[101],
//             "data": null
//         }
//     }
//     return {
//         "success": true,
//         "error": false,
//         "msg": "",
//         "data": null
//     }
// }

/**
 * 拉取消息。
 * @param {number} groupid - 群组 ID。
 * @param {Function} [onSuccess=(close)=>{}] - 成功回调函数，参数为关闭函数。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function pullMessage(groupid, onSuccess = (close) => { }) {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    // var retx = (await runQuery("SELECT MAX(msg_id) AS mxid FROM msg WHERE group_id = ?", [groupid]))[0].mxid // 获取最大消息 ID
    // if (retx == null) {
    //     retx = 0
    // } else {
    //     retx = BigInt(retx)
    // }
    const sse = new SSEClient(BaseURL + "/message/" + String(groupid) + "?msgid=0&limit=64&sync=true", {
        "headers": {
            "Authorization": `Bearer ${getUserSession()}`
        }
    }) // 创建 SSE 客户端
    var closeflag = false
    var lastmsg = Number.MAX_SAFE_INTEGER
    var rets = await new Promise((resolve) => {
        onSuccess((data) => {
            resolve({
                "success": true,
                "error": false,
                "msg": "",
                "data": data
            })
        })
        sse.on('error', (err) => {
            closeflag = true
            resolve({
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[data.result.code],
                "data": null,
                "err": err
            })
        });
        var dataqueue = []
        sse.on("message", async (data) => {
            dataqueue.push(data)
        })
        // dataqueue处理
        async function runqueue() {
            while (true) {
                if (dataqueue.length == 0) {
                    if (closeflag) {
                        return
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    continue
                }
                await writedata(dataqueue.shift())
            }
        }
        runqueue()
        async function writedata(data) {
            var msgscache = {}
            data = JSON.parse(data.data)
            if (data.result.code != 800) {
                resolve({
                    "success": false,
                    "error": true,
                    "msg": i18n.t.Errorcode[data.result.code],
                    "data": null,
                    "err": err
                })
            }
            if (data.msg.length == 0) {
                return
            } else {
                await runQuery("UPDATE msg SET need_load = 0 WHERE msg_id = ?", [lastmsg])
                lastmsg = Number.MAX_SAFE_INTEGER
            }
            for (var i = 0; i < data.msg.length; i++) {
                var nowdata = data.msg[i];
                var needloadnow = 1
                if (Number(nowdata.msgid) > lastmsg) {
                    needloadnow = 0
                }
                // await runQuery("INSERT OR REPLACE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender, need_load) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [nowdata.groupid, nowdata.msg, (nowdata.time), (Number(nowdata.msgid)), nowdata.hash, nowdata.type, nowdata.username, needloadnow]) // 插入或替换消息到数据库
                msgscache[Number(nowdata.msgid)] = [nowdata.groupid, nowdata.msg, (nowdata.time), (Number(nowdata.msgid)), nowdata.hash, nowdata.type, nowdata.username, needloadnow]
                if (nowdata.msgid <= lastmsg) {
                    if (lastmsg != Number.MAX_SAFE_INTEGER) {
                        msgscache[lastmsg][7] = 0;
                        // await runQuery("UPDATE msg SET need_load = 0 WHERE msg_id = ?", [lastmsg]) // 插入或替换消息到数据库
                    }
                }
                lastmsg = Number(nowdata.msgid)
            }
            var fullsqlstr = "INSERT OR IGNORE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender, need_load) VALUES "
            var sqlfirstmsg = true
            var fullargs = []
            for (var i in msgscache) {
                if (sqlfirstmsg) {
                    sqlfirstmsg = false
                } else {
                    fullsqlstr = fullsqlstr + ","
                }
                fullsqlstr = fullsqlstr + "(?, ?, ?, ?, ?, ?, ?, ?)"
                fullargs = fullargs.concat(msgscache[i])
            }
            await runQuery(fullsqlstr, fullargs) // 插入或替换消息到数据库
            /*
                msg_id INTEGER PRIMARY KEY,
                group_id INTEGER,
                msg_content TEXT,
                msg_msgTime INTEGER,
                msg_uid INTEGER,
                msg_fileHash TEXT,
                msg_type INTEGER,
                msg_sender TEXT,
                sended INTEGER DEFAULT 0,
                need_load INTEGER DEFAULT 0
            */
            var ret = callback({
                "data": data.msg.map((x) => ({
                    "msg_id": x.msgid,
                    "group_id": x.groupid,
                    "msg_content": x.msg,
                    "msg_msgTime": x.time,
                    "msg_uid": x.uid,
                    "msg_fileHash": x.hash,
                    "msg_type": x.type,
                    "msg_sender": x.username,
                })),
                "groupid": groupid
            }) // 调用回调函数
            if (ret === false) {
                resolve({
                    "success": true,
                    "error": false,
                    "msg": "",
                    "data": null
                })
            }
        }

        sse.connect() // 连接 SSE
    })
    closeflag = true
    sse.close() // 关闭 SSE 连接
    return rets
}

/**
 * 搜索消息。
 * @param {number} groupid - 群组 ID。
 * @param {number} msgID - 消息 ID，-1 表示返回最新消息。
 * @param {number} [limit=128] - 限制返回的消息数量，最大 128。
 * @param {number} [offset=0] - 偏移量。
 * @param {string} [other_sql=""] - 其他 SQL 条件。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象，其中 data 包含 msg 和 need_request。
 */
export async function searchMessage(groupid, msgID, limit = 128, offset = 0, other_sql = "") {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof msgID != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (msgID < -1) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof limit != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (limit <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    limit = Math.min(limit, 128); // 限制最大 128
    if (typeof offset != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (offset < 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (other_sql != "") {
        other_sql = " AND " + other_sql
    }
    var ret = []
    if (msgID > 0) {
        ret = await runQuery("SELECT * FROM msg WHERE group_id = ? AND msg_id < ? " + other_sql + " ORDER BY msg_id DESC LIMIT ? OFFSET ?", [groupid, msgID, limit, offset]) // 根据消息 ID 搜索消息
    } else {
        ret = await runQuery("SELECT * FROM msg WHERE group_id = ? " + other_sql + " ORDER BY msg_id DESC LIMIT ? OFFSET ?", [groupid, limit, offset]) // 搜索所有消息（包括 msgID=-1 或 0）
    }
    // 过滤：从新到旧，直到 need_load=1 停止
    var filtered = []
    var stopped = false
    for (var i = 0; i < ret.length; i++) {
        filtered.push(ret[i])
        if (ret[i].need_load == 1) {
            stopped = true
            break
        }
    }
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": {
            "msg": filtered,
            "need_request": stopped
        }
    }
}

/**
 * 查询历史消息。
 * @param {number} groupid - 群组 ID。
 * @param {number} msgID - 起始消息 ID，从此 ID 开始向上查询历史消息。
 * @param {Function} [onSuccess=(close)=>{}] - 成功回调函数，参数为关闭函数。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function getHistory(groupid, msgID, useGlobalCallback = false) {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof msgID != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    const sse = new SSEClient(BaseURL + "/message/" + String(groupid) + "?msgid=" + String(msgID) + "&limit=128&sync=false", {
        "headers": {
            "Authorization": `Bearer ${getUserSession()}`
        }
    }, false) // 创建 SSE 客户端
    var dataqueue = []
    var closeflag = false
    var lastmsg = msgID
    var fullmsgs = []
    var rets = await new Promise((resolve) => {
        // onSuccess((data) => {
        //     resolve({
        //         "success": true,
        //         "error": false,
        //         "msg": "",
        //         "data": data
        //     })
        // })
        sse.on('error', (err) => {

            closeflag = true
            resolve({
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[101],
                "data": null,
                "err": err
            })
        });
        sse.on('end', (err) => {
            closeflag = true
        });
        sse.on("message", async (data) => {
            dataqueue.push(data)
        })
        // dataqueue处理
        async function runqueue() {
            while (true) {
                if (dataqueue.length == 0) {
                    if (closeflag) {
                        resolve({
                            "success": true,
                            "error": false,
                            "msg": "",
                            "data": fullmsgs
                        })
                        return
                    }
                    await new Promise((resolve) => setTimeout(resolve, 100))
                    continue
                }
                await writedata(dataqueue.shift())
            }
        }
        runqueue()
        async function writedata(data) {
            var msgscache = {}
            data = JSON.parse(data.data)
            if (data.result.code != 800) {
                resolve({
                    "success": false,
                    "error": true,
                    "msg": i18n.t.Errorcode[data.result.code],
                    "data": null,
                    "err": err
                })
            }
            if (data.msg.length == 0) {
                return
            } else {
                await runQuery("UPDATE msg SET need_load = 0 WHERE msg_id = ?", [msgID])
                lastmsg = Number.MAX_SAFE_INTEGER
            }
            for (var i = 0; i < data.msg.length; i++) {
                var nowdata = data.msg[i];
                var needloadnow = 1
                if (Number(nowdata.msgid) > lastmsg) {
                    needloadnow = 0
                }
                // await runQuery("INSERT OR REPLACE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender, need_load) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [nowdata.groupid, nowdata.msg, (nowdata.time), (Number(nowdata.msgid)), nowdata.hash, nowdata.type, nowdata.username, needloadnow]) // 插入或替换消息到数据库
                msgscache[Number(nowdata.msgid)] = [nowdata.groupid, nowdata.msg, (nowdata.time), (Number(nowdata.msgid)), nowdata.hash, nowdata.type, nowdata.username, needloadnow]
                if (nowdata.msgid <= lastmsg) {
                    if (lastmsg != Number.MAX_SAFE_INTEGER) {
                        msgscache[lastmsg][7] = 0;
                        // await runQuery("UPDATE msg SET need_load = 0 WHERE msg_id = ?", [lastmsg]) // 插入或替换消息到数据库
                    }
                }
                lastmsg = Number(nowdata.msgid)
            }
            var fullsqlstr = "INSERT OR IGNORE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender, need_load) VALUES "
            var sqlfirstmsg = true
            var fullargs = []
            for (var i in msgscache) {
                if (sqlfirstmsg) {
                    sqlfirstmsg = false
                } else {
                    fullsqlstr = fullsqlstr + ","
                }
                fullsqlstr = fullsqlstr + "(?, ?, ?, ?, ?, ?, ?, ?)"
                fullargs = fullargs.concat(msgscache[i])
            }
            await runQuery(fullsqlstr, fullargs) // 插入或替换消息到数据库
            /*
                msg_id INTEGER PRIMARY KEY,
                group_id INTEGER,
                msg_content TEXT,
                msg_msgTime INTEGER,
                msg_uid INTEGER,
                msg_fileHash TEXT,
                msg_type INTEGER,
                msg_sender TEXT,
                sended INTEGER DEFAULT 0,
                need_load INTEGER DEFAULT 0
            */
            if (useGlobalCallback) {
                var ret = callback({
                    "data": data.msg.map((x) => ({
                        "msg_id": x.msgid,
                        "group_id": x.groupid,
                        "msg_content": x.msg,
                        "msg_msgTime": x.time,
                        "msg_uid": x.uid,
                        "msg_fileHash": x.hash,
                        "msg_type": x.type,
                        "msg_sender": x.username,
                    })),
                    "groupid": groupid
                }) // 调用回调函数
                if (ret === false) {
                    resolve({
                        "success": true,
                        "error": false,
                        "msg": "",
                        "data": null
                    })
                }
            }
            fullmsgs.push(...data.msg.map((x) => ({
                "msg_id": x.msgid,
                "group_id": x.groupid,
                "msg_content": x.msg,
                "msg_msgTime": x.time,
                "msg_uid": x.uid,
                "msg_fileHash": x.hash,
                "msg_type": x.type,
                "msg_sender": x.username,
            })))
        }
        // sse.on("message", (data) => {
        //     data = JSON.parse(data.data)
        //     if (data.result.code != 800) {
        //         resolve({
        //             "success": false,
        //             "error": true,
        //             "msg": i18n.t.Errorcode[data.result.code],
        //             "data": null
        //         })
        //         return
        //     }
        //     for (var i = 0; i < data.msg.length; i++) {
        //         var nowdata = data.msg[i];
        //         ((function (nowdata) {
        //             runQuery("INSERT OR REPLACE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender, need_load) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [nowdata.groupid, nowdata.msg, (nowdata.time), (nowdata.msgid), nowdata.hash, nowdata.type, nowdata.username, 1]) // 插入或替换消息到数据库，need_load=1
        //         })(nowdata));
        //     }
        //     if (data.msg.length == 0) {
        //         resolve({
        //             "success": true,
        //             "error": false,
        //             "msg": "",
        //             "data": null
        //         })
        //         return
        //     }
        //     var mapped = data.msg.map((x) => ({
        //         "msg_id": x.msgid,
        //         "group_id": x.groupid,
        //         "msg_content": x.msg,
        //         "msg_msgTime": x.time,
        //         "msg_uid": x.uid,
        //         "msg_fileHash": x.hash,
        //         "msg_type": x.type,
        //         "msg_sender": x.username,
        //     }))
        //     var ret = callback({
        //         "data": mapped,
        //         "groupid": groupid
        //     }) // 调用回调函数
        //     if (ret === false) {
        //         resolve({
        //             "success": true,
        //             "error": false,
        //             "msg": "",
        //             "data": null
        //         })
        //     }
        //     // 如果需要继续监听，可不 resolve；假设单响应，resolve
        //     datas.push(mapped)
        // })
        // sse.on("close", () => {
        //     if (datas.length == 0) {
        //         // 将指定的消息标记为已加载
        //         runQuery("UPDATE msg SET need_load = 0 WHERE group_id = ? AND msg_id <= ?", [groupid, msgID])
        //     }
        //     resolve({
        //         "success": true,
        //         "error": false,
        //         "msg": "",
        //         "data": datas
        //     })
        // })
        sse.connect() // 连接 SSE
    })
    closeflag = true
    sse.close() // 关闭 SSE 连接
    return rets
}
