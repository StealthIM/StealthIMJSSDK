import i18n from '../../i18n/load.mjs' // 导入 i18n 用于国际化
import { getUserSession } from '../user.mjs' // 导入 getUserSession 获取用户会话
import { getFileInfo } from '../file.mjs' // 导入 getFileInfo 获取文件信息

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

const UINT32_MAX = 0xFFFFFFFF >>> 0; // 定义 UINT32_MAX 常量
/**
 * 在 Node.js 环境下载文件。
 * @param {string} fileHash - 文件的哈希值。
 * @param {Function} callback - 下载进度回调函数。
 * @param {string} filePath - Node.js 环境下为文件路径字符串。
 * @param {number} [maxConcurrentDownloadsParam=8] - 最大并发下载数，默认为 8。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function downloadOnNode(fileHash, callback, filePath, maxConcurrentDownloadsParam = 8) {
    if (typeof fileHash !== "string" || fileHash.length !== 64) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }

    if (typeof filePath !== "string") {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }

    const blockSize = 2048 * 1024; // 块大小
    const maxConcurrentDownloads = typeof maxConcurrentDownloadsParam === 'number' && maxConcurrentDownloadsParam > 0 ? maxConcurrentDownloadsParam : 8; // 定义并发下载数，默认为 8

    // 用于限制回调频率
    let lastCallbackTime = 0;
    const callbackInterval = 100; // 100毫秒，可以根据需要调整

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

    var sum = Number(fileInfo.data.size); // 文件总大小
    var downloadedBytes = 0; // 已下载的字节数

    var fileHandle; // Node.js 文件句柄
    let activeWriteOperations = 0; // 跟踪活跃的写入操作数量
    var writeToFile = async (data, position) => { }; // 写入文件函数
    var closeFunc = async () => { }; // 关闭文件函数

    const textDecoder = new TextDecoder(); // 定义 TextDecoder
    const abortController = new AbortController(); // 用于取消 fetch 请求

    // Node.js 环境
    const fs = await import("fs/promises"); // 导入 fs/promises 模块
    try {
        fileHandle = await fs.open(filePath, 'r+'); // 尝试以读写模式打开文件
        const stats = await fileHandle.stat(); // 获取文件状态
        downloadedBytes = Number(stats.size); // 获取文件大小，转换为 Number
        if (downloadedBytes >= sum || downloadedBytes % blockSize !== 0) { // 比较和模运算使用 Number
            // 文件不完整或大小不匹配，重新开始下载
            await fileHandle.truncate(0); // 清空文件内容
            downloadedBytes = 0;
        }
    } catch (e) {
        // 文件不存在或无法打开，创建新文件
        fileHandle = await fs.open(filePath, 'w+'); // 以写模式打开文件，如果不存在则创建
        downloadedBytes = 0;
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
    let activeBlockProgress = new Map(); // Map<blockStart: Number, downloadedBytesForThisBlock: Number>

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

        const blockEnd = min(blockStart + blockSize - 1, sum - 1); // 转换为 Number

        // 初始化当前块的下载进度
        activeBlockProgress.set(blockStart, 0); // 转换为 Number

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
                let datacache = new Uint8Array(Number(blockSize)); // 调整初始缓存大小为 blockSize
                let dataView = new DataView(datacache.buffer); // 创建一个DataView用于高效读取
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

                    // 计算当前有效数据（未处理部分）的长度
                    const unreadDataLength = dataLength - currentOffset;

                    // 如果当前缓存的剩余空间不足以容纳新的数据块
                    if (datacache.length - dataLength < value.length) {
                        // 计算当前有效数据（未处理部分）的长度
                        const unreadDataLength = dataLength - currentOffset;
                        // 确定新的缓存大小，至少是当前有效数据 + 新数据 + 一个 blockSize 的缓冲区
                        const newSize = Math.max(datacache.length * 2, unreadDataLength + value.length + Number(blockSize));
                        const newDatacache = new Uint8Array(newSize);
                        // 将未处理的数据复制到新缓存的起始位置
                        newDatacache.set(datacache.subarray(currentOffset, dataLength), 0);
                        datacache = newDatacache;
                        dataView = new DataView(datacache.buffer); // 重新创建DataView以指向新缓缓冲区
                        dataLength = unreadDataLength; // 更新dataLength为复制后的有效数据长度
                        currentOffset = 0; // 重置currentOffset，因为数据已前移
                    }

                    // 现在缓存中应该有足够的空间。将新数据添加到缓存末尾。
                    datacache.set(value, dataLength);
                    dataLength += value.length;

                    // 更新当前块的下载进度
                    // 确保 activeBlockProgress.get(blockStart) 返回的是 Number 类型
                    const currentBlockProgress = Number(activeBlockProgress.get(blockStart) || 0);
                    activeBlockProgress.set(blockStart, currentBlockProgress + value.length); // 使用 Number 进行加法

                    // 计算当前总进度（已写入 + 正在下载）
                    let currentTotalProgress = totalDownloadedBytes;
                    for (let progress of activeBlockProgress.values()) {
                        currentTotalProgress += progress;
                    }

                    // 限制回调频率
                    const now = Date.now();
                    if (now - lastCallbackTime > callbackInterval) {
                        callback({
                            "stage": "download",
                            "finished": Number(currentTotalProgress),
                            "total": Number(sum),
                            "stage_num": 1,
                            "stage_total": 2,
                            "progress": Number(currentTotalProgress) / Number(sum)
                        });
                        lastCallbackTime = now;
                    }

                    while (true) {
                        if (abortController.signal.aborted) { // 检查是否已取消
                            throw new Error("Download aborted.");
                        }
                        if (readMode === 0) { // 读取头部
                            if (dataLength - currentOffset < 8) {
                                break; // 数据不足以读取头部
                            }
                            blockid = dataView.getUint32(currentOffset, true); // 获取块 ID
                            lenx = dataView.getUint32(currentOffset + 4, true); // 获取数据长度

                            currentOffset += 8;
                            readMode = 1;
                        }

                        if (readMode === 1) { // 读取数据
                            if (dataLength - currentOffset < lenx) {
                                break; // 数据不足以读取完整消息
                            }
                            const blockData = new Uint8Array(datacache.buffer, currentOffset, lenx); // 直接创建Uint8Array视图

                            if (blockid === UINT32_MAX) {
                                // 特殊消息，表示此 Range 请求处理完成或错误
                                try {
                                    var json = JSON.parse(textDecoder.decode(blockData)); // 直接使用blockData
                                } catch (e) {
                                    var json = JSON.parse(textDecoder.decode(blockData)); // 直接使用blockData
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
                                await writeToFile(blockData, blockid * blockSize); // 写入文件，使用 Number
                                // 写入完成后，从 activeBlockProgress 中移除此块，并更新 totalDownloadedBytes
                                activeBlockProgress.delete(blockStart);
                                totalDownloadedBytes += blockData.byteLength; // 累加实际写入的字节数，使用 Number

                                // 再次计算当前总进度并回调 (确保在块写入完成后立即回调一次)
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
                                lastCallbackTime = Date.now(); // 更新回调时间
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
