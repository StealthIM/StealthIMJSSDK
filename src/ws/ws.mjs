/**
 * @class WebSocketClient
 * @description Provides a cross-environment WebSocket client interface.
 *              Automatically uses native WebSocket in browser and 'ws' library in Node.js.
 */
class WebSocketClient {
    /**
     * @private
     * @type {WebSocket|import('ws')|null}
     */
    #ws = null;

    /**
     * @private
     * @type {string}
     */
    #url;

    /**
     * @private
     * @type {boolean}
     */
    #isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;

    /**
     * Creates an instance of WebSocketClient.
     * @param {string} url - The WebSocket server URL.
     */
    constructor(url) {
        if (!url) {
            throw new Error('WebSocket URL is required.');
        }
        this.#url = url;
    }

    /**
     * Connects to the WebSocket server.
     * @returns {Promise<void>} A promise that resolves when the connection is open.
     */
    async connect() {
        return new Promise(async (resolve, reject) => {
            if (this.#isNode) {
                // In Node.js, use the 'ws' library.
                // Make sure 'ws' is installed: npm install ws
                const WebSocket = (await import('ws')).default;
                this.#ws = new WebSocket(this.#url);
            } else {
                // In browser, use the native WebSocket API.
                this.#ws = new WebSocket(this.#url);
            }

            if (this.#isNode) {
                this.#ws.on('open', () => {
                    if (this.onOpen) {
                        this.onOpen(); // 'ws' library's 'open' event doesn't pass an event object
                    }
                    resolve();
                });

                this.#ws.on('message', (data) => {
                    if (this.onMessage) {
                        this.onMessage(data.toString()); // 'ws' library passes Buffer, convert to string
                    }
                });

                this.#ws.on('close', (code, reason) => {
                    if (this.onClose) {
                        // Create a CloseEvent-like object for consistency
                        this.onClose({ code, reason: reason.toString(), wasClean: true });
                    }
                });

                this.#ws.on('error', (error) => {
                    if (this.onError) {
                        this.onError(error);
                    }
                    reject(error);
                });
            } else {
                this.#ws.onopen = (event) => {
                    console.log('WebSocket connected (Browser):', event);
                    if (this.onOpen) {
                        this.onOpen(event);
                    }
                    resolve();
                };

                this.#ws.onmessage = (event) => {
                    console.log('WebSocket message received (Browser):', event.data);
                    if (this.onMessage) {
                        this.onMessage(event.data);
                    }
                };

                this.#ws.onclose = (event) => {
                    console.log('WebSocket disconnected (Browser):', event);
                    if (this.onClose) {
                        this.onClose(event);
                    }
                };

                this.#ws.onerror = (error) => {
                    console.error('WebSocket error (Browser):', error);
                    if (this.onError) {
                        this.onError(error);
                    }
                    reject(error);
                };
            }
        });
    }

    /**
     * Sends a message through the WebSocket.
     * @param {string|ArrayBuffer|Blob} message - The message to send.
     */
    send(message) {
        if (this.#ws && this.#ws.readyState === (this.#isNode ? this.#ws.OPEN : WebSocket.OPEN)) {
            this.#ws.send(message);
        }
    }

    /**
     * Closes the WebSocket connection.
     * @param {number} [code] - A numeric value indicating the reason for the close.
     * @param {string} [reason] - A human-readable string explaining why the connection is closing.
     */
    close(code, reason) {
        if (this.#ws) {
            this.#ws.close(code, reason);
        }
    }

    /**
     * Event handler for when the WebSocket connection opens.
     * Override this method to handle open events.
     * @param {Event} event - The open event.
     */
    onOpen(event) {
        // Default handler, can be overridden
    }

    /**
     * Event handler for when a message is received from the WebSocket.
     * Override this method to handle incoming messages.
     * @param {string|ArrayBuffer|Blob} data - The received message data.
     */
    onMessage(data) {
        // Default handler, can be overridden
    }

    /**
     * Event handler for when the WebSocket connection closes.
     * Override this method to handle close events.
     * @param {CloseEvent} event - The close event.
     */
    onClose(event) {
        // Default handler, can be overridden
    }

    /**
     * Event handler for WebSocket errors.
     * Override this method to handle error events.
     * @param {Event} error - The error event.
     */
    onError(error) {
        // Default handler, can be overridden
    }
}

export default WebSocketClient;
