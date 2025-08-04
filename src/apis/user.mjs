import { runQuery } from '../database/db.mjs'
import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'

var userSession = ""
var userinfo = {}
var BaseURL = ""

var userToNameTable = {}

export async function init() {
    var ret = await runQuery("SELECT * FROM `users`")
    for (var i = 0; i < ret.length; i++) {
        userToNameTable[ret[i].username] = ret[i].nickname
    }
    setInterval(async () => {
        // 使用sql随机选择用户
        var ret = await runQuery("SELECT * FROM `users` ORDER BY RANDOM() LIMIT 1")
        if (ret.length == 0) {
            return
        }
        await getOtherUserInfo(ret[0].username)
    }, 32000);
}

export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

export async function loginWithSession(session = "") {
    if (session == "") {
        var ret = await runQuery("SELECT `value` FROM `config` WHERE `key` = \"session\"")
        if (ret.length == 0) {
            return {
                "success": false,
                "error": false,
                "msg": i18n.t.Errorcode[1502],
                "data": null
            }
        }
        if (ret[0]['value'] == "") {
            return {
                "success": false,
                "error": false,
                "msg": i18n.t.Errorcode[1502],
                "data": null
            }
        }
        session = ret[0]['value']
    }
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.get(BaseURL + "/user", {
                "headers": {
                    "Authorization": `Bearer ${session}`
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
        if (resp.data?.result?.code == 1502) {
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
    userinfo = resp.data?.user_info
    userSession = session
    userToNameTable[userinfo.username] = userinfo.nickname
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

export async function login(username, password, remember = true) {
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/user", {
                "username": username,
                "password": password
            }, {})
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
        if (resp.data?.result?.code == 1201 || resp.data?.result?.code == 1203 || resp.data?.result?.code == 1204 || resp.data?.result?.code == 1205) {
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
    userSession = resp.data?.session
    userinfo = resp.data?.user_info
    if (remember) {
        runQuery("INSERT OR REPLACE INTO `config` (`key`, `value`) VALUES('session',?);", [userSession])
    }

    userToNameTable[userinfo.username] = userinfo.nickname
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

export async function getUserInfo() {
    if (userSession == "") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[102],
            "data": null
        }
    }
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": userinfo,
        "session": userSession
    }
}


export async function register(username, password, nickname) {
    if (typeof username != "string" || typeof password != "string" || typeof nickname != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/user/register", {
                "username": username,
                "password": password,
                "nickname": nickname
            }, {})
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
        if (resp.data?.result?.code == 1202 || resp.data?.result?.code == 1203 || resp.data?.result?.code == 1204 || resp.data?.result?.code == 1205) {
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

export async function deleteUser(sure = false) {
    if (!sure) {
        throw new Error("Please confirm to delete your account");
        return
    }
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.delete(BaseURL + "/user", {
                "headers": {
                    "Authorization": `Bearer ${userSession}`
                }
            })
            break
        } catch (e) {
            if (retry == 2) {
                return {
                    "success": false,
                    "error": true,
                    "msg": i18n.t.Errorcode[101],
                    "data": null,
                    "error": e
                }
            }
            console.log("[StealthIM]request retry: " + (retry + 1))
        }
    }
    if (resp.data?.result?.code != 800) {
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

export async function changeUserData(data) {
    var nickname = data?.nickname
    var password = data?.password
    var phonenum = data?.phone_number
    var email = data?.email
    async function callAPI(keyname, val) {
        for (var retry = 0; retry < 3; retry++) {
            try {
                var obj = {}
                obj[keyname] = val
                var resp = await axios.patch(BaseURL + "/user/" + keyname, obj, {
                    "headers": {
                        "Authorization": `Bearer ${userSession}`
                    }
                })
                break
            } catch (e) {
                if (retry == 2) {
                    return {
                        "success": false,
                        "error": true,
                        "msg": i18n.t.Errorcode[101],
                        "data": null,
                        "error": e,
                        "step": keyname
                    }
                }
                console.log("[StealthIM]request retry: " + (retry + 1))
            }
        }
        if (resp.data?.result?.code != 800) {
            if (resp.data?.result?.code != void 0) {
                return {
                    "success": false,
                    "error": true,
                    "msg": i18n.t.Errorcode[resp.data.result.code],
                    "data": null,
                    "step": keyname
                }
            }
            return {
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[101],
                "data": null,
                "step": keyname
            }
        }
        return {
            "success": true,
        }
    }
    var ret;
    if (typeof nickname == "string" && nickname.length > 0) {
        ret = await callAPI("nickname", nickname)
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof email == "string" && email.length > 0) {
        ret = await callAPI("email", email)
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof password == "string" && password.length > 0) {
        ret = await callAPI("password", password)
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof phonenum == "string" && phonenum.length > 0) {
        ret = await callAPI("phone_number", phonenum)
        if (ret.success == false) {
            return ret
        }
    }
    ret = await loginWithSession(userSession)
    if (ret.success == false) {
        return {
            "success": false,
            "error": ret.error,
            "msg": ret.msg,
            "data": ret.msg,
            "step": "refresh"
        }
    }
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

export async function getUserNickname(username) {
    var ret = (userToNameTable[username])
    if (ret != void 0) {
        return ret
    }
    ret = (await getOtherUserInfo(username))
    return ret.data?.nickname
}

export async function getOtherUserInfo(username) {
    if (typeof username != "string" || username.length == 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (/^[a-zA-Z0-9_]+$/.test(username) == false) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.get(BaseURL + "/user/" + username, {
                "headers": {
                    "Authorization": `Bearer ${userSession}`
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
        if (resp.data?.result?.code == 1201 || resp.data?.result?.code == 1204 || resp.data?.result?.code == 1205) {
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
    userToNameTable[username] = resp.data.user_info.nickname
    runQuery("INSERT OR REPLACE INTO `users` (username, nickname) VALUES (?, ?)", [username, resp.data.user_info.nickname])
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": resp.data.user_info
    }
}

export function getUserSession() {
    if (userSession == "") {
        throw new Error("Please login before calling this function");
    }
    return userSession
}

export async function logout() {
    await runQuery("INSERT OR REPLACE INTO `config` (`key`, `value`) VALUES('session',?);", [""])
    userSession = ""
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}
