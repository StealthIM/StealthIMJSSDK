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

    var retx = (await runQuery("SELECT MAX(msg_id) AS mxid FROM msg WHERE group_id = ?", [groupid]))[0].mxid // 获取最大消息 ID
    if (retx == null) {
        retx = 0
    } else {
        retx = BigInt(retx)
    }

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
/**
 * 撤回消息。
 * @param {number} groupid - 群组 ID。
 * @param {number} msgID - 消息 ID。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function recallMessage(groupid, msgID) {
    if (typeof groupid != "number") {
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
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (msgID <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }

    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.patch(BaseURL + "/message/" + String(groupid), {
                "msgID": String(msgID),
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送撤回消息请求
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
    var retx = (await runQuery("SELECT MAX(msg_id) AS mxid FROM msg WHERE group_id = ?", [groupid]))[0].mxid // 获取最大消息 ID
    if (retx == null) {
        retx = 0
    } else {
        retx = BigInt(retx)
    }
    const sse = new SSEClient(BaseURL + "/message/" + String(groupid) + "?msgid=" + String(retx), {
        "headers": {
            "Authorization": `Bearer ${getUserSession()}`
        }
    }) // 创建 SSE 客户端
    var rets = await new Promise((resolve) => {
        onSuccess((data) => {
            resolve({
                "success": true,
                "error": false,
                "msg": "",
                "data": data
            })
        })
        sse.on("message", (data) => {
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
            sse.on('error', (err) => {
                resolve({
                    "success": false,
                    "error": true,
                    "msg": i18n.t.Errorcode[data.result.code],
                    "data": null,
                    "err": err
                })
            });
            for (var i = 0; i < data.msg.length; i++) {
                var nowdata = data.msg[i];
                ((function (nowdata) {
                    runQuery("INSERT OR REPLACE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender) VALUES (?, ?, ?, ?, ?, ?, ?)", [nowdata.groupid, nowdata.msg, (nowdata.time), (nowdata.msgid), nowdata.hash, nowdata.type, nowdata.username]) // 插入或替换消息到数据库
                })(nowdata));
            }
            if (data.msg.length == 0) {
                return
            }
            var ret = callback({
                "data": data,
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
        })
        sse.connect() // 连接 SSE
    })
    sse.close() // 关闭 SSE 连接
    return rets
}

/**
 * 搜索消息。
 * @param {number} groupid - 群组 ID。
 * @param {number} msgID - 消息 ID。
 * @param {number} [limit=1000] - 限制返回的消息数量。
 * @param {number} [offset=0] - 偏移量。
 * @param {string} [other_sql=""] - 其他 SQL 条件。
 * @param {string} [compare="<"] - 比较操作符（例如 "<" 或 ">"）。
 * @returns {Promise<Array>} - 消息数组。
 */
export async function searchMessage(groupid, msgID, limit = 1000, offset = 0, other_sql = "", compare = "<") {
    if (typeof groupid != "number") {
        return []
    }
    if (groupid <= 0) {
        return []
    }
    if (typeof msgID != "number") {
        return []
    }
    if (msgID < 0) {
        return []
    }
    if (typeof limit != "number") {
        return []
    }
    if (limit <= 0) {
        return []
    }
    if (typeof offset != "number") {
        return []
    }
    if (offset < 0) {
        return []
    }
    if (other_sql != "") {
        other_sql = " AND " + other_sql
    }
    var ret = []
    if (msgID != 0) {
        ret = await runQuery("SELECT * FROM msg WHERE group_id = ? AND msg_id " + compare + " ? " + other_sql + " ORDER BY msg_id DESC LIMIT ? OFFSET ?", [groupid, msgID, limit, offset]) // 根据消息 ID 搜索消息
    } else {
        ret = await runQuery("SELECT * FROM msg WHERE group_id = ? " + other_sql + " ORDER BY msg_id DESC LIMIT ? OFFSET ?", [groupid, limit, offset]) // 搜索所有消息
    }
    return ret
}
