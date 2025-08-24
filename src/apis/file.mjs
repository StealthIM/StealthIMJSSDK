import axios from '../reuqest/request.mjs' // 导入 axios 用于 HTTP 请求
import i18n from '../i18n/load.mjs' // 导入 i18n 用于国际化
import { getUserSession } from './user.mjs' // 导入 getUserSession 获取用户会话
import wsx from '../ws/ws.mjs' // 导入 wsx 用于 WebSocket 连接
import readx from '../file/fileReader.mjs' // 导入 readx 用于文件读取
import hashFile from '../file/fileHasher.mjs' // 导入 hashFile 用于文件哈希计算

var BaseURL = "" // 基础 URL
/**
 * 设置基础 URL。
 * @param {string} BaseURLx - 基础 URL。
 */
export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
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
            "size": BigInt(resp.data.size),
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
const UINT32_MAX = 0xFFFFFFFF >>> 0; // 定义 UINT32_MAX 常量
/**
 * 下载文件。
 * @param {string} fileHash - 文件的哈希值。
 * @param {Function} callback - 下载进度回调函数。
 * @param {FileSystemFileHandle|string|null} [fileObj=null] - 浏览器环境下为 FileSystemFileHandle，Node.js 环境下为文件路径字符串。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function downloadFile(fileHash, callback, fileObj = null) {
    if (typeof fileHash !== "string" || fileHash.length !== 64) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }

    // 浏览器环境下，fileObj 应该是 FileSystemFileHandle 或 null (如果用户想选择文件)
    // Node.js 环境下，fileObj 应该是字符串 (文件路径)
    if (typeof window !== "undefined" && fileObj !== null && !(fileObj instanceof FileSystemFileHandle)) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }
    if (typeof window === "undefined" && typeof fileObj !== "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }
    var blocksWhenDownloadOnce // 单次下载的块数
    if (typeof window === "undefined") {
        blocksWhenDownloadOnce = 24n // nodejs 下一切正常
    } else {
        blocksWhenDownloadOnce = 1n // 在浏览器上发现了严重的性能问题
    }
    const blockSize = 2048n * 1024n // 块大小

    callback({
        "stage": "getFileInfo", // 阶段：获取文件信息
        "finished": 0,
        "total": 1,
        "stage_num": 0,
        "stage_total": 2,
        "progress": 0
    })

    var fileInfo = await getFileInfo(fileHash) // 获取文件信息
    if (!fileInfo.success) {
        return fileInfo
    }

    var size = 0n // 已下载大小
    var finished = 0n // 已完成的块数
    var sum = fileInfo.data.size // 文件总大小

    var DownloadNum = blockSize * blocksWhenDownloadOnce // 单次下载的总字节数
    var writeToFile = async () => { } // 写入文件函数
    var closeFunc = async () => { } // 写入文件函数

    if (typeof window === "undefined") {
        const fs = await import("fs") // 导入 fs 模块
        var stat = await new Promise((resolve, reject) => {
            fs.stat(fileObj, (err, stats) => {
                resolve(stats)
            }) // 获取文件状态
        })
        try {
            size = BigInt(stat.size) // 获取文件大小
            if (size >= sum || size % DownloadNum != 0) {
                await new Promise((resolve, reject) => {
                    writeToFile = async (data) => {
                        await new Promise((resolve, reject) => {
                            fs.appendFile(fileObj, data, () => {
                                resolve()
                            })
                        })
                    }
                    fs.writeFile(fileObj, "", () => {
                        resolve()
                    }) // 清空文件内容
                })
            } else {
                finished = size / blockSize // 计算已完成的块数
            }
        } catch (e) {
            await new Promise((resolve, reject) => {
                writeToFile = async (data) => {
                    await new Promise((resolve, reject) => {
                        fs.appendFile(fileObj, data, () => {
                            resolve()
                        })
                    })
                }
                fs.writeFile(fileObj, "", () => {
                    resolve()
                }) // 清空文件内容
            })
        }
        writeToFile = async (data) => {
            await new Promise((resolve, reject) => {
                fs.appendFile(fileObj, data, () => {
                    resolve()
                })
            })
        } // 定义写入文件函数
        closeFunc = async () => {
        }
    } else {
        var writeable // 可写流
        try {
            const file = await fileObj.getFile() // 获取文件对象
            size = BigInt(file.size) // 获取文件大小
            if (size >= sum || size % DownloadNum != 0) {
                writeable = await fileObj.createWritable(); // 创建可写流
            } else {
                finished = size / blockSize // 计算已完成的块数
                writeable = await fileObj.createWritable({
                    keepExistingData: true
                }); // 创建可写流并保留现有数据
                await writeable.seek(Number(size)) // 移动写入指针
            }
        } catch (e) {
            writeable = await fileObj.createWritable(); // 创建可写流
        }
        writeToFile = async (data) => {
            // 避免每次写入都关闭和重新打开 writableStream
            await writeable.write(data);
            // await writeable.flush()
            // writableStream 将在 downloadFile 函数结束时关闭一次
        }; // 定义写入文件函数
        closeFunc = async () => {
            await writeable.close()
        }
    }

    callback({
        "stage": "getFileInfo",
        "finished": 1,
        "total": 1,
        "stage_num": 0,
        "stage_total": 2,
        "progress": 1
    }) // 更新获取文件信息进度为完成



    for (var lblknum = finished / blocksWhenDownloadOnce; lblknum < (sum + DownloadNum - 1n) / DownloadNum; lblknum++) { // 遍历每个下载批次
        var start = lblknum * DownloadNum // 当前批次的起始字节
        var end = min((lblknum + 1n) * DownloadNum - 1n, sum - 1n) // 当前批次的结束字节

        callback({
            "stage": "download", // 阶段：下载
            "finished": Number(start),
            "total": Number(sum),
            "stage_num": 1,
            "stage_total": 2,
            "progress": Number(start) / Number(sum)
        }) // 更新下载进度

        var startBlockID = start / blockSize // 起始块 ID
        var blocks = [] // 存储下载的块
        for (var i = 0n; i < ((end - start + blockSize) / blockSize); i++) {
            blocks.push(new ArrayBuffer(Number(blockSize))) // 初始化块数组
        }
        var finished = 0n // 当前批次已完成的块数
        for (var retry = 0; retry < 3; retry++) { // 重试机制
            try {
                const headers = {
                    "Authorization": `Bearer ${getUserSession()}`,
                    "Range": `bytes=${start}-${end}`
                };
                const response = await fetch(BaseURL + "/file/" + fileHash, {
                    method: "GET",
                    headers: headers,
                }); // 发送文件下载请求
                var flagSuccess = 0 // 成功标志
                var blockid, lenx; // 块 ID 和长度
                var datacache = new Uint8Array(); // 当前累积的数据
                var readMode = 0; // 状态机: 0 = 读取头部, 1 = 读取数据
                var currentOffset = 0; // datacache 中当前处理的偏移量

                for await (const value of response.body) {
                    if (flagSuccess) {
                        break;
                    }

                    // 将新数据追加到 datacache
                    const newDatacache = new Uint8Array(datacache.length - currentOffset + value.length);
                    newDatacache.set(datacache.subarray(currentOffset), 0);
                    newDatacache.set(value, datacache.length - currentOffset);
                    datacache = newDatacache;
                    currentOffset = 0; // 重置偏移量，因为我们有一个新的缓冲区

                    while (true) {
                        if (readMode === 0) { // 读取头部
                            if (datacache.length - currentOffset < 8) {
                                break; // 数据不足以读取头部
                            }
                            const dataViewBID = new DataView(datacache.buffer, datacache.byteOffset + currentOffset, 4);
                            blockid = dataViewBID.getUint32(0, true); // 获取块 ID

                            const dataViewLen = new DataView(datacache.buffer, datacache.byteOffset + currentOffset + 4, 4);
                            lenx = dataViewLen.getUint32(0, true); // 获取数据长度

                            currentOffset += 8; // 偏移量前进到数据部分
                            readMode = 1;
                        }

                        if (readMode === 1) { // 读取数据
                            if (datacache.length - currentOffset < lenx) {
                                break; // 数据不足以读取完整消息
                            }
                            const dataViewMain = new DataView(datacache.buffer, datacache.byteOffset + currentOffset, lenx);

                            if (blockid === UINT32_MAX) {
                                // 解析 JSON
                                try {
                                    var json = JSON.parse(textDecoder.decode(new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength)));
                                } catch (e) {
                                    const buffer = Buffer.from(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength);
                                    const jsonString = buffer.toString('utf-8');
                                    var json = JSON.parse(jsonString);
                                } // 解析 JSON 数据
                                if (json?.result?.code !== 800 && json?.result?.code !== 0) {
                                    throw new Error(json?.result?.msg); // 抛出错误
                                } else {
                                    flagSuccess = 1; // 设置成功标志
                                    break; // 退出内部 while 循环和外部 for await 循环
                                }
                            } else {
                                // 复制块数据
                                var newBuffer = new ArrayBuffer(dataViewMain.byteLength);
                                const sourceView = new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength);
                                var targetView = new Uint8Array(newBuffer);
                                targetView.set(sourceView);
                                blocks[blockid - Number(startBlockID)] = newBuffer; // 存储块数据
                            }

                            currentOffset += lenx; // 偏移量前进到下一个头部
                            readMode = 0;

                            finished++; // 已完成块数加一

                            callback({
                                "stage": "download",
                                "finished": Number(min(start + finished * blockSize, sum)),
                                "total": Number(sum),
                                "stage_num": 1,
                                "stage_total": 2,
                                "progress": Number(min(start + finished * blockSize, sum)) / Number(sum)
                            }); // 更新下载进度
                        }
                    }
                }
                if (flagSuccess) {
                    try {
                        if (response.body && typeof response.body.cancel === 'function') {
                            response.body.cancel(); // 取消流
                        }
                    } catch (e) {
                        console.error("Error closing response body:", e); // 关闭响应体错误
                    }
                    break;
                }
            } catch (e) {
                console.error("Download block error:", e); // 下载块错误
                if (retry === 2) {
                    // await closeStreams(); // 在最后一次重试失败时关闭流
                    return {
                        "success": false,
                        "error": true,
                        "msg": i18n.t.Errorcode[101],
                        "data": null,
                        "error": e
                    };
                }
            }
        }

        callback({
            "stage": "download",
            "finished": Number(end + 1n),
            "total": Number(sum),
            "stage_num": 1,
            "stage_total": 2,
            "progress": Number(end + 1n) / Number(sum)
        }) // 更新下载进度为当前批次完成
        // 拼接为大 arraybuffer
        var lenSum = 0
        for (var i = 0; i < blocks.length; i++) {
            lenSum += blocks[i].byteLength
        }
        var newBuffer = new Uint8Array(lenSum);
        var offset = 0
        for (var i = 0; i < blocks.length; i++) {
            var sourceView = new Uint8Array(blocks[i]);
            newBuffer.set(sourceView, i * Number(blockSize)); // 拼接块数据
        }
        await writeToFile(newBuffer) // 写入文件
        // await new Promise((resolve, reject) => {
        //     setTimeout(() => {
        //         resolve()
        //     }, 400)
        // }) // 短暂等待
    }

    await closeFunc()

    callback({
        "stage": "download",
        "finished": Number(sum),
        "total": Number(sum),
        "stage_num": 1,
        "stage_total": 2,
        "progress": 1
    }) // 更新下载进度为全部完成

    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }

}
