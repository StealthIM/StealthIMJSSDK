import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'
import { getUserSession } from './user.mjs'
import { runQuery } from '../database/db.mjs'

var BaseURL = ""
var groupUpdateLock = false; // 定义锁变量

// 辅助函数：等待并获取锁
async function acquireGroupUpdateLock() {
    while (groupUpdateLock) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 等待100毫秒后重试
    }
    groupUpdateLock = true;
}

export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

var groupCallback = () => { }

export function setGroupCallback(callback) {
    groupCallback = callback
}

var groupLst = new Map()

export async function updateGroupNullName() {
    await acquireGroupUpdateLock(); // 等待并获取锁
    try {
        let groupsToUpdate = await runQuery("SELECT groupid FROM `groups` WHERE name = '' ORDER BY RANDOM() LIMIT 1");

        if (groupsToUpdate.length === 0) {
            // 如果没有名称为空的群组，则随机获取一个有名称的群组
            groupsToUpdate = await runQuery("SELECT groupid FROM `groups` ORDER BY RANDOM() LIMIT 1");
        }

        for (var i = 0; i < groupsToUpdate.length; i++) {
            const groupid = groupsToUpdate[i].groupid;
            const publicInfo = await getGroupPublicInfo(groupid);

            if (publicInfo.success && publicInfo.data?.name) {
                const newName = publicInfo.data.name;
                await runQuery("UPDATE `groups` SET name = ? WHERE groupid = ?", [newName, groupid]);
                groupLst.set(groupid, {
                    "name": newName
                })
            } else {
                console.warn(`[StealthIM] Failed to get public info for group ${groupid} or name is missing. Ignoring error.`);
            }
            groupCallback()
        }
    } catch (e) {
        console.error("[StealthIM] Error in updateGroupNullName:", e);
    } finally {
        await loadGroupsCache();
        groupUpdateLock = false;
    }
}


export async function loadGroupsCache() {
    var ret = await runQuery("SELECT * FROM `groups`")
    for (var i = 0; i < ret.length; i++) {
        groupLst.set(ret[i].groupid, {
            "name": ret[i].name
        })
    }
}


export async function init() {
    console.log("[StealthIM]init groups thread")
    await loadGroupsCache()
    setInterval(async () => {
        console.log("[StealthIM]auto refersh groups start")
        await refreshGroups()
        console.log("[StealthIM]auto refersh groups finish")
    }, 60000)
    setInterval(async () => {
        await updateGroupNullName()
    }, 10000)
}

export async function refreshGroups() {
    await acquireGroupUpdateLock(); // 等待并获取锁
    try {
        for (var retry = 0; retry < 3; retry++) {
            try {
                var resp = await axios.get(BaseURL + "/group", {
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
        // 在这里实现差分改动入数据库
        const newGroupIds = new Set(resp.data.groups); // 服务器返回的群组ID列表
        const oldGroupsMap = new Map(groupLst)

        // 处理新增
        for (const groupid of newGroupIds) {
            if (!oldGroupsMap.has(groupid)) {
                // 新增群组，name 设置为空字符串
                await runQuery("INSERT INTO `groups` (groupid, name) VALUES (?, ?)", [groupid, ""]);
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
                await runQuery("DELETE FROM `groups` WHERE groupid = ?", [groupid]);
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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.get(BaseURL + "/group/" + String(groupid), {
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
        "data": resp.data.members
    }
}

export async function getGroups() {
    while (groupUpdateLock) {
        await new Promise(resolve => setTimeout(resolve, 100)); // 等待100毫秒后重试
    }
    return groupLst
}

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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.get(BaseURL + "/group/" + String(groupid) + "/public", {
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
        "data": {
            "name": resp.data.name,
            "create_at": resp.data.create_at,
        }
    }
}

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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/group", {
                "name": name
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
    refreshGroups()
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/group/" + String(groupid) + "/join", {
                "password": password
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
    refreshGroups()
    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }
}

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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/group/" + String(groupid) + "/invite", {
                "username": username
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

export const UserLevel = {
    Member: 0,
    Manager: 1,
    Owner: 2
}

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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.put(BaseURL + "/group/" + String(groupid) + "/" + username, {
                "type": level
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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.delete(BaseURL + "/group/" + String(groupid), {
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
    async function callAPI(keyname, val) {
        for (var retry = 0; retry < 3; retry++) {
            try {
                var obj = {}
                obj[keyname] = val
                var resp = await axios.patch(BaseURL + "/group/" + String(groupid) + "/" + keyname, obj, {
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
    if (typeof name == "string" && name.length > 0) {
        ret = await callAPI("name", name)
        if (ret.success == false) {
            return ret
        }
    }
    if (typeof password == "string" && password.length >= 0) {
        ret = await callAPI("password", password)
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
