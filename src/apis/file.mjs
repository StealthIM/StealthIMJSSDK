import axios from '../reuqest/request.mjs'
import i18n from '../i18n/load.mjs'
import { getUserSession } from './user.mjs'
import wsx from '../ws/ws.mjs'
import readx from '../file/fileReader.mjs'
import hashFile from '../file/fileHasher.mjs'

var BaseURL = ""
export function setBaseURL(BaseURLx) {
    BaseURL = BaseURLx
}

function min(a, b) {
    return a < b ? a : b
}

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
    for (var retry = 0; retry < 3; retry++) {
        try {
            var resp = await axios.post(BaseURL + "/file/" + fileHash, {}, {
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
            "size": BigInt(resp.data.size),
        }
    }
}

export async function uploadFile(file, groupid, callback) {
    const reader = new readx(file)
    await reader.init()
    const filesize = reader.getFileSize()
    getUserSession()

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
        "stage": "calcHash",
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
        })
    })

    if (!calcHash) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[103], // Hash calculation failed
            "data": null
        }
    }

    // 1. Send MetaData
    const metadata = {
        "size": filesize.toString(),
        "groupid": groupid.toString(),
        "hash": calcHash,
        "filename": reader.getFileName() // 添加文件名到元数据
    }

    callback({
        "stage": "uploadMetadata",
        "finished": 0,
        "total": 1,
        "stage_num": 1,
        "stage_total": 3,
        "progress": 0
    })


    try {
        const url_replace = BaseURL.replace("https://", "wss://").replace("http://", "ws://")
        const ws = new wsx(url_replace + "/file/?authorization=" + getUserSession())

        var pm = new Promise((resolve, reject) => {
            ws.onOpen = resolve
        })
        await ws.connect()
        await pm
        ws.onOpen = () => { }
        ws.send(JSON.stringify(metadata))

        // 2. Send File Body in Blocks
        const blockSize = 2048 * 1024 // 2048 KiB
        await reader.resetPointer()
        var sendBlockList = []

        var end = 0
        var retVal = null
        var finished = 0
        var metaFinish = 0

        ws.onError = function (e) {
            retVal = {
                "success": false,
                "error": true,
                "msg": i18n.t.Errorcode[101],
                "data": null
            }
            end = 1;
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
                        })

                        for (var i = 0; i < Math.floor((filesize + blockSize - 1) / blockSize); i += 1) {
                            sendBlockList.push(i)
                        }

                        callback({
                            "stage": "uploadBlocks",
                            "finished": 0,
                            "total": filesize,
                            "stage_num": 2,
                            "stage_total": 3,
                            "progress": 0
                        })
                        metaFinish = 1
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
                        })
                        end = 1
                        return
                    }
                } else if (data.type === "block") {
                    if (data.result.code != 800) {
                        var blkid = data.blockid
                        sendBlockList.push(blkid)
                    } else {
                        finished += blockSize
                        callback({
                            "stage": "uploadBlocks",
                            "finished": min(finished, filesize),
                            "total": filesize,
                            "stage_num": 2,
                            "stage_total": 3,
                            "progress": min(finished, filesize) / filesize
                        })
                    }
                }
            } catch (e) {
                // Ignore non-JSON or irrelevant messages
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
                })
                continue
            }
            var r = sendBlockList.shift()
            if (typeof r !== "undefined") {

                const block = await reader.read(blockSize, "ArrayBuffer")

                const blockBuffer = new ArrayBuffer(4 + block.byteLength)
                new Uint8Array(blockBuffer, 4).set(new Uint8Array(block))
                const dataView = new DataView(blockBuffer)
                dataView.setUint32(0, r, true) // LittleEndian int32

                ws.send(blockBuffer)
                // Removed setTimeout for performance improvement.
                // If server experiences overload, consider re-introducing a more sophisticated flow control.
            } else {
                // No block to send, wait briefly to avoid busy-waiting
                await new Promise((resolve) => setTimeout(resolve, 50)); // Reduced wait time
            }
        }
        ws.onMessage = () => { }
        ws.close()
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
const UINT32_MAX = 0xFFFFFFFF >>> 0;
export async function downloadFile(fileHash, callback, fileObj = null) {
    if (typeof fileHash !== "string" || fileHash.length !== 64) {
        return {
            "success": false,
            "error": true,
            "msg": i18n.t.Errorcode[100],
            "data": null
        };
    }

    // In browser, fileObj should be a FileSystemFileHandle or null (if user wants to pick file)
    // In Node.js, fileObj should be a string (file path)
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
    var blocksWhenDownloadOnce
    if (typeof window === "undefined") {
        blocksWhenDownloadOnce = 24n // nodejs 下一切正常
    } else {
        blocksWhenDownloadOnce = 1n // 在浏览器上发现了严重的性能问题
    }
    const blockSize = 2048n * 1024n

    callback({
        "stage": "getFileInfo",
        "finished": 0,
        "total": 1,
        "stage_num": 0,
        "stage_total": 2,
        "progress": 0
    })

    var fileInfo = await getFileInfo(fileHash)
    if (!fileInfo.success) {
        return fileInfo
    }

    var size = 0n
    var finished = 0n
    var sum = fileInfo.data.size

    var DownloadNum = blockSize * blocksWhenDownloadOnce
    var writeToFile = async () => { }

    if (typeof window === "undefined") {
        const fs = await import("fs")
        var stat = await new Promise((resolve, reject) => {
            fs.stat(fileObj, (err, stats) => {
                resolve(stats)
            })
        })
        try {
            size = BigInt(stat.size)
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
                    })
                })
            } else {
                finished = size / blockSize
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
                })
            })
        }
        writeToFile = async (data) => {
            await new Promise((resolve, reject) => {
                fs.appendFile(fileObj, data, () => {
                    resolve()
                })
            })
        }
    } else {
        var writeable
        try {
            const file = await fileObj.getFile()
            size = BigInt(file.size)
            if (size >= sum || size % DownloadNum != 0) {
                writeable = await fileObj.createWritable();
            } else {
                finished = size / blockSize
                writeable = await fileObj.createWritable({
                    keepExistingData: true
                });
                await writeable.seek(Number(size))
            }
        } catch (e) {
            writeable = await fileObj.createWritable();
        }
        writeToFile = async (data) => {
            // Avoid closing and re-opening the writableStream for each write
            await writableStream.write(data);
            // The writableStream will be closed once at the end of the downloadFile function
        };
    }

    callback({
        "stage": "getFileInfo",
        "finished": 1,
        "total": 1,
        "stage_num": 0,
        "stage_total": 2,
        "progress": 1
    })



    for (var lblknum = finished / blocksWhenDownloadOnce; lblknum < (sum + DownloadNum - 1n) / DownloadNum; lblknum++) {
        var start = lblknum * DownloadNum
        var end = min((lblknum + 1n) * DownloadNum - 1n, sum - 1n)

        callback({
            "stage": "download",
            "finished": Number(start),
            "total": Number(sum),
            "stage_num": 1,
            "stage_total": 2,
            "progress": Number(start) / Number(sum)
        })

        var startBlockID = start / blockSize
        var blocks = []
        for (var i = 0n; i < ((end - start + blockSize) / blockSize); i++) {
            blocks.push(new ArrayBuffer(Number(blockSize)))
        }
        var finished = 0n
        for (var retry = 0; retry < 3; retry++) {
            try {
                const headers = {
                    "Authorization": `Bearer ${getUserSession()}`,
                    "Range": `bytes=${start}-${end}`
                };
                const response = await fetch(BaseURL + "/file/" + fileHash, {
                    method: "GET",
                    headers: headers,
                });
                var flagSuccess = 0
                var blockid, lenx;
                var datacache = new Uint8Array(); // Current accumulated data
                var readMode = 0; // State machine: 0 = read header, 1 = read data
                var currentOffset = 0; // Offset within datacache for current processing

                for await (const value of response.body) {
                    if (flagSuccess) {
                        break;
                    }

                    // Append new data to datacache
                    const newDatacache = new Uint8Array(datacache.length - currentOffset + value.length);
                    newDatacache.set(datacache.subarray(currentOffset), 0);
                    newDatacache.set(value, datacache.length - currentOffset);
                    datacache = newDatacache;
                    currentOffset = 0; // Reset offset as we have a new buffer

                    while (true) {
                        if (readMode === 0) { // Read header
                            if (datacache.length - currentOffset < 8) {
                                break; // Not enough data for header
                            }
                            const dataViewBID = new DataView(datacache.buffer, datacache.byteOffset + currentOffset, 4);
                            blockid = dataViewBID.getUint32(0, true);

                            const dataViewLen = new DataView(datacache.buffer, datacache.byteOffset + currentOffset + 4, 4);
                            lenx = dataViewLen.getUint32(0, true);

                            currentOffset += 8; // Advance offset past header
                            readMode = 1;
                        }

                        if (readMode === 1) { // Read data
                            if (datacache.length - currentOffset < lenx) {
                                break; // Not enough data for full message
                            }
                            const dataViewMain = new DataView(datacache.buffer, datacache.byteOffset + currentOffset, lenx);

                            if (blockid === UINT32_MAX) {
                                // Parse json
                                try {
                                    var json = JSON.parse(textDecoder.decode(new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength)));
                                } catch (e) {
                                    const buffer = Buffer.from(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength);
                                    const jsonString = buffer.toString('utf-8');
                                    var json = JSON.parse(jsonString);
                                }
                                if (json?.result?.code !== 800 && json?.result?.code !== 0) {
                                    throw new Error(json?.result?.msg);
                                } else {
                                    flagSuccess = 1;
                                    break; // Exit inner while loop and outer for await loop
                                }
                            } else {
                                // Copy block data
                                var newBuffer = new ArrayBuffer(dataViewMain.byteLength);
                                const sourceView = new Uint8Array(dataViewMain.buffer, dataViewMain.byteOffset, dataViewMain.byteLength);
                                var targetView = new Uint8Array(newBuffer);
                                targetView.set(sourceView);
                                blocks[blockid - Number(startBlockID)] = newBuffer;
                            }

                            currentOffset += lenx; // Advance offset past data
                            readMode = 0;

                            finished++;

                            callback({
                                "stage": "download",
                                "finished": Number(min(start + finished * blockSize, sum)),
                                "total": Number(sum),
                                "stage_num": 1,
                                "stage_total": 2,
                                "progress": Number(min(start + finished * blockSize, sum)) / Number(sum)
                            });
                        }
                    }
                }
                if (flagSuccess) {
                    try {
                        if (response.body && typeof response.body.cancel === 'function') {
                            response.body.cancel(); // Cancel the stream
                        }
                    } catch (e) {
                        console.error("Error closing response body:", e);
                    }
                    break;
                }
            } catch (e) {
                console.error("Download block error:", e);
                if (retry === 2) {
                    await closeStreams(); // Close streams on final retry failure
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
        })
        // 拼接为大arraybuffer
        var lenSum = 0
        for (var i = 0; i < blocks.length; i++) {
            lenSum += blocks[i].byteLength
        }
        var newBuffer = new Uint8Array(lenSum);
        var offset = 0
        for (var i = 0; i < blocks.length; i++) {
            var sourceView = new Uint8Array(blocks[i]);
            newBuffer.set(sourceView, i * Number(blockSize));
        }
        await writeToFile(newBuffer)
        // await new Promise((resolve, reject) => {
        //     setTimeout(() => {
        //         resolve()
        //     }, 400)
        // })
    }

    callback({
        "stage": "download",
        "finished": Number(sum),
        "total": Number(sum),
        "stage_num": 1,
        "stage_total": 2,
        "progress": 1
    })

    return {
        "success": true,
        "error": false,
        "msg": "",
        "data": null
    }

}
