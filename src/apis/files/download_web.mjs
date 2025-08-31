import i18n from '../../i18n/load.mjs' // 导入 i18n 用于国际化
import { getUserSession } from '../user.mjs' // 导入 getUserSession 获取用户会话
import { getFileInfo } from '../file.mjs' // 导入 getFileInfo 获取文件信息

// 定义 Web Worker 的代码
const workerCode = `
function downloadWorkerCode(){
    const min = (a, b) => a < b ? a : b;
    const UINT32_MAX_CONST = (2 ** 32) - 1;
    let abortController = new AbortController();
    const textDecoder = new TextDecoder(); // 初始化 TextDecoder

    self.onmessage = async (e) => {
        const { type, payload } = e.data;

        if (type === 'start') {
            const { blockStart, blockEnd, fileHash, BaseURL, userSession, blockSize } = payload;
            console.log({ blockStart, blockEnd, fileHash, BaseURL, userSession, blockSize, UINT32_MAX_CONST })

            for (let retry = 0; retry < 3; retry++) {
                try {
                    const headers = {
                        "Authorization": "Bearer "+userSession,
                        "Range": "bytes="+blockStart+"-"+blockEnd
                    };
                    const response = await fetch(BaseURL + "/file/" + fileHash, {
                        method: "GET",
                        headers: headers
                    });

                    const reader = response.body.getReader();
                    let value, done;
                    let datacache = new Uint8Array(Number(blockSize));
                    let dataView = new DataView(datacache.buffer);
                    let currentOffset = 0;
                    let dataLength = 0;
                    let readMode = 0;
                    let blockid, lenx;
                    let downloadedBytesForThisBlock = 0;

                    while (true) {
                        ({ value, done } = await reader.read());
                        if (done) break;

                        const unreadDataLength = dataLength - currentOffset;
                        if (datacache.length - dataLength < value.length) {
                            const newSize = Math.max(datacache.length * 2, unreadDataLength + value.length + Number(blockSize));
                            const newDatacache = new Uint8Array(newSize);
                            newDatacache.set(datacache.subarray(currentOffset, dataLength), 0);
                            datacache = newDatacache;
                            dataView = new DataView(datacache.buffer);
                            dataLength = unreadDataLength;
                            currentOffset = 0;
                        }
                        datacache.set(value, dataLength);
                        dataLength += value.length;

                        downloadedBytesForThisBlock += value.length;
                        self.postMessage({ type: 'progress', blockStart, downloadedBytes: value.length });

                        while (true) {
                            if (abortController.signal.aborted) {
                                throw new Error("Download aborted.");
                            }
                            if (readMode === 0) {
                                if (dataLength - currentOffset < 8) {
                                    break;
                                }
                                blockid = dataView.getUint32(currentOffset, true);
                                lenx = dataView.getUint32(currentOffset + 4, true);

                                currentOffset += 8;
                                readMode = 1;
                            }

                            if (readMode === 1) {
                                if (dataLength - currentOffset < lenx) {
                                    break;
                                }
                                const blockData = new Uint8Array(datacache.buffer, currentOffset, lenx);

                                if (blockid === UINT32_MAX_CONST) {
                                    try {
                                        var json = JSON.parse(textDecoder.decode(blockData));
                                    } catch (e) {
                                        var json = JSON.parse(textDecoder.decode(blockData));
                                    }
                                    if (json?.result?.code !== 800 && json?.result?.code !== 0) {
                                        throw new Error(json?.result?.msg);
                                    }
                                    self.postMessage({ type: 'blockComplete', blockStart, downloadedBytesForThisBlock });
                                    return;
                                } else {
                                    self.postMessage({
                                        type: 'data',
                                        blockStart,
                                        position: blockStart, // 更正：blockid 应为绝对位置
                                        data: blockData.slice().buffer // 克隆一个新的 Uint8Array 并发送其缓冲区
                                    });
                                }

                                currentOffset += lenx;
                                readMode = 0;
                            }
                        }
                    }
                    throw new Error("Download stream ended unexpectedly.");

                } catch (e) {
                    if (e.name === 'AbortError' || e.message === "Download aborted.") {
                        self.postMessage({ type: 'error', blockStart, error: e.message, aborted: true });
                        return;
                    }
                    console.error("[StealthIM]worker download "+blockStart+"-"+blockEnd+" retry: "+(retry + 1)+"/3 error:", e);
                    if (retry === 2) {
                        self.postMessage({ type: 'error', blockStart, error: e.message });
                        return;
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000 * (retry + 1)));
                }
            }
        } else if (type === 'abort') {
            abortController.abort();
        }
    };
}
`

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

const UINT32_MAX = 0xFFFFFFFF; // 定义 UINT32_MAX 常量
// 使用 Function.prototype.toString() 拿到 downloadWorkerCode 的源码
// const workerCode = downloadWorkerCode.toString();
// 创建一个 Blob 对象，类型为 JavaScript
const blob = new Blob([`self.UINT32_MAX_CONST = ${UINT32_MAX};\n`, workerCode, 'downloadWorkerCode();'], { type: 'application/javascript' });
// 通过 Blob URL 构造 Worker
const workerURL = URL.createObjectURL(blob);

/**
 * 在浏览器环境下载文件。
 * @param {string} fileHash - 文件的哈希值。
 * @param {Function} callback - 下载进度回调函数。
 * @param {FileSystemFileHandle} fileHandle - 浏览器环境下为 FileSystemFileHandle。
 * @param {number} [maxConcurrentDownloadsParam=8] - 最大并发下载数，默认为 8。
 * @returns {Promise<Object>} - 包含 success, error, msg, data 的结果对象。
 */
export async function downloadOnWeb(fileHash, callback, fileHandle, maxConcurrentDownloadsParam = 8) {
    if (typeof fileHash !== "string" || fileHash.length !== 64) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }

    if (!(fileHandle instanceof FileSystemFileHandle)) {
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

    var writeable; // 浏览器可写流
    let activeWriteOperations = 0; // 跟踪活跃的写入操作数量
    var writeToFile = async (data, position) => { }; // 写入文件函数
    var closeFunc = async () => { }; // 关闭文件函数

    // 新增：用于按序写入的变量
    let nextExpectedPosition = 0; // 下一个期望写入的字节位置
    const writeBuffer = new Map(); // 存储乱序到达的数据块

    // 浏览器环境
    try {
        const file = await fileHandle.getFile(); // 获取文件对象
        downloadedBytes = Number(file.size); // 获取文件大小，转换为 Number
        if (downloadedBytes >= sum || downloadedBytes % blockSize !== 0) { // 比较和模运算使用 Number
            writeable = await fileHandle.createWritable(); // 创建可写流
            downloadedBytes = 0;
        } else {
            writeable = await fileHandle.createWritable({ keepExistingData: true }); // 创建可写流并保留现有数据
            await writeable.seek(Number(downloadedBytes)); // 移动写入指针
        }
        nextExpectedPosition = downloadedBytes; // 初始化 nextExpectedPosition
    } catch (e) {
        writeable = await fileHandle.createWritable(); // 创建可写流
        nextExpectedPosition = 0; // 初始化 nextExpectedPosition
    }

    // 修改 writeToFile 函数以处理乱序写入
    writeToFile = async (data, position) => {
        activeWriteOperations++;
        try {
            // 计算当前块的预期最大长度
            var maxExceptLen = min(sum - position, blockSize);
            // 裁剪数据长度，确保不超过当前块的预期最大长度
            const dataToWrite = data.subarray(0, maxExceptLen);

            if (position === nextExpectedPosition) {
                // 如果是期望的下一个块，则直接写入

                await writeable.write({ type: 'write', data: dataToWrite, position: Number(position) });
                nextExpectedPosition += dataToWrite.length;

                // 检查缓冲区中是否有可以连续写入的块
                while (writeBuffer.has(nextExpectedPosition)) {
                    const bufferedData = writeBuffer.get(nextExpectedPosition);
                    writeBuffer.delete(nextExpectedPosition);
                    await writeable.write({ type: 'write', data: bufferedData, position: Number(nextExpectedPosition) });
                    nextExpectedPosition += bufferedData.length;
                }
            } else {
                // 如果是乱序块，则存入缓冲区
                writeBuffer.set(position, dataToWrite);
            }
        } finally {
            activeWriteOperations--;
        }
    };

    closeFunc = async () => {
        // 等待所有活跃的写入操作完成
        while (activeWriteOperations > 0) {
            await new Promise(resolve => setTimeout(resolve, 50)); // 短暂等待
        }
        // 在关闭之前，确保所有缓冲区中的数据都被写入
        // 理论上，如果下载完成，缓冲区应该是空的，但以防万一
        while (writeBuffer.size > 0) {
            // 尝试写入缓冲区中下一个期望的块
            if (writeBuffer.has(nextExpectedPosition)) {
                const bufferedData = writeBuffer.get(nextExpectedPosition);
                writeBuffer.delete(nextExpectedPosition);
                // 调用 writeToFile 处理缓冲区中的数据，确保写入逻辑一致
                await writeToFile(bufferedData, nextExpectedPosition);
                // nextExpectedPosition 的更新由 writeToFile 内部处理
            } else {
                // 如果没有下一个期望的块，可能是下载中断或逻辑错误
                console.warn("[StealthIM]Buffer still contains data but next expected block not found.");
                break; // 避免死循环
            }
        }
        await writeable.close(); // 关闭可写流
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
    let activeBlockProgress = new Map(); // Map<blockStart: Number, downloadedBytesForThisBlock>

    // 所有待下载的块的起始字节偏移量
    const allBlockStarts = [];
    for (let i = downloadedBytes; i < sum; i += blockSize) {
        allBlockStarts.push(i);
    }

    let downloadError = null; // 用于记录下载过程中是否发生错误
    let blocksToDownload = [...allBlockStarts]; // 复制一份，因为我们会从中移除

    const activeWorkers = []; // 活跃的 Worker 实例
    const workerTasks = []; // 存储每个 Worker 任务的 { worker, promise } 对象

    // 启动下载任务
    const startDownloadTask = async (blockStart) => {
        const worker = new Worker(workerURL); // 创建新的 Worker
        activeWorkers.push(worker); // 将 Worker 添加到活跃列表

        // 辅助函数，用于终止 Worker 并从活跃列表和任务中移除
        const terminateAndRemoveWorker = (w) => {
            w.terminate();
            const activeWorkerIndex = activeWorkers.indexOf(w);
            if (activeWorkerIndex > -1) {
                activeWorkers.splice(activeWorkerIndex, 1);
            }
            const taskIndex = workerTasks.findIndex(task => task.worker === w);
            if (taskIndex > -1) {
                workerTasks.splice(taskIndex, 1);
            }
        };

        const promise = new Promise(async (resolve, reject) => {
            if (downloadError) { // 如果已经有错误发生，则不再启动新的下载任务
                terminateAndRemoveWorker(worker); // 终止刚刚创建的 Worker
                return reject(new Error("Download aborted due to previous error."));
            }

            worker.onmessage = async (e) => {
                const { type, blockStart: msgBlockStart, downloadedBytes: msgDownloadedBytes, position, data, error } = e.data;

                if (type === 'progress') {
                    // 更新当前块的下载进度
                    activeBlockProgress.set(msgBlockStart, (activeBlockProgress.get(msgBlockStart) || 0) + msgDownloadedBytes);

                    // 更新总下载进度并触发回调
                    totalDownloadedBytes += msgDownloadedBytes;
                    const now = Date.now();
                    if (now - lastCallbackTime > callbackInterval) {
                        callback({
                            "stage": "download",
                            "finished": Number(totalDownloadedBytes),
                            "total": Number(sum),
                            "stage_num": 1,
                            "stage_total": 2,
                            "progress": totalDownloadedBytes / sum
                        });
                        lastCallbackTime = now;
                    }
                } else if (type === 'data') {
                    // 写入数据到文件
                    await writeToFile(new Uint8Array(data), position);
                } else if (type === 'blockComplete') {
                    // 块下载完成，从活跃进度中移除
                    activeBlockProgress.delete(msgBlockStart);
                    resolve(); // 解决当前块的 Promise
                    terminateAndRemoveWorker(worker); // 终止 Worker 并从活跃列表中移除
                } else if (type === 'error') {
                    // 处理 Worker 错误
                    console.error(`[StealthIM]Worker for block ${msgBlockStart} encountered an error:`, error);
                    if (!downloadError) { // 只记录第一个错误
                        downloadError = error;
                        // 终止所有活跃的 Worker
                        activeWorkers.forEach(w => w.postMessage({ type: 'abort' }));
                        // 立即清除所有活跃的 Worker 和任务
                        activeWorkers.length = 0;
                        workerTasks.length = 0;
                    }
                    reject(new Error(error)); // 拒绝当前块的 Promise
                    // 这里不需要调用 terminateAndRemoveWorker(worker)，因为所有 Worker 都已被清除
                }
            };

            worker.onerror = (err) => {
                console.error(`[StealthIM]Worker for block ${blockStart} failed:`, err);
                if (!downloadError) {
                    downloadError = err.message || "Unknown worker error";
                    activeWorkers.forEach(w => w.postMessage({ type: 'abort' }));
                    workerTasks.forEach(task => task.worker.postMessage({ type: 'abort' })); // 中止所有任务
                    activeWorkers.length = 0;
                    workerTasks.length = 0;
                }
                reject(err);
                // 这里不需要调用 terminateAndRemoveWorker(worker)，因为所有 Worker 都已被清除
            };

            // 获取用户会话
            const userSession = getUserSession();

            // 启动 Worker 下载任务
            worker.postMessage({
                type: 'start',
                payload: {
                    blockStart: blockStart,
                    blockEnd: min(blockStart + blockSize - 1, sum - 1),
                    fileHash: fileHash,
                    BaseURL: BaseURL,
                    userSession: userSession,
                    blockSize: blockSize,
                    UINT32_MAX_CONST: UINT32_MAX
                }
            });
        });

        workerTasks.push({ worker, promise }); // 将 Worker 及其 Promise 添加到 workerTasks
        return promise;
    };

    // 主下载循环
    while (blocksToDownload.length > 0 || activeWorkers.length > 0) {
        if (downloadError) { // 如果发生错误，则停止所有下载
            break;
        }

        // 启动新的下载任务，直到达到最大并发数或没有更多块可下载
        while (activeWorkers.length < maxConcurrentDownloads && blocksToDownload.length > 0) {
            const blockStart = blocksToDownload.shift(); // 取出下一个待下载的块
            if (blockStart !== undefined) {
                startDownloadTask(blockStart);
            }
        }

        // 如果没有活跃的 Worker 且还有待下载的块，等待一小段时间再重试
        if (activeWorkers.length === 0 && blocksToDownload.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        } else if (activeWorkers.length > 0) {
            // 等待任意一个活跃的 Worker 完成或出错
            try {
                await Promise.race(workerTasks.map(task => task.promise));
            } catch (e) {
                // Promise.race 捕获到错误，但下载错误已在 Worker 内部处理
                console.error("[StealthIM]Promise.race caught an error:", e);
            }
        }
    }

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
