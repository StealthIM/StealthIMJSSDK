import { Buffer } from 'buffer'; // 用于Node.js兼容性

/**
 * @class FileReaderWrapper
 * @description 提供跨环境的文件读取接口。
 *              支持从文件路径（Node.js）或FileReader对象（浏览器）读取。
 */
class FileReaderWrapper {
    /**
     * @private
     * @type {string|File|null}
     */
    #source = null;

    /**
     * @private
     * @type {FileReader|null}
     */
    #browserFileReader = null;

    /**
     * @private
     * @type {number}
     */
    #nodeFileDescriptor = -1;

    /**
     * @private
     * @type {number}
     */
    #currentOffset = 0; // 跟踪读取位置的私有变量

    /**
     * @private
     * @type {number|null}
     */
    #fileSize = null; // 文件大小的私有变量

    /**
     * @private
     * @type {string|null}
     */
    #fileName = null; // 文件名的私有变量

    /**
     * @private
     * @type {boolean}
     */
    #isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

    /**
     * 创建FileReaderWrapper实例。
     * @param {string|File} source - 文件路径（Node.js）或File对象（浏览器）。
     */
    constructor(source) {
        if (!source) {
            throw new Error('Source (file path or File object) is required.');
        }
        this.#source = source;
        this.#currentOffset = 0; // 初始化偏移量
    }

    /**
     * 初始化文件读取器并根据环境检索文件元数据。
     * 在执行任何读取操作或访问文件元数据之前必须调用此方法。
     * @returns {Promise<void>} 初始化完成时解析的Promise。
     */
    async init() {
        if (this.#isNode) {
            const fs = await import('fs/promises');
            const path = await import('path');
            try {
                this.#nodeFileDescriptor = await fs.open(this.#source, 'r');
                const stats = await fs.stat(this.#source);
                this.#fileSize = stats.size;
                this.#fileName = path.basename(this.#source);
            } catch (error) {
                console.error('Failed to open file or get stats in Node.js:', error);
                throw error;
            }
        } else {
            if (!(this.#source instanceof File)) {
                throw new Error('In browser environment, source must be a File object.');
            }
            this.#browserFileReader = new FileReader();
            this.#fileSize = this.#source.size;
            this.#fileName = this.#source.name;
        }
    }

    /**
     * 从当前偏移量开始读取固定长度的文件内容。
     * 读取后更新内部偏移量。
     * @param {number} length - 要读取的字节数。
     * @param {string} [type='ArrayBuffer'] - 要读取的内容类型（'ArrayBuffer'或'Text'）。
     * @param {number} [offset=-1] - 读取的起始偏移量。如果为-1，则使用当前偏移量。
     * @returns {Promise<ArrayBuffer|string>} 解析为文件内容的Promise。
     */
    async read(length, type = 'ArrayBuffer', offset = -1) {
        if (typeof length !== 'number' || length < 0) {
            throw new Error('Length must be a non-negative number.');
        }
        if (offset == -1) {
            offset = this.#currentOffset;
        }

        if (this.#isNode) {
            if (this.#nodeFileDescriptor === -1) {
                await this.init(); // 如果描述符已关闭或未打开，则重新初始化
            }
            const buffer = Buffer.alloc(length);
            const { bytesRead, buffer: readBuffer } = await this.#nodeFileDescriptor.read(buffer, 0, length, offset);
            this.#currentOffset += bytesRead; // 更新偏移量

            if (bytesRead === 0) {
                return new ArrayBuffer(0); // 文件结尾
            }
            var buff = readBuffer.buffer
            buff = buff.slice(0, bytesRead);

            return buff;
        } else {
            return new Promise((resolve, reject) => {
                this.#browserFileReader.onload = (event) => {
                    this.#currentOffset += (event.target.result instanceof ArrayBuffer) ? event.target.result.byteLength : event.target.result.length;
                    resolve(event.target.result);
                };
                this.#browserFileReader.onerror = (error) => reject(error);

                const endOffset = offset + length;
                const slice = this.#source.slice(offset, endOffset);

                if (type === 'ArrayBuffer') {
                    this.#browserFileReader.readAsArrayBuffer(slice);
                } else if (type === 'Text') {
                    this.#browserFileReader.readAsText(slice);
                } else {
                    reject(new Error('Unsupported read type. Use "ArrayBuffer" or "Text".'));
                }
            });
        }
    }

    /**
     * 将读取指针重置到文件开头。
     * 对于Node.js，它会重新打开文件描述符。
     * 对于浏览器，它有效地为新的读取操作做准备。
     */
    async resetPointer() {
        this.#currentOffset = 0; // 重置偏移量
        if (this.#isNode) {
            if (this.#nodeFileDescriptor !== -1) {
                await this.#nodeFileDescriptor.close();
                this.#nodeFileDescriptor = -1; // 标记为已关闭
            }
            await this.init(); // 重新打开文件
        } else {
            // 在浏览器中，FileReader没有“指针”概念。
            // 新的读取操作有效地从File对象的开头开始。
            // 如果需要，我们可以重新实例化FileReader，但这不是严格必要的
            // 因为readAsArrayBuffer/readAsText总是从File对象的开头开始。
            this.#browserFileReader = new FileReader();
        }
    }

    /**
     * 在Node.js环境中关闭文件描述符。
     * 在浏览器环境中无操作。
     */
    async close() {
        if (this.#isNode && this.#nodeFileDescriptor !== -1) {
            try {
                await this.#nodeFileDescriptor.close();
                this.#nodeFileDescriptor = -1;
            } catch (error) {
                console.error('Failed to close file in Node.js:', error);
            }
        }
    }

    /**
     * 获取文件大小（字节）。
     * @returns {number|null} 文件大小，如果尚未确定则为null。
     */
    getFileSize() {
        return this.#fileSize;
    }

    /**
     * 获取文件名。
     * @returns {string|null} 文件名，如果尚未确定则为null。
     */
    getFileName() {
        return this.#fileName;
    }
}

export default FileReaderWrapper;
