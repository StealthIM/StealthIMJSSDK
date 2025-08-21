import { runQuery } from '../database/db.mjs'
import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'

var userSession = "" // 用户会话
var userinfo = {} // 用户信息
var BaseURL = "" // 基础 URL

var userToNameTable = {} // 用户名到昵称的映射表

/**
 * 初始化用户模块。
 * 从数据库加载用户昵称映射表，并设置定时任务随机获取其他用户信息。
 */
export async function init() {
    var ret = await runQuery("SELECT * FROM `users`") // 查询所有用户
    for (var i = 0; i < ret.length; i++) {
        userToNameTable[ret[i].username] = ret[i].nickname // 填充用户昵称映射表
    }
    setInterval(async () => {
        // 使用sql随机选择用户
        var ret = await runQuery("SELECT * FROM `users` ORDER BY RANDOM() LIMIT 1") // 随机选择一个用户
        if (ret.length == 0) {
            return
        }
        await getOtherUserInfo(ret[0].username) // 获取其他用户信息
    }, 32000); // 每32秒执行一次
}

/**
 * 设置基础 URL。
 * @param {string} BaseURLx - 基础 URL。
 */
export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

/**
 * 使用会话登录。
 * @param {string} [session=""] - 用户会话。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function loginWithSession(session = "") {
    if (session == "") {
        var ret = await runQuery("SELECT `value` FROM `config` WHERE `key` = \"session\"") // 从配置中获取会话
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
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.get(BaseURL + "/user", {
                "headers": {
                    "Authorization": `Bearer ${session}`
                }
            }) // 发送获取用户信息的请求
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
    userinfo = resp.data?.user_info // 更新用户信息
    userSession = session // 更新用户会话
    userToNameTable[userinfo.username] = userinfo.nickname // 更新用户昵称映射表
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

/**
 * 使用用户名和密码登录。
 * @param {string} username - 用户名。
 * @param {string} password - 密码。
 * @param {boolean} [remember=true] - 是否记住会话。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function login(username, password, remember = true) {
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/user", {
                "username": username,
                "password": password
            }, {}) // 发送登录请求
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
    userSession = resp.data?.session // 更新用户会话
    userinfo = resp.data?.user_info // 更新用户信息
    if (remember) {
        runQuery("INSERT OR REPLACE INTO `config` (`key`, `value`) VALUES('session',?);", [userSession]) // 如果记住会话，则保存到数据库
    }

    userToNameTable[userinfo.username] = userinfo.nickname // 更新用户昵称映射表
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

/**
 * 获取当前用户信息。
 * @returns {Promise<Object>} - 包含 success, error, msg, data, session 的结果对象。
 */
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


/**
 * 注册新用户。
 * @param {string} username - 用户名。
 * @param {string} password - 密码。
 * @param {string} nickname - 昵称。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function register(username, password, nickname) {
    if (typeof username != "string" || typeof password != "string" || typeof nickname != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/user/register", {
                "username": username,
                "password": password,
                "nickname": nickname
            }, {}) // 发送注册请求
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

/**
 * 删除用户账户。
 * @param {boolean} [sure=false] - 确认删除。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 * @throws {Error} 如果 sure 为 false，则抛出错误。
 */
export async function deleteUser(sure = false) {
    if (!sure) {
        throw new Error("Please confirm to delete your account"); // 抛出确认删除错误
        return
    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.delete(BaseURL + "/user", {
                "headers": {
                    "Authorization": `Bearer ${userSession}`
                }
            }) // 发送删除用户请求
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
            console.log("[StealthIM]request retry: " + (retry + 1)) // 打印重试信息
        }
    }
    if (resp.data?.result?.code != 800) { // 如果返回码不是成功
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
 * 更改用户数据。
 * @param {Object} data - 包含要更改的用户数据的对象（nickname, password, phone_number, email）。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function changeUserData(data) {
    var nickname = data?.nickname
    var password = data?.password
    var phonenum = data?.phone_number
    var email = data?.email
    /**
     * 调用 API 更改用户数据。
     * @param {string} keyname - 要更改的字段名。
     * @param {string} val - 字段的新值。
     * @returns {Promise<Object>} - 包含 success, error, msg, data, step 的结果对象。
     */
    async function callAPI(keyname, val) {
        for (var retry = 0; retry < 3; retry++) { // 重试机制
            try {
                var obj = {}
                if (keyname == "phone") {
                    obj["phone_number"] = val
                } else {
                    obj[keyname] = val
                }
                var resp = await axios.patch(BaseURL + "/user/" + keyname, obj, {
                    "headers": {
                        "Authorization": `Bearer ${userSession}`
                    }
                }) // 发送 PATCH 请求更改用户数据
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
                console.log("[StealthIM]request retry: " + (retry + 1)) // 打印重试信息
            }
        }
        if (resp.data?.result?.code != 800) { // 如果返回码不是成功
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
        ret = await callAPI("nickname", nickname) // 更改昵称
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof email == "string" && email.length > 0) {
        ret = await callAPI("email", email) // 更改邮箱
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof password == "string" && password.length > 0) {
        ret = await callAPI("password", password) // 更改密码
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof phonenum == "string" && phonenum.length > 0) {
        ret = await callAPI("phone", phonenum) // 更改手机号
        if (ret.success == false) {
            return ret
        }
    }
    ret = await loginWithSession(userSession) // 刷新会话
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

/**
 * 获取用户昵称。
 * @param {string} username - 用户名。
 * @returns {Promise<string|undefined>} - 用户昵称或 undefined。
 */
export async function getUserNickname(username) {
    var ret = (userToNameTable[username]) // 从缓存中获取昵称
    if (ret != void 0) {
        return ret
    }
    ret = (await getOtherUserInfo(username)) // 从服务器获取昵称
    return ret.data?.nickname
}

/**
 * 获取其他用户信息。
 * @param {string} username - 其他用户的用户名。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
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
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.get(BaseURL + "/user/" + username, {
                "headers": {
                    "Authorization": `Bearer ${userSession}`
                }
            }) // 发送获取其他用户信息请求
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
    userToNameTable[username] = resp.data.user_info.nickname // 更新用户昵称映射表
    runQuery("INSERT OR REPLACE INTO `users` (username, nickname) VALUES (?, ?)", [username, resp.data.user_info.nickname]) // 保存到数据库
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": resp.data.user_info
    }
}

/**
 * 获取用户会话。
 * @returns {string} - 用户会话。
 * @throws {Error} 如果用户未登录，则抛出错误。
 */
export function getUserSession() {
    if (userSession == "") {
        throw new Error("Please login before calling this function"); // 抛出未登录错误
    }
    return userSession
}

/**
 * 登出用户。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function logout() {
    await runQuery("INSERT OR REPLACE INTO `config` (`key`, `value`) VALUES('session',?);", [""]) // 清除数据库中的会话
    userSession = "" // 清空用户会话
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}
