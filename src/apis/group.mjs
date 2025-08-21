import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'
import { getUserSession } from './user.mjs'
import { runQuery } from '../database/db.mjs'

var BaseURL = "" // 基础 URL
var groupUpdateLock = false; // 定义群组更新锁变量

/**
 * 辅助函数：等待并获取群组更新锁。
 */
async function acquireGroupUpdateLock() {
    while (groupUpdateLock) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 等待100毫秒后重试
    }
    groupUpdateLock = true;
}

/**
 * 设置基础 URL。
 * @param {string} BaseURLx - 基础 URL。
 */
export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

var groupCallback = () => { } // 群组回调函数

/**
 * 设置群组回调函数。
 * @param {Function} callback - 回调函数。
 */
export function setGroupCallback(callback) {
    groupCallback = callback
}

var groupLst = new Map() // 群组列表缓存

/**
 * 更新群组空名称。
 * 随机选择一个名称为空的群组或随机群组，获取其公开信息并更新名称。
 */
export async function updateGroupNullName() {
    await acquireGroupUpdateLock(); // 等待并获取锁
    try {
        let groupsToUpdate = await runQuery("SELECT groupid FROM `groups` WHERE name = '' ORDER BY RANDOM() LIMIT 1"); // 查询名称为空的群组

        if (groupsToUpdate.length === 0) {
            // 如果没有名称为空的群组，则随机获取一个有名称的群组
            groupsToUpdate = await runQuery("SELECT groupid FROM `groups` ORDER BY RANDOM() LIMIT 1"); // 随机获取一个群组
        }

        for (var i = 0; i < groupsToUpdate.length; i++) {
            const groupid = groupsToUpdate[i].groupid;
            const publicInfo = await getGroupPublicInfo(groupid); // 获取群组公开信息

            if (publicInfo.success && publicInfo.data?.name) {
                const newName = publicInfo.data.name;
                await runQuery("UPDATE `groups` SET name = ? WHERE groupid = ?", [newName, groupid]); // 更新群组名称
                groupLst.set(groupid, {
                    "name": newName
                })
            } else {
                console.warn(`[StealthIM] Failed to get public info for group ${groupid} or name is missing. Ignoring error.`); // 获取公开信息失败或名称缺失
            }
            groupCallback() // 调用群组回调函数
        }
    } catch (e) {
        console.error("[StealthIM] Error in updateGroupNullName:", e); // 更新群组空名称错误
    } finally {
        await loadGroupsCache(); // 重新加载群组缓存
        groupUpdateLock = false; // 释放锁
    }
}


/**
 * 加载群组缓存。
 * 从数据库加载所有群组信息到内存缓存。
 */
export async function loadGroupsCache() {
    var ret = await runQuery("SELECT * FROM `groups`") // 查询所有群组
    for (var i = 0; i < ret.length; i++) {
        groupLst.set(ret[i].groupid, {
            "name": ret[i].name
        })
    }
}


/**
 * 初始化群组模块。
 * 加载群组缓存，并设置定时任务刷新群组和更新空名称群组。
 */
export async function init() {
    console.log("[StealthIM]init groups thread") // 初始化群组线程
    await loadGroupsCache() // 加载群组缓存
    setInterval(async () => {
        console.log("[StealthIM]auto refersh groups start") // 自动刷新群组开始
        await refreshGroups() // 刷新群组
        console.log("[StealthIM]auto refersh groups finish") // 自动刷新群组完成
    }, 60000) // 每60秒刷新一次
    setInterval(async () => {
        await updateGroupNullName() // 更新空名称群组
    }, 10000) // 每10秒更新一次
}

/**
 * 刷新群组列表。
 * 从服务器获取最新群组列表，并与本地数据库进行差分同步。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function refreshGroups() {
    await acquireGroupUpdateLock(); // 等待并获取锁
    try {
        for (var retry = 0; retry < 3; retry++) { // 重试机制
            try {
                var resp = await axios.get(BaseURL + "/group", {
                    "headers": {
                        "Authorization": `Bearer ${getUserSession()}`
                    }
                }) // 发送获取群组列表请求
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
        // 在这里实现差分改动入数据库
        const newGroupIds = new Set(resp.data.groups); // 服务器返回的群组ID列表
        const oldGroupsMap = new Map(groupLst) // 旧的群组缓存

        // 处理新增
        for (const groupid of newGroupIds) {
            if (!oldGroupsMap.has(groupid)) {
                // 新增群组，name 设置为空字符串
                await runQuery("INSERT INTO `groups` (groupid, name) VALUES (?, ?)", [groupid, ""]); // 插入新群组
                groupLst.set(groupid, {
                    "name": ""
                })
            }
            // 对于已存在的群组，不进行name的覆盖更新，因为resp.data.groups不包含name
        }

        // 处理删除
        for (const [groupid, oldGroup] of oldGroupsMap.entries()) {
            if (!newGroupIds.has(groupid)) {
                // 删除群组
                await runQuery("DELETE FROM `groups` WHERE groupid = ?", [groupid]); // 删除群组
                groupLst.delete(groupid)
            }
        }

        // 更新本地缓存
        // 由于resp.data.groups只包含groupid，我们需要重新从数据库加载完整的群组信息来更新缓存
        await loadGroupsCache(); // 重新加载缓存以获取完整的群组信息

        return {
            "success": true,
            "error": false,
            "msg": "",
            "data": resp.data.groups
        }
    } finally {
        groupUpdateLock = false; // 释放锁
    }
}


/**
 * 获取群组信息。
 * @param {number} groupid - 群组 ID。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function getGroupInfo(groupid) {
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
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.get(BaseURL + "/group/" + String(groupid), {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送获取群组信息请求
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
        "data": resp.data.members
    }
}

/**
 * 获取群组列表。
 * @returns {Promise<Map>} - 群组列表 Map。
 */
export async function getGroups() {
    while (groupUpdateLock) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 等待100毫秒后重试
    }
    return groupLst
}

/**
 * 获取群组公开信息。
 * @param {number} groupid - 群组 ID。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function getGroupPublicInfo(groupid) {
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
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.get(BaseURL + "/group/" + String(groupid) + "/public", {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送获取群组公开信息请求
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
        "data": {
            "name": resp.data.name,
            "create_at": resp.data.create_at,
        }
    }
}

/**
 * 创建群组。
 * @param {string} name - 群组名称。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function createGroup(name) {
    if (typeof name != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (name == "") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/group", {
                "name": name
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送创建群组请求
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
    refreshGroups() // 刷新群组列表
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

/**
 * 加入群组。
 * @param {number} groupid - 群组 ID。
 * @param {string} [password=""] - 群组密码。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function joinGroup(groupid, password = "") {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof password != "string") {
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
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/group/" + String(groupid) + "/join", {
                "password": password
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送加入群组请求
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
    refreshGroups() // 刷新群组列表
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

/**
 * 邀请用户加入群组。
 * @param {number} groupid - 群组 ID。
 * @param {string} username - 被邀请的用户名。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function inviteToGroup(groupid, username) {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof username != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (username == "") {
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
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/group/" + String(groupid) + "/invite", {
                "username": username
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送邀请用户请求
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
        if (resp.data?.result?.code == 1403 || resp.data?.result?.code == 1402 || resp.data?.result?.code == 1405) {
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
 * 用户等级枚举。
 * @readonly
 * @enum {number}
 */
export const UserLevel = {
    Member: 0, // 成员
    Manager: 1, // 管理员
    Owner: 2 // 群主
}

/**
 * 设置用户在群组中的等级。
 * @param {number} groupid - 群组 ID。
 * @param {string} username - 用户名。
 * @param {number} level - 用户等级（0: 成员, 1: 管理员, 2: 群主）。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function setUserLevel(groupid, username, level) {
    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof username != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof level != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (username == "") {
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
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (!(level >= 0 && level <= 2)) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.put(BaseURL + "/group/" + String(groupid) + "/" + username, {
                "type": level
            }, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送设置用户等级请求
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
        if (resp.data?.result?.code == 1403 || resp.data?.result?.code == 1402 || resp.data?.result?.code == 1404) {
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
 * 将用户踢出群组。
 * @param {number} groupid - 群组 ID。
 * @param {string} username - 被踢出的用户名。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function kickUser(groupid, username) {

    if (typeof groupid != "number") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (typeof username != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (username == "") {
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
    if (groupid <= 0) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.delete(BaseURL + "/group/" + String(groupid) + "/" + username, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送踢出用户请求
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
        if (resp.data?.result?.code == 1402 || resp.data?.result?.code == 1403 || resp.data?.result?.code == 1404) {
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
 * 更改群组数据。
 * @param {number} groupid - 群组 ID。
 * @param {Object} data - 包含要更改的群组数据的对象（name, password）。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function changeGroupData(groupid, data) {
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
    var name = data?.name
    var password = data?.password
    /**
     * 调用 API 更改群组数据。
     * @param {string} keyname - 要更改的字段名。
     * @param {string} val - 字段的新值。
     * @returns {Promise<Object>} - 包含 success, error, msg, data, step 的结果对象。
     */
    async function callAPI(keyname, val) {
        for (var retry = 0; retry < 3; retry++) { // 重试机制
            try {
                var obj = {}
                obj[keyname] = val
                var resp = await axios.patch(BaseURL + "/group/" + String(groupid) + "/" + keyname, obj, {
                    "headers": {
                        "Authorization": `Bearer ${getUserSession()}`
                    }
                }) // 发送 PATCH 请求更改群组数据
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
    if (typeof name == "string" && name.length > 0) {
        ret = await callAPI("name", name) // 更改群组名称
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof password == "string" && password.length >= 0) {
        ret = await callAPI("password", password) // 更改群组密码
        if (ret.success == false) {
            return ret
        }
    }
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}
