# StealthIM Javascript SDK

> 这个 `sdk` 是用于 `stealthim` 的 `javascript` 版本 `sdk`。这个 sdk 兼容 `web` 和 `nodejs` 环境。
>
> 这个 sdk 解决了你所需要的所有问题，包括但不限于：
>   - 获取记录
>   - 存储消息
>   - 发送消息
>   - 下载文件

这个 SDK 使用 ES Module 格式。使用 Javascript 编写。

## 使用

### 引入

你可以从 `npm` 上安装这个 sdk。也可以在 cdn 上使用 UMD 方式引用。UMD 默认的导出名称为 `StealthIMJSSDK`。我们更推荐使用 ESM 引入。

### 接口

### 初始化

在使用 SDK 的任何功能之前，您需要先进行初始化。

#### `init(baseurl?: string, DBPathOnNode?: string, DBNameOnWeb?: string, Language?: string): Promise<void>`

*   **功能**: 初始化 SDK。
*   **参数**:
    *   `baseurl` (可选): API 的基础 URL，默认为 `"127.0.0.1:8089"`。
    *   `DBPathOnNode` (可选): 在 Node.js 环境中数据库文件的路径，默认为 `".stim/stim-%.db"`。支持使用 `~` 开头，`%` 标识当前的服务器地址。
    *   `DBNameOnWeb` (可选): 在 Web 环境中数据库的名称，默认为 `"stim-%"`。
    *   `Language` (可选): 语言设置，默认为 `"zh-cn"`。支持 `"zh-cn"`、`"en-us"`。
*   **示例**:
    ```javascript
    import stim from './index.mjs';

    async function initializeSDK() {
        await stim.init("https://your-api-server.com:8089");
        console.log("SDK 初始化完成。");
    }
    initializeSDK();
    ```

> 注：在 node 下数据会写入指定的 sqlite 文件。web 下则是写入 indexedDB（实际使用 sql.js，保存间隔为 30s）。

### API 接口

SDK 提供了多个模块来管理不同的功能，包括用户、群组、消息和文件。

以下简称 `StealthIMJSSDK` 为 `stim`。

#### 3.1 通用数据结构

*   **`APIResponse<T = null>`**: 通用的 API 响应接口。
    *   `success`: `boolean` - 操作是否成功。
    *   `error`: `boolean` - 是否发生错误（例如网络错误或服务器内部错误）。
    *   `msg`: `string` - 响应消息，通常用于错误信息或成功提示。
    *   `data`: `T` - 响应数据。
*   **`UserInfo`**: 用户信息接口。
    *   `username`: `string` - 用户名。
    *   `nickname`: `string` - 用户昵称。
    *   `[key: string]: any` - 其他可能的字段。
*   **`GroupPublicInfo`**: 群组公开信息接口。
    *   `name`: `string` - 群组名称。
    *   `create_at`: `number` - 群组创建时间戳。
*   **`GroupMemberInfo`**: 群组成员信息接口。
    *   `username`: `string` - 成员用户名。
    *   `nickname`: `string` - 成员昵称。
    *   `level`: `number` - 成员在群组中的等级（0: Member, 1: Manager, 2: Owner）。
    *   `[key: string]: any` - 其他可能的字段。
*   **`MessageData`**: 消息数据接口。
    *   `groupid`: `number` - 群组 ID。
    *   `msg`: `string` - 消息内容。
    *   `time`: `number` - 消息时间戳。
    *   `msgid`: `number` - 消息 ID。
    *   `hash`: `string` - 消息文件哈希（如果适用）。
    *   `type`: `number` - 消息类型。
    *   `[key: string]: any` - 其他可能的字段。

#### 3.2 用户管理 (`user` 模块)

通过 `stim.user` 对象访问用户相关功能。

*   **`loginWithSession(session?: string): Promise<APIResponse>`**
    *   使用会话登录。
*   **`login(username: string, password: string, remember?: boolean): Promise<APIResponse>`**
    *   使用用户名和密码登录。`remember` 默认为 `true`。即记忆 Session。
*   **`getUserInfo(): Promise<APIResponse<UserInfo> & { session?: string }>`**
    *   获取当前用户信息。
*   **`register(username: string, password: string, nickname: string): Promise<APIResponse>`**
    *   注册新用户。
*   **`deleteUser(sure?: boolean): Promise<APIResponse>`**
    *   删除当前用户账户。`sure` 必须为 `true` 才能执行。
*   **`changeUserData(data: { nickname?: string; password?: string; phone_number?: string; email?: string }): Promise<APIResponse & { step?: string }>`**
    *   更改用户数据。
*   **`getUserNickname(username: string): Promise<string | undefined>`**
    *   获取指定用户的昵称。
*   **`getOtherUserInfo(username: string): Promise<APIResponse<UserInfo>>`**
    *   获取其他用户的公开信息。
*   **`getUserSession(): string`**
    *   获取当前用户会话字符串。如果未登录则抛出错误。

#### 3.3 群组管理 (`group` 模块)

通过 `stim.group` 对象访问群组相关功能。

*   **`setGroupCallback(callback: (data: { groupid: number, type: number, data: any }) => void): void`**
    *   设置群组回调函数，用于接收群组相关事件。当群组列表更新时被触发。
*   **`refershGroups(): Promise<APIResponse<number[]>>`**
    *   刷新用户所属的群组列表。
*   **`getGroupInfo(groupid: number): Promise<APIResponse<GroupMemberInfo[]>>`**
    *   获取指定群组的详细信息（包括成员列表）。
*   **`getGroupPublicInfo(groupid: number): Promise<APIResponse<GroupPublicInfo>>`**
    *   获取指定群组的公开信息。
*   **`createGroup(name: string): Promise<APIResponse>`**
    *   创建新群组。
*   **`joinGroup(groupid: number, password?: string): Promise<APIResponse>`**
    *   加入指定群组。
*   **`inviteToGroup(groupid: number, username: string): Promise<APIResponse>`**
    *   邀请用户加入群组。
*   **`setUserLevel(groupid: number, username: string, level: number): Promise<APIResponse>`**
    *   设置群组成员的等级。
*   **`kickUser(groupid: number, username: string): Promise<APIResponse>`**
    *   将用户踢出群组。
*   **`changeGroupData(groupid: number, data: { name?: string; password?: string }): Promise<APIResponse>`**
    *   更改群组数据。
*   **`group.UserLevel` 常量**: 用户在群组中的等级常量。
    *   `Member: 0` 群友
    *   `Manager: 1` 管理
    *   `Owner: 2` 群主

#### 3.4 消息管理 (`message` 模块)

通过 `stim.message` 对象访问消息相关功能。

*   **`setMsgCallback(callback: (data: { groupid: number, type: number, data: any }) => void): void`**
    *   设置消息回调函数，用于接收新消息时的更新。不推荐将返回结果直接用于更新界面。更推荐进行数据库查询。
*   **`searchMessage(groupid: number, keyword: string, page: number, limit: number): Promise<APIResponse<MessageData[]>>`**
    *   搜索消息。
*   **`sendMessage(groupid: number, content: string, contentType?: number): Promise<APIResponse>`**
    *   发送消息到指定群组。`contentType` 默认为 `Text`。
*   **`recallMessage(groupid: number, msgID: number): Promise<APIResponse>`**
    *   撤回指定群组中的消息。
*   **`pullMessage(groupid: number, callback: (data: { data: MessageData[]; groupid: number }) => boolean | void): Promise<APIResponse>`**
    *   拉取指定群组的消息。
*   **`message.msgType` 常量**: 消息类型常量。
    *   `Text: 0`
    *   `Image: 1`
    *   `LargeEmoji: 2`
    *   `Emoji: 3`
    *   `File: 4`
    *   `Card: 5`
    *   `InnerLink: 6`
    *   `Recall: 16`

#### 3.5 文件管理 (`file` 模块)

通过 `stim.file` 对象访问文件相关功能。

*   **`getFileInfo(fileHash: string): Promise<APIResponse<{ size: bigint }>>`**
    *   获取文件信息，包括文件大小。
*   **`uploadFile(file: File | string, groupid: number, callback: (progress: { stage: string; finished: number; total: number; stage_num: number; stage_total: number; progress: number }) => void): Promise<APIResponse<{ hash: string }>>`**
    *   上传并发送文件。`file` 可以是浏览器中的 `File` 对象或 Node.js 中的文件路径字符串。
*   **`downloadFile(fileHash: string, callback: (progress: { stage: string; finished: number; total: number; stage_num: number; stage_total: number; progress: number }) => void, fileObj?: FileSystemFileHandle | string): Promise<APIResponse>`**
    *   下载文件。`fileObj` 在浏览器中为 `FileSystemFileHandle`，在 Node.js 中为文件路径字符串。

### 后台同步

#### `startBackgroundSync(): void`

*   **功能**: 启动后台同步机制，确保群组和用户昵称得到更新。在登录后调用此函数以保持数据同步。同步为随机选择。如果不起用同步则无法获取新增群的群名。

## 问题

效率问题：

- 上传文件时使用的 blake3 模块为纯 js 实现，效率较低。目前其高性能替代均存在安装问题。
- 下载文件时在浏览器遇到了严重的性能问题。目前无法解决。
