import { Buffer } from 'buffer'; // For Node.js compatibility

/**
 * @class FileReaderWrapper
 * @description Provides a cross-environment file reading interface.
 *              Supports reading from a file path (Node.js) or a FileReader object (Browser).
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
    #currentOffset = 0; // New private variable to track read position

    /**
     * @private
     * @type {number|null}
     */
    #fileSize = null; // New private variable for file size

    /**
     * @private
     * @type {string|null}
     */
    #fileName = null; // New private variable for file name

    /**
     * @private
     * @type {boolean}
     */
    #isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

    /**
     * Creates an instance of FileReaderWrapper.
     * @param {string|File} source - The file path (Node.js) or a File object (Browser).
     */
    constructor(source) {
        if (!source) {
            throw new Error('Source (file path or File object) is required.');
        }
        this.#source = source;
        this.#currentOffset = 0; // Initialize offset
    }

    /**
     * Initializes the file reader and retrieves file metadata based on the environment.
     * This method must be called before performing any read operations or accessing file metadata.
     * @returns {Promise<void>} A promise that resolves when initialization is complete.
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
     * Reads a fixed length of content from the file starting from the current offset.
     * Updates the internal offset after reading.
     * @param {number} length - The number of bytes to read.
     * @param {string} [type='ArrayBuffer'] - The type of content to read ('ArrayBuffer' or 'Text').
     * @returns {Promise<ArrayBuffer|string>} A promise that resolves with the file content.
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
                await this.init(); // Re-initialize if descriptor is closed or not opened
            }
            const buffer = Buffer.alloc(length);
            const { bytesRead, buffer: readBuffer } = await this.#nodeFileDescriptor.read(buffer, 0, length, offset);
            this.#currentOffset += bytesRead; // Update offset

            if (bytesRead === 0) {
                return new ArrayBuffer(0); // End of file
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
     * Resets the read pointer to the beginning of the file.
     * For Node.js, it reopens the file descriptor.
     * For Browser, it effectively prepares for a new read operation.
     */
    async resetPointer() {
        this.#currentOffset = 0; // Reset offset
        if (this.#isNode) {
            if (this.#nodeFileDescriptor !== -1) {
                await this.#nodeFileDescriptor.close();
                this.#nodeFileDescriptor = -1; // Mark as closed
            }
            await this.init(); // Reopen the file
        } else {
            // In browser, FileReader doesn't have a "pointer" concept.
            // A new read operation effectively starts from the beginning of the File object.
            // We can re-instantiate FileReader if needed, but it's not strictly necessary
            // as readAsArrayBuffer/readAsText always start from the beginning of the File object.
            this.#browserFileReader = new FileReader();
        }
    }

    /**
     * Closes the file descriptor in Node.js environment.
     * No-op in browser environment.
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
     * Gets the size of the file in bytes.
     * @returns {number|null} The file size, or null if not yet determined.
     */
    getFileSize() {
        return this.#fileSize;
    }

    /**
     * Gets the name of the file.
     * @returns {string|null} The file name, or null if not yet determined.
     */
    getFileName() {
        return this.#fileName;
    }
}

export default FileReaderWrapper;
