import { initializeDatabase } from './database/db.mjs'
import { createTable } from './database/create.mjs'
import { loadi18n } from './i18n/load.mjs'

import { loginWithSession, login, getUserInfo, register, deleteUser, changeUserData, getUserNickname, setBaseURL as setBaseURLUser, init as initUsr } from './apis/user.mjs'

import { setGroupCallback, refreshGroups, getGroupInfo, getGroupPublicInfo, createGroup, joinGroup, inviteToGroup, setUserLevel, kickUser, changeGroupData, setBaseURL as setBaseURLGrp, init as initGrp } from './apis/group.mjs'

import { setMsgCallback, searchMessage, sendMessage, recallMessage, pullMessage, setBaseURL as setBaseURLMsg } from './apis/msg.mjs'

import { getFileInfo, uploadFile, downloadFile, setBaseURL as setBaseURLFile } from './apis/file.mjs'

export async function init(baseurl = "127.0.0.1:8089", DBPathOnNode = ".stim/stim-%.db", DBNameOnWeb = "stim-%", Language = "zh-cn") {
    setBaseURLUser(baseurl)
    setBaseURLGrp(baseurl)
    setBaseURLMsg(baseurl)
    setBaseURLFile(baseurl)
    if (typeof window === 'undefined') {
        const fs = await import('fs');
        const path = await import('path');
        const os = await import('os');

        var BaseURL = baseurl;

        await new Promise((resolve, reject) => {
            let resolvedDbPath = DBPathOnNode;
            if (DBPathOnNode.startsWith('~')) {
                resolvedDbPath = path.join(os.homedir(), DBPathOnNode.slice(1));
            }
            if (resolvedDbPath.includes('%')) {
                resolvedDbPath = resolvedDbPath.replace('%', BaseURL.replaceAll("/", "-"));
            }
            fs.mkdir(path.dirname(resolvedDbPath), { recursive: true }, function (err) {
                if (err) {
                    reject(err)
                }
                resolve()
            })
        })
    }
    await loadi18n(Language)
    await initializeDatabase(DBPathOnNode, DBNameOnWeb, baseurl)
    await createTable()
    console.log("[StealthIM]Initialized")
}


export const user = {
    loginWithSession: loginWithSession,
    login: login,
    getUserInfo: getUserInfo,
    register: register,
    deleteUser: deleteUser,
    changeUserData: changeUserData,
    getUserNickname: getUserNickname
}

export const group = {
    refershGroups: refreshGroups,
    getGroupInfo: getGroupInfo,
    getGroupPublicInfo: getGroupPublicInfo,
    createGroup: createGroup,
    joinGroup: joinGroup,
    inviteToGroup: inviteToGroup,
    setUserLevel: setUserLevel,
    kickUser: kickUser,
    changeGroupData: changeGroupData,
    setGroupCallback: setGroupCallback
}

export const message = {
    sendMessage: sendMessage,
    recallMessage: recallMessage,
    pullMessage: pullMessage,
    setMsgCallback: setMsgCallback,
    searchMessage: searchMessage
}

export const file = {
    getFileInfo: getFileInfo,
    uploadFile: uploadFile,
    downloadFile: downloadFile
}

function startBackgroundSync() {
    initGrp()
    initUsr()
}

const stim = {
    init: init,
    user: user,
    group: group,
    message: message,
    file: file,
    startBackgroundSync: startBackgroundSync
}

export default stim