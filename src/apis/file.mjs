import axios from '../reuqest/request.mjs' // 导入 axios 用于 HTTP 请求
import i18n from '../i18n/load.mjs' // 导入 i18n 用于国际化
import { getUserSession } from './user.mjs' // 导入 getUserSession 获取用户会话
import wsx from '../ws/ws.mjs' // 导入 wsx 用于 WebSocket 连接
import readx from '../file/fileReader.mjs' // 导入 readx 用于文件读取
import hashFile from '../file/fileHasher.mjs' // 导入 hashFile 用于文件哈希计算

import { downloadOnNode, setBaseURL as setBaseURLNode } from './files/download_node.mjs'
import { downloadOnWeb, setBaseURL as setBaseURLWeb } from './files/download_web.mjs'

var BaseURL = "" // 基础 URL
/**
 * 设置基础 URL。
 * @param {string} BaseURLx - 基础 URL。
 */
export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
    setBaseURLNode(BaseURLx)
    setBaseURLWeb(BaseURLx)
}

/**
 * 返回两个数中的最小值。
 * @param {number} a - 第一个数字。
 * @param {number} b - 第二个数字。
 * @returns {number} - 较小的数字。
 */
function min(a, b) {
    return a < b ? a : b
}

/**
 * 获取文件信息。
 * @param {string} fileHash - 文件的哈希值。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function getFileInfo(fileHash) {
    if (typeof fileHash != "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    if (fileHash.length != 64) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        }
    }
    for (var retry = 0; retry < 3; retry++) { // 重试机制
        try {
            var resp = await axios.post(BaseURL + "/file/" + fileHash, {}, {
                "headers": {
                    "Authorization": `Bearer ${getUserSession()}`
                }
            }) // 发送获取文件信息请求
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
            "size": Number(resp.data.size), // 将 BigInt 转换为 Number
        }
    }
}

/**
 * 上传文件。
 * @param {File} file - 要上传的文件对象。
 * @param {number} groupid - 群组 ID。
 * @param {Function} callback - 上传进度回调函数。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function uploadFile(file, groupid, callback) {
    const reader = new readx(file) // 创建文件读取器
    await reader.init() // 初始化读取器
    const filesize = reader.getFileSize() // 获取文件大小
    getUserSession() // 获取用户会话，确保已登录

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

    callback({
        "stage": "calcHash", // 阶段：计算哈希
        "finished": 0,
        "total": filesize,
        "stage_num": 0,
        "stage_total": 3,
        "progress": 0
    })

    const calcHash = await hashFile(reader, (calcedHash) => {
        callback({
            "stage": "calcHash",
            "finished": calcedHash.calculatedBytes,
            "total": filesize,
            "stage_num": 0,
            "stage_total": 2,
            "progress": calcedHash.calculatedBytes / filesize
        }) // 更新哈希计算进度
    })

    if (!calcHash) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[103], // 哈希计算失败
            "data": null
        }
    }

    // 1. 发送元数据
    const metadata = {
        "size": filesize.toString(),
        "groupid": groupid.toString(),
        "hash": calcHash,
        "filename": reader.getFileName() // 添加文件名到元数据
    }

    callback({
        "stage": "uploadMetadata", // 阶段：上传元数据
        "finished": 0,
        "total": 1,
        "stage_num": 1,
        "stage_total": 3,
        "progress": 0
    })


    try {
        const url_replace = BaseURL.replace("https://", "wss://").replace("http://", "ws://") // 转换 URL 为 WebSocket 协议
        const ws = new wsx(url_replace + "/file/?authorization=" + getUserSession()) // 创建 WebSocket 客户端

        var pm = new Promise((resolve, reject) => {
            ws.onOpen = resolve
        }) // 等待 WebSocket 连接打开
        await ws.connect() // 连接 WebSocket
        await pm
        ws.onOpen = () => { } // 清除 onOpen 事件
        ws.send(JSON.stringify(metadata)) // 发送元数据

        // 2. 分块发送文件体
        const blockSize = 2048 * 1024 // 2048 KiB
        await reader.resetPointer() // 重置文件读取指针
        var sendBlockList = [] // 待发送的块列表

        var end = 0 // 结束标志
        var retVal = null // 返回值
        var finished = 0 // 已完成的字节数
        var metaFinish = 0 // 元数据是否发送完成

        ws.onError = function (e) {
            retVal = {
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[101],
                "data": null
            }
            end = 1; // 设置结束标志
        }


        ws.onMessage = function (msg) {
            if (end == 1) {
                return
            }
            try {
                const data = JSON.parse(msg)
                if (data.type === "metadata") {
                    if (data.result.code != 800) {
                        retVal = {
                            "success": false,
                            "error": true,
                            "msg": i18n.t.Errorcode[data.result.code] || i18n.t.Errorcode[101],
                            "data": null
                        }
                        end = 1
                        return
                    } else {
                        if (metaFinish != 0) {
                            return
                        }
                        callback({
                            "stage": "uploadMetadata",
                            "finished": 1,
                            "total": 1,
                            "stage_num": 1,
                            "stage_total": 3,
                            "progress": 1
                        }) // 更新元数据上传进度

                        for (var i = 0; i < Math.floor((filesize + blockSize - 1) / blockSize); i += 1) {
                            sendBlockList.push(i) // 将所有块添加到待发送列表
                        }

                        callback({
                            "stage": "uploadBlocks", // 阶段：上传块
                            "finished": 0,
                            "total": filesize,
                            "stage_num": 2,
                            "stage_total": 3,
                            "progress": 0
                        }) // 更新块上传进度
                        metaFinish = 1 // 元数据发送完成
                    }
                } else if (data.type === "complete") {
                    if (data.result.code != 800) {
                        retVal = {
                            "success": false,
                            "error": true,
                            "msg": i18n.t.Errorcode[data.result.code] || i18n.t.Errorcode[101],
                            "data": null
                        }
                        end = 1

                        return
                    } else {

                        callback({
                            "stage": "uploadBlocks",
                            "finished": filesize,
                            "total": filesize,
                            "stage_num": 2,
                            "stage_total": 3,
                            "progress": 1
                        }) // 更新块上传进度为完成
                        end = 1 // 设置结束标志
                        return
                    }
                } else if (data.type === "block") {
                    if (data.result.code != 800) {
                        var blkid = data.blockid
                        sendBlockList.push(blkid) // 如果块上传失败，重新添加到待发送列表
                    } else {
                        finished += blockSize
                        callback({
                            "stage": "uploadBlocks",
                            "finished": min(finished, filesize),
                            "total": filesize,
                            "stage_num": 2,
                            "stage_total": 3,
                            "progress": min(finished, filesize) / filesize
                        }) // 更新块上传进度
                    }
                }
            } catch (e) {
                // 忽略非 JSON 或不相关的消息
            }
        }

        while (1) {
            if (end) {
                break
            }
            if (!metaFinish) {
                await new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve()
                    }, 100)
                }) // 等待元数据发送完成
                continue
            }
            var r = sendBlockList.shift() // 获取待发送的块 ID
            if (typeof r !== "undefined") {

                const block = await reader.read(blockSize, "ArrayBuffer") // 读取文件块

                const blockBuffer = new ArrayBuffer(4 + block.byteLength)
                new Uint8Array(blockBuffer, 4).set(new Uint8Array(block))
                const dataView = new DataView(blockBuffer)
                dataView.setUint32(0, r, true) // LittleEndian int32

                ws.send(blockBuffer) // 发送文件块
                // 移除 setTimeout 以提高性能。
                // 如果服务器过载，考虑重新引入更复杂的流量控制。
            } else {
                // 没有块可发送，短暂等待以避免忙等待
                await new Promise((resolve) => setTimeout(resolve, 50)); // 减少等待时间
            }
        }
        ws.onMessage = () => { } // 清除 onMessage 事件
        ws.close() // 关闭 WebSocket 连接
        if (retVal != null) {
            return retVal
        }
        return {
            "success": true,
            "error": false,
            "msg": "",
            "data": {
                "hash": calcHash
            }
        }

    } catch (e) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[101],
            "data": null,
            "error": e
        }
    }
}

/**
 * 下载文件。
 * @param {string} fileHash - 文件的哈希值。
 * @param {Function} callback - 下载进度回调函数。
 * @param {FileSystemFileHandle|string|null} [fileObj=null] - 浏览器环境下为 FileSystemFileHandle，Node.js 环境下为文件路径字符串。
 * @param {number} [maxConcurrentDownloadsParam=8] - 最大并发下载数，默认为 8。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function downloadFile(fileHash, callback, fileObj = null, maxConcurrentDownloadsParam = 8) {
    if (typeof fileHash !== "string" || fileHash.length !== 64) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }

    if (typeof window === "undefined") {
        // Node.js 环境
        if (typeof fileObj !== "string") {
            return {
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[100],
                "data": null
            };
        }
        return downloadOnNode(fileHash, callback, fileObj, maxConcurrentDownloadsParam);
    } else {
        // 浏览器环境
        if (!(fileObj instanceof FileSystemFileHandle)) {
            return {
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[100],
                "data": null
            };
        }
        return downloadOnWeb(fileHash, callback, fileObj, maxConcurrentDownloadsParam);
    }
}
