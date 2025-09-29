// src/sse/sse.mjs

/**
 * SSEClient 提供了在浏览器和 Node.js 环境中连接 Server-Sent Events (SSE) 的统一接口。
 */
class SSEClient {
    /**
     * @param {string} url - SSE 服务的 URL。
     * @param {object} [options={}] - 配置选项。
     * @param {object} [options.headers={}] - 在 Node.js 环境中使用的请求头。
     * @param {number} [options.reconnectInterval=3000] - 自动重连的间隔时间（毫秒）。
     * @param {object} [options.reconnectQueryOverrides={}] - 重连时覆盖的 query 参数，例如 { key: 'value' }。
     */
    constructor(url, options = {}, need_reconnect = true) {
        this.url = url;
        this.options = {
            headers: {},
            reconnectInterval: 3000,
            reconnectQueryOverrides: {},
            ...options
        };
        this.eventSource = null;
        this.listeners = {};
        this.isConnecting = false;
        this.shouldReconnect = true; // 控制是否尝试重连
        this.reconnectAttempts = []; // 存储最近重连时间戳，用于限制重连次数
        this.lastEventId = null; // 添加 lastEventId 初始化
        this.need_reconnect = need_reconnect;
    }

    /**
     * 连接到 SSE 服务。
     */
    connect() {
        if (this.isConnecting) {
            return;
        }
        this.isConnecting = true;
        this.shouldReconnect = true; // 每次调用 connect() 都允许重连
        this.reconnectAttempts = []; // 重置重连尝试计数

        if (typeof window !== 'undefined') {
            // 浏览器环境，使用 XHR
            this._connectBrowserXHR();
        } else if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
            // Node.js 环境
            this._connectNodeJS();
        } else {
            throw new Error("Unsupported environment for SSEClient.");
        }
    }

    /**
     * 在浏览器环境中使用 XHR 连接到 SSE 服务。
     */
    _connectBrowserXHR() {
        this.eventSource = new XMLHttpRequest();
        this.eventSource.open('GET', this.url);
        this.eventSource.setRequestHeader('Accept', 'text/event-stream');
        this.eventSource.setRequestHeader('Cache-Control', 'no-cache');

        // // 如果有 Last-Event-ID，则添加
        // if (this.lastEventId) {
        //     this.eventSource.setRequestHeader('Last-Event-ID', this.lastEventId);
        // }

        // 添加自定义请求头
        for (const header in this.options.headers) {
            this.eventSource.setRequestHeader(header, this.options.headers[header]);
        }

        let lastIndex = 0;
        this.eventSource.onprogress = () => {
            const newText = this.eventSource.responseText.substring(lastIndex);
            this._parseSSEData(newText);
            lastIndex = this.eventSource.responseText.length;
        };

        this.eventSource.onload = () => {
            this.isConnecting = false;
            this._dispatchEvent('open', { target: this.eventSource }); // 模拟 EventSource 的 open 事件
            console.log('SSE stream loaded (XHR).');
            // 添加条件检查，仅当需要重连时才重连
            if (this.need_reconnect) {
                this._reconnect();
            } else {
                this._dispatchEvent('end', {
                    // attempt: recentAttempts,
                    url: this.url,
                    interval: this.options.reconnectInterval
                });
            }
        };

        this.eventSource.onerror = (event) => {
            this.isConnecting = false;
            this._handleError(event);
            // 添加条件检查，仅当需要重连时才重连
            if (this.need_reconnect) {
                this._reconnect();
            } else {
                this._dispatchEvent('close', {
                    // attempt: recentAttempts,
                    url: this.url,
                    interval: this.options.reconnectInterval
                });
            }
        };

        this.eventSource.onabort = () => {
            this.isConnecting = false;
            // 不重连，因为是主动关闭 else {
            this._dispatchEvent('close', {
                // attempt: recentAttempts,
                url: this.url,
                interval: this.options.reconnectInterval
            });

        };

        this.eventSource.send();
    }

    /**
     * 处理错误事件。
     * @param {Event|Error} error - 错误事件或 Error 对象。
     */
    _handleError(error) {
        console.error('SSE Error:', error);
        this._dispatchEvent('error', error);
    }

    /**
     * 尝试重连。
     */
    _reconnect() {
        if (!this.need_reconnect) {
            return;
        }
        if (this.shouldReconnect) {
            // 应用 query overrides
            // if (Object.keys(this.options.reconnectQueryOverrides).length > 0) {
            //     try {
            //         const urlObj = new URL(this.url);
            //         Object.entries(this.options.reconnectQueryOverrides).forEach(([key, value]) => {
            //             urlObj.searchParams.set(key, String(value));
            //         });
            //         this.url = urlObj.toString();
            //     } catch (e) {
            //         console.error('Invalid URL for reconnect overrides:', e);
            //         this._handleError(e);
            //         return;
            //     }
            // }

            // 记录重连尝试时间戳
            const now = Date.now();
            this.reconnectAttempts.push(now);
            // 清理超过1分钟的时间戳
            this.reconnectAttempts = this.reconnectAttempts.filter(timestamp => now - timestamp <= 60000);
            // 计算最近1分钟的重连次数
            const recentAttempts = this.reconnectAttempts.length;
            if (recentAttempts > 3) {
                this.shouldReconnect = false;
                const error = new Error('在1分钟内重连尝试超过3次，连接断开');
                this._handleError(error);
                this.close();
                return;
            }

            // 触发 reconnect 事件
            this._dispatchEvent('reconnect', {
                attempt: recentAttempts,
                url: this.url,
                interval: this.options.reconnectInterval
            });

            console.log(`Attempting to reconnect in ${this.options.reconnectInterval / 1000} seconds...`);
            setTimeout(() => {
                this.connect();
            }, this.options.reconnectInterval);
        }
    }

    /**
     * 注册事件监听器。
     * @param {string} eventName - 事件名称（例如 'message', 'open', 'error' 或自定义事件）。
     * @param {function} callback - 事件发生时调用的回调函数。
     */
    on(eventName, callback) {
        if (!this.listeners[eventName]) {
            this.listeners[eventName] = [];
        }
        this.listeners[eventName].push(callback);
        // 在 XHR 和 Node.js 环境中，事件都通过 _dispatchEvent 内部处理，不需要原生监听器
    }

    /**
     * 移除事件监听器。
     * @param {string} eventName - 事件名称。
     * @param {function} callback - 要移除的回调函数。
     */
    off(eventName, callback) {
        if (this.listeners[eventName]) {
            this.listeners[eventName] = this.listeners[eventName].filter(cb => cb !== callback);
        }
        // 在 XHR 和 Node.js 环境中，事件都通过 _dispatchEvent 内部处理，不需要原生监听器
    }

    /**
     * 触发事件并调用所有注册的回调函数。
     * @param {string} eventName - 要触发的事件名称。
     * @param {*} data - 传递给回调函数的数据。
     */
    _dispatchEvent(eventName, data) {
        if (this.listeners[eventName]) {
            this.listeners[eventName].forEach(callback => {
                try {
                    callback(data);
                } catch (e) {
                    console.error(`Error in SSE event listener for '${eventName}':`, e);
                }
            });
        }
    }

    /**
     * 关闭 SSE 连接。
     */
    close() {
        this.shouldReconnect = false; // 阻止重连
        this.reconnectAttempts = []; // 清理重连尝试记录
        if (this.eventSource) {
            if (typeof window !== 'undefined') {
                // 浏览器环境，使用 XHR 的 abort 方法
                if (this.eventSource && typeof this.eventSource.abort === 'function') {
                    this.eventSource.abort();
                }
            } else if (typeof process !== 'undefined' && process.versions != null && process.versions.node != null) {
                // Node.js 环境，使用 http.ClientRequest 的 abort 方法
                if (this.eventSource && typeof this.eventSource.abort === 'function') {
                    this.eventSource.abort();
                }
            }
            this.eventSource = null;
        }
        this.isConnecting = false;
        // console.log('SSE connection closed by client.');
    }

    /**
     * 在 Node.js 环境中连接到 SSE 服务。
     * 使用内置的 http/https 模块。
     */
    _connectNodeJS() {
        const url = new URL(this.url);
        const protocol = url.protocol === 'https:' ? require('https') : require('http');
        const lastEventId = this.lastEventId; // 用于断线重连

        const requestOptions = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                ...this.options.headers
            }
        };

        if (lastEventId) {
            requestOptions.headers['Last-Event-ID'] = lastEventId;
        }

        this.eventSource = protocol.request(requestOptions, (res) => {
            this.isConnecting = false;

            if (res.statusCode !== 200) {
                const error = new Error(`SSE connection failed with status: ${res.statusCode}`);
                this._handleError(error);
                // 添加条件检查，仅当需要重连时才重连
                if (this.need_reconnect) {
                    this._reconnect();
                } else {
                    this._dispatchEvent('close', {
                        // attempt: recentAttempts,
                        url: this.url,
                        interval: this.options.reconnectInterval
                    });
                }
                return;
            }

            this._dispatchEvent('open', { target: this.eventSource }); // 模拟 EventSource 的 open 事件

            let buffer = '';
            res.on('data', (chunk) => {
                buffer += chunk.toString();
                this._parseSSEData(buffer);
                // 清除已处理的数据
                const lastNewline = buffer.lastIndexOf('\n\n');
                if (lastNewline !== -1) {
                    buffer = buffer.substring(lastNewline + 2);
                }
            });

            res.on('end', () => {
                // console.log('SSE stream ended.');
                this.isConnecting = false;
                // 添加条件检查，仅当需要重连时才重连
                if (this.need_reconnect) {
                    this._reconnect();
                } else {
                    this._dispatchEvent('end', {
                        // attempt: recentAttempts,
                        url: this.url,
                        interval: this.options.reconnectInterval
                    });
                }

            });

            res.on('close', () => {
                // console.log('SSE stream closed.');
                this.isConnecting = false;
                // 添加条件检查，仅当需要重连时才重连
                if (this.need_reconnect) {
                    this._reconnect();
                } else {
                    this._dispatchEvent('close', {
                        // attempt: recentAttempts,
                        url: this.url,
                        interval: this.options.reconnectInterval
                    });
                }
            });
        });

        this.eventSource.on('error', (error) => {
            this.isConnecting = false;
            this._handleError(error);
            // 添加条件检查，仅当需要重连时才重连
            if (this.need_reconnect) {
                this._reconnect();
            }
        });

        this.eventSource.end(); // 发送请求
    }

    /**
     * 解析 SSE 数据块。
     * @param {string} data - 接收到的 SSE 数据。
     */
    _parseSSEData(data) {
        const lines = data.split(/\r?\n/);
        let event = {
            id: undefined,
            event: 'message',
            data: '',
            retry: undefined
        };

        for (const line of lines) {
            if (line.trim() === '') {
                // 空行表示事件结束
                if (event.data !== '') {
                    this._dispatchEvent(event.event, {
                        data: event.data.endsWith('\n') ? event.data.slice(0, -1) : event.data,
                        lastEventId: event.id,
                        type: event.event
                    });
                    if (event.id) {
                        this.lastEventId = event.id; // 更新 lastEventId
                    }
                }
                // 重置事件对象
                event = {
                    id: undefined,
                    event: 'message',
                    data: '',
                    retry: undefined
                };
                continue;
            }

            const colonIndex = line.indexOf(':');
            if (colonIndex === -1) {
                // 忽略没有冒号的行
                continue;
            }

            let field = line.substring(0, colonIndex);
            let value = line.substring(colonIndex + 1);

            if (value.startsWith(' ')) {
                value = value.substring(1);
            }

            switch (field) {
                case 'event':
                    event.event = value;
                    break;
                case 'data':
                    event.data += value + '\n'; // 数据可以跨多行
                    break;
                case 'id':
                    event.id = value;
                    this.lastEventId = value; // 更新最后一个事件ID
                    break;
                case 'retry':
                    const retryValue = parseInt(value, 10);
                    if (!isNaN(retryValue)) {
                        event.retry = retryValue;
                        this.options.reconnectInterval = retryValue; // 更新重连间隔
                    }
                    break;
                default:
                    // 忽略未知字段
                    break;
            }
        }
    }
}
module.exports = SSEClient;
