import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'
import { getUserSession } from './user.mjs'
import SSEClient from '../sse/sse.cjs'
import { runQuery } from '../database/db.mjs'

var BaseURL = ""

var callback = () => { }

export function setMsgCallback(cb) {
    callback = cb
}

export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

export const msgType = {
    Text: 0,
    Image: 1,
    LargeEmoji: 2,
    Emoji: 3,
    File: 4,
    Card: 5,
    InnerLink: 6,
    Recall: 16
}

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

    var retx = (await runQuery("SELECT MAX(msg_id) AS mxid FROM msg WHERE group_id = ?", [groupid]))[0].mxid
    if (retx == null) {
        retx = 0
    } else {
        retx = BigInt(retx)
    }

    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/message/" + String(groupid), {
                "msg": content,
                "type": contentType
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            })
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
            console.log("[StealthIM]request retry: " + (retry + 1))
        }
    }
    if (resp.data?.result?.code != 800) {
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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.patch(BaseURL + "/message/" + String(groupid), {
                "msgID": String(msgID),
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            })
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
            console.log("[StealthIM]request retry: " + (retry + 1))
        }
    }
    if (resp.data?.result?.code != 800) {
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
    var retx = (await runQuery("SELECT MAX(msg_id) AS mxid FROM msg WHERE group_id = ?", [groupid]))[0].mxid
    if (retx == null) {
        retx = 0
    } else {
        retx = BigInt(retx)
    }
    const sse = new SSEClient(BaseURL + "/message/" + String(groupid) + "?msgid=" + String(retx), {
        "headers": {
            "Authorization": `Bearer ${getUserSession()}`
        }
    })
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
                    "data": null
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
                    runQuery("INSERT OR REPLACE INTO msg (group_id, msg_content, msg_msgTime, msg_id, msg_fileHash, msg_type, msg_sender) VALUES (?, ?, ?, ?, ?, ?, ?)", [nowdata.groupid, nowdata.msg, (nowdata.time), (nowdata.msgid), nowdata.hash, nowdata.type, nowdata.username])
                })(nowdata));
            }
            if (data.msg.length == 0) {
                return
            }
            var ret = callback({
                "data": data,
                "groupid": groupid
            })
            if (ret === false) {
                resolve({
                    "success": true,
                    "error": false,
                    "msg": "",
                    "data": null
                })
            }
        })
        sse.connect()
    })
    sse.close()
    return rets
}
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
        ret = await runQuery("SELECT * FROM msg WHERE group_id = ? AND msg_id " + compare + " ? " + other_sql + " ORDER BY msg_id DESC LIMIT ? OFFSET ?", [groupid, msgID, limit, offset])
    } else {
        ret = await runQuery("SELECT * FROM msg WHERE group_id = ? " + other_sql + " ORDER BY msg_id DESC LIMIT ? OFFSET ?", [groupid, limit, offset])
    }
    return ret
}
