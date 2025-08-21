import FileReaderWrapper from './fileReader.mjs';
import { blake3 } from '@noble/hashes/blake3';

// 定义文件分块大小，2048 KiB
const CHUNK_SIZE = 2048 * 1024; // 2048 KiB

/**
 * 计算文件的Blake3哈希值
 * @param {FileReaderWrapper} fileReader - 文件读取器实例
 * @param {function} onProgress - 进度回调函数
 * @returns {Promise<string>} 文件的最终哈希值
 */
export async function hashFile(fileReader, onProgress) {
    // 重置文件指针，确保从文件开头读取
    await fileReader.resetPointer();
    // 获取文件大小
    const fileSize = fileReader.getFileSize();
    // 计算总块数
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    // 用于存储每个块的哈希值
    const chunkHashes = [];

    // 遍历所有文件块
    for (let i = 0; i < totalChunks; i++) {
        // 计算当前块需要读取的字节数
        const bytesToRead = Math.min(CHUNK_SIZE, fileSize - (i * CHUNK_SIZE));
        // 读取文件块
        const chunk = await fileReader.read(bytesToRead);

        // 计算当前块的Blake3哈希值
        const hash = blake3(new Uint8Array(chunk));
        // 将块哈希添加到列表中
        chunkHashes.push(hash);

        // 如果提供了进度回调函数，则调用它
        if (onProgress) {
            // 计算已处理的字节数
            const calculatedBytes = (i + 1) * CHUNK_SIZE;
            onProgress({
                // 确保已计算字节数不超过文件大小
                calculatedBytes: Math.min(calculatedBytes, fileSize),
                // 文件总大小
                totalBytes: fileSize,
                // 当前块的索引
                chunkIndex: i,
                // 总块数
                totalChunks: totalChunks,
                // 当前块的哈希值（十六进制字符串形式）
                currentHash: Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')
            });
        }
    }

    // 连接所有块的哈希值（二进制形式）
    // Blake3哈希是32字节
    const concatenatedHashes = new Uint8Array(chunkHashes.length * 32);
    chunkHashes.forEach((hash, index) => {
        concatenatedHashes.set(hash, index * 32);
    });

    // 计算连接后的哈希值的最终哈希值
    const finalHash = blake3(concatenatedHashes);

    // 将最终哈希值转换为十六进制字符串并返回
    return Array.from(finalHash).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default hashFile;
