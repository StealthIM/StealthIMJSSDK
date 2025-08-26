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

    const blockSize = 2048n * 1024n; // 块大小
    const maxConcurrentDownloads = typeof maxConcurrentDownloadsParam === 'number' && maxConcurrentDownloadsParam > 0 ? maxConcurrentDownloadsParam : 8; // 定义并发下载数，默认为 8

    callback({
        "stage": "getFileInfo", // 阶段：获取文件信息
        "finished": 0,
        "total": 1,
        "stage_num": 0,
        "stage_total": 2,
        "progress": 0
    });

    var fileInfo = await getFileInfo(fileHash); // 获取文件信息
    if (!fileInfo.success) {
        return fileInfo;
    }

    var sum = fileInfo.data.size; // 文件总大小
    var downloadedBytes = 0n; // 已下载的字节数

    var fileHandle; // Node.js 文件句柄
    var writeable; // 浏览器可写流
    let activeWriteOperations = 0; // 跟踪活跃的写入操作数量
    var writeToFile = async (data, position) => { }; // 写入文件函数
    var closeFunc = async () => { }; // 关闭文件函数

    const textDecoder = new TextDecoder(); // 定义 TextDecoder
    const abortController = new AbortController(); // 用于取消 fetch 请求

    if (typeof window === "undefined") {
        // Node.js 环境
        const fs = await import("fs/promises"); // 导入 fs/promises 模块
        try {
            fileHandle = await fs.open(fileObj, 'r+'); // 尝试以读写模式打开文件
            const stats = await fileHandle.stat(); // 获取文件状态
            downloadedBytes = BigInt(stats.size); // 获取文件大小
            if (downloadedBytes >= sum || downloadedBytes % blockSize !== 0n) {
                // 文件不完整或大小不匹配，重新开始下载
                await fileHandle.truncate(0); // 清空文件内容
                downloadedBytes = 0n;
            }
        } catch (e) {
            // 文件不存在或无法打开，创建新文件
            fileHandle = await fs.open(fileObj, 'w+'); // 以写模式打开文件，如果不存在则创建
            downloadedBytes = 0n;
        }

        writeToFile = async (data, position) => {
            activeWriteOperations++;
            try {
                await fileHandle.write(new Uint8Array(data), 0, data.byteLength, Number(position)); // 写入文件数据到指定位置
            } finally {
                activeWriteOperations--;
            }
        };
        closeFunc = async () => {
            // 等待所有活跃的写入操作完成
            while (activeWriteOperations > 0) {
                await new Promise(resolve => setTimeout(resolve, 50)); // 短暂等待
            }
            await fileHandle.close(); // 关闭文件句柄
        };
    } else {
        // 浏览器环境
        try {
            const file = await fileObj.getFile(); // 获取文件对象
            downloadedBytes = BigInt(file.size); // 获取文件大小
            if (downloadedBytes >= sum || downloadedBytes % blockSize !== 0n) {
                writeable = await fileObj.createWritable(); // 创建可写流
                downloadedBytes = 0n;
            } else {
                writeable = await fileObj.createWritable({ keepExistingData: true }); // 创建可写流并保留现有数据
                await writeable.seek(Number(downloadedBytes)); // 移动写入指针
            }
        } catch (e) {
            writeable = await fileObj.createWritable(); // 创建可写流
        }

        writeToFile = async (data, position) => {
            activeWriteOperations++;
            try {
                await writeable.write({ type: 'write', data: data, position: Number(position) }); // 写入文件数据到指定位置
            } finally {
                activeWriteOperations--;
            }
        };
        closeFunc = async () => {
            // 等待所有活跃的写入操作完成
            while (activeWriteOperations > 0) {
                await new Promise(resolve => setTimeout(resolve, 50)); // 短暂等待
            }
            await writeable.close(); // 关闭可写流
        };
    }

    callback({
        "stage": "getFileInfo",
        "finished": 1,
        "total": 1,
        "stage_num": 0,
        "stage_total": 2,
        "progress": 1
    }); // 更新获取文件信息进度为完成

    // 维护一个全局的已下载字节数，用于进度回调
    let totalDownloadedBytes = downloadedBytes;
    // 维护一个Map，用于跟踪每个正在下载的块的当前进度（已下载但未写入的字节）
    let activeBlockProgress = new Map(); // Map<blockStart: BigInt, downloadedBytesForThisBlock>

    // 所有待下载的块的起始字节偏移量
    const allBlockStarts = [];
    for (let i = downloadedBytes; i < sum; i += blockSize) {
        allBlockStarts.push(i);
    }

    let downloadError = null; // 用于记录下载过程中是否发生错误
    let blocksToDownload = [...allBlockStarts]; // 复制一份，因为我们会从中移除

    const startDownloadTask = async (blockStart) => {
        if (downloadError || abortController.signal.aborted) { // 增加中止检查
            return; // 如果已经发生错误或已中止，则停止安排新的下载任务
        }

        const blockEnd = min(blockStart + blockSize - 1n, sum - 1n);

        // 初始化当前块的下载进度
        activeBlockProgress.set(blockStart, 0n);

        for (let retry = 0; retry < 3; retry++) {
            try {
                const headers = {
                    "Authorization": `Bearer ${getUserSession()}`,
                    "Range": `bytes=${blockStart}-${blockEnd}`
                };
                const response = await fetch(BaseURL + "/file/" + fileHash, {
                    method: "GET",
                    headers: headers,
                    signal: abortController.signal, // 传递 AbortSignal
                });

                const reader = response.body.getReader();
                let value, done;
                let datacache = new Uint8Array(8192);
                let currentOffset = 0;
                let dataLength = 0;
                let readMode = 0;
                let blockid, lenx;

                while (true) {
                    if (abortController.signal.aborted) { // 检查是否已取消
                        throw new Error("Download aborted.");
                    }
                    ({ value, done } = await reader.read());
                    if (done) break;

                    if (datacache.length - dataLength < value.length || currentOffset > datacache.length / 2) {
                        const newSize = Math.max(datacache.length * 2, dataLength - currentOffset + value.length + 8192);
                        const newDatacache = new Uint8Array(newSize);
                        newDatacache.set(datacache.subarray(currentOffset, dataLength), 0);
                        datacache = newDatacache;
                        dataLength = dataLength - currentOffset;
                        currentOffset = 0;
                    }

                    datacache.set(value, dataLength);
                    dataLength += value.length;

                    // 更新当前块的下载进度
                    activeBlockProgress.set(blockStart, activeBlockProgress.get(blockStart) + BigInt(value.length));

                    // 计算当前总进度（已写入 + 正在下载）
                    let currentTotalProgress = totalDownloadedBytes;
                    for (let progress of activeBlockProgress.values()) {
                        currentTotalProgress += progress;
                    }

                    callback({
                        "stage": "download",
                        "finished": Number(currentTotalProgress),
                        "total": Number(sum),
                        "stage_num": 1,
                        "stage_total": 2,
                        "progress": Number(currentTotalProgress) / Number(sum)
                    });

                    while (true) {
                        if (abortController.signal.aborted) { // 检查是否已取消
                            throw new Error("Download aborted.");
                        }
                        if (readMode === 0) { // 读取头部
                            if (dataLength - currentOffset < 8) {
                                break; // 数据不足以读取头部
                            }
                            const dataViewBID = new DataView(datacache.buffer, datacache.byteOffset + currentOffset, 4);
                            blockid = dataViewBID.getUint32(0, true); // 获取块 ID

                            const dataViewLen = new DataView(datacache.buffer, datacache.byteOffset + currentOffset + 4, 4);
                            lenx = dataViewLen.getUint32(0, true); // 获取数据长度

                            currentOffset += 8;
                            readMode = 1;
                        }

                        if (readMode === 1) { // 读取数据
                            if (dataLength - currentOffset < lenx) {
                                break; // 数据不足以读取完整消息
                            }
                            const dataViewMain = new DataView(datacache.buffer, datacache.byteOffset + currentOffset, lenx);

                            if (blockid === UINT32_MAX) {
                                // 特殊消息，表示此 Range 请求处理完成或错误
                                try {
                                    var json = JSON.parse(textDecoder.decode(new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength)));
                                } catch (e) {
                                    var json = JSON.parse(textDecoder.decode(new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength)));
                                }
                                if (json?.result?.code !== 800 && json?.result?.code !== 0) {
                                    throw new Error(json?.result?.msg);
                                }
                                // 成功处理此 Range 请求
                                // 在成功处理一个 Range 请求后，移除此块的进度跟踪
                                activeBlockProgress.delete(blockStart);
                                return; // 退出当前 promise
                            } else {
                                // 这是一个文件块，写入到正确的位置
                                var newBuffer = new ArrayBuffer(dataViewMain.byteLength);
                                const sourceView = new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength);
                                var targetView = new Uint8Array(newBuffer);
                                targetView.set(sourceView);

                                await writeToFile(newBuffer, BigInt(blockid) * blockSize); // 写入文件
                                // 写入完成后，从 activeBlockProgress 中移除此块，并更新 totalDownloadedBytes
                                activeBlockProgress.delete(blockStart);
                                totalDownloadedBytes += BigInt(newBuffer.byteLength); // 累加实际写入的字节数

                                // 再次计算当前总进度并回调
                                let currentTotalProgress = totalDownloadedBytes;
                                for (let progress of activeBlockProgress.values()) {
                                    currentTotalProgress += progress;
                                }
                                callback({
                                    "stage": "download",
                                    "finished": Number(currentTotalProgress),
                                    "total": Number(sum),
                                    "stage_num": 1,
                                    "stage_total": 2,
                                    "progress": Number(currentTotalProgress) / Number(sum)
                                });
                            }

                            currentOffset += lenx;
                            readMode = 0;
                        }
                    }
                }
                // 如果流结束但没有收到 UINT32_MAX 成功消息，可能是不完整或错误
                throw new Error("Download stream ended unexpectedly.");

            } catch (e) {
                // 如果是 AbortError，不进行重试
                if (e.name === 'AbortError' || e.message === "Download aborted.") {
                    downloadError = e; // 记录错误
                    // 在错误发生时，确保从 activeBlockProgress 中移除此块
                    activeBlockProgress.delete(blockStart);
                    throw e; // 立即抛出，停止当前任务
                }
                console.error(`[StealthIM]download ${blockStart}-${blockEnd} retry: ${retry + 1}/3 error:`, e);
                if (retry === 2) {
                    downloadError = e; // 记录错误
                    abortController.abort(); // 立即中止所有其他正在进行的 fetch 请求
                    // 在错误发生时，确保从 activeBlockProgress 中移除此块
                    activeBlockProgress.delete(blockStart);
                    throw e;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
            }
        }
    };

    const downloadWorker = async () => {
        while (blocksToDownload.length > 0 && !downloadError && !abortController.signal.aborted) { // 增加中止检查
            const blockStart = blocksToDownload.shift(); // 取出一个块
            if (blockStart !== undefined) { // 确保取到了块
                try {
                    await startDownloadTask(blockStart);
                } catch (e) {
                    // startDownloadTask already sets downloadError and calls abortController.abort() if needed
                }
            }
        }
    };

    // 启动初始的并发下载任务
    const workers = [];
    for (let i = 0; i < maxConcurrentDownloads; i++) {
        workers.push(downloadWorker());
    }

    // 等待所有 worker 完成
    await Promise.allSettled(workers);

    // 确保在关闭文件前，所有可能导致错误的异步操作都已停止
    // 无论下载成功或失败，都关闭文件句柄
    await closeFunc();

    if (downloadError) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[101],
            "data": null,
            "error": downloadError
        };
    }

    callback({
        "stage": "download",
        "finished": Number(sum),
        "total": Number(sum),
        "stage_num": 1,
        "stage_total": 2,
        "progress": 1
    });

    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    };
}
