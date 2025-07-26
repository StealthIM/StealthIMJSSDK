import FileReaderWrapper from './fileReader.mjs';
import { blake3 } from '@noble/hashes/blake3';

const CHUNK_SIZE = 2048 * 1024; // 2048 KiB

export async function hashFile(fileReader, onProgress) {
    await fileReader.resetPointer(); // Reset the file pointer to ensure reading from the beginning
    const fileSize = fileReader.getFileSize(); // Get file size from the FileReaderWrapper instance
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);
    const chunkHashes = [];

    for (let i = 0; i < totalChunks; i++) {
        const bytesToRead = Math.min(CHUNK_SIZE, fileSize - (i * CHUNK_SIZE));
        const chunk = await fileReader.read(bytesToRead);

        const hash = blake3(new Uint8Array(chunk));
        chunkHashes.push(hash);

        if (onProgress) {
            const calculatedBytes = (i + 1) * CHUNK_SIZE;
            onProgress({
                calculatedBytes: Math.min(calculatedBytes, fileSize), // Ensure it doesn't exceed fileSize
                totalBytes: fileSize,
                chunkIndex: i,
                totalChunks: totalChunks,
                currentHash: Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')
            });
        }
    }

    // Concatenate all chunk hashes (binary form)
    const concatenatedHashes = new Uint8Array(chunkHashes.length * 32); // Blake3 hash is 32 bytes
    chunkHashes.forEach((hash, index) => {
        concatenatedHashes.set(hash, index * 32);
    });

    // Calculate the final hash of the concatenated hashes
    const finalHash = blake3(concatenatedHashes);

    return Array.from(finalHash).map(b => b.toString(16).padStart(2, '0')).join('');
}

export default hashFile;
