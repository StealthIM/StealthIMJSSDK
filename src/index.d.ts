declare module 'stealthimjssdk' {
    /**
     * 通用的API响应接口。
     * @template T - 响应数据的数据类型，默认为null。
     */
    interface APIResponse<T = null> {
        /** 操作是否成功。 */
        success: boolean;
        /** 是否发生错误（例如网络错误或服务器内部错误）。 */
        error: boolean;
        /** 响应消息，通常用于错误信息或成功提示。 */
        msg: string;
        /** 响应数据。 */
        data: T;
    }

    /**
     * 用户信息接口。
     */
    interface UserInfo {
        /** 用户名。 */
        username: string;
        /** 用户昵称。 */
        nickname: string;
        /** 其他可能的字段。 */
        [key: string]: any;
    }

    /**
     * 群组公开信息接口。
     */
    interface GroupPublicInfo {
        /** 群组名称。 */
        name: string;
        /** 群组创建时间戳。 */
        create_at: number;
    }

    /**
     * 群组成员信息接口。
     */
    interface GroupMemberInfo {
        /** 成员用户名。 */
        username: string;
        /** 成员昵称。 */
        nickname: string;
        /** 成员在群组中的等级：0: Member, 1: Manager, 2: Owner。 */
        level: number;
        /** 其他可能的字段。 */
        [key: string]: any;
    }

    /**
     * 消息数据接口。
     */
    interface MessageData {
        /** 群组ID。 */
        groupid: number;
        /** 消息内容。 */
        msg: string;
        /** 消息时间戳。 */
        time: number;
        /** 消息ID。 */
        msgid: number;
        /** 消息文件哈希（如果适用）。 */
        hash: string;
        /** 消息类型。 */
        type: number;
        /** 其他可能的字段。 */
        [key: string]: any;
    }

    /**
     * 初始化SDK。
     * @param baseurl - API的基础URL，默认为"127.0.0.1:8089"。
     * @param DBPathOnNode - 在Node.js环境中数据库文件的路径，默认为".stim/stim-%.db"。
     * @param DBNameOnWeb - 在Web环境中数据库的名称，默认为"stim-%"。
     * @param Language - 语言设置，默认为"zh-cn"。
     */
    export function init(baseurl?: string, DBPathOnNode?: string, DBNameOnWeb?: string, Language?: string, wasmUseLocal: string = ""): Promise<void>;

    export const user: {
        /**
         * 使用会话登录。
         * @param session - 可选的会话字符串。
         * @returns API响应。
         */
        loginWithSession(session?: string): Promise<APIResponse>;
        /**
         * 使用用户名和密码登录。
         * @param username - 用户名。
         * @param password - 密码。
         * @param remember - 是否记住会话，默认为true。
         * @returns API响应。
         */
        login(username: string, password: string, remember?: boolean): Promise<APIResponse>;
        /**
         * 获取当前用户信息。
         * @returns 包含用户信息和会话的API响应。
         */
        getUserInfo(): Promise<APIResponse<UserInfo> & { session?: string }>;
        /**
         * 注册新用户。
         * @param username - 用户名。
         * @param password - 密码。
         * @param nickname - 昵称。
         * @returns API响应。
         */
        register(username: string, password: string, nickname: string): Promise<APIResponse>;
        /**
         * 删除当前用户账户。
         * @param sure - 确认删除，必须为true。
         * @returns API响应。
         */
        deleteUser(sure?: boolean): Promise<APIResponse>;
        /**
         * 更改用户数据。
         * @param data - 包含要更改的用户信息的对象。
         * @returns API响应。
         */
        changeUserData(data: { nickname?: string; password?: string; phone_number?: string; email?: string }): Promise<APIResponse & { step?: string }>;
        /**
         * 获取指定用户的昵称。
         * @param username - 用户名。
         * @returns 用户的昵称或undefined。
         */
        getUserNickname(username: string): Promise<string | undefined>;
        /**
         * 获取其他用户的公开信息。
         * @param username - 其他用户的用户名。
         * @returns 包含其他用户信息和会话的API响应。
         */
        getOtherUserInfo(username: string): Promise<APIResponse<UserInfo>>;
        /**
         * 获取当前用户会话。
         * @returns 用户会话字符串。
         * @throws 如果未登录则抛出错误。
         */
        getUserSession(): string;
        /**
         * 注销当前用户会话。
         * @returns 始终成功。
         * */
        logout(): Promise<APIResponse>;
    };

    export const group: {
        /**
         * 设置群组回调函数。
         * @param callback - 群组回调函数。
         */
        setGroupCallback(callback: (data: { groupid: number, type: number, data: any }) => void): void;
        /**
         * 刷新用户所属的群组列表。
         * @returns 包含群组ID列表的API响应。
         */
        refershGroups(): Promise<APIResponse<number[]>>;
        /**
         * 获取指定群组的详细信息（包括成员列表）。
         * @param groupid - 群组ID。
         * @returns 包含群组成员信息的API响应。
         */
        getGroupInfo(groupid: number): Promise<APIResponse<GroupMemberInfo[]>>;
        /**
         * 获取指定群组的公开信息。
         * @param groupid - 群组ID。
         * @returns 包含群组公开信息的API响应。
         */
        getGroupPublicInfo(groupid: number): Promise<APIResponse<GroupPublicInfo>>;
        /**
         * 创建新群组。
         * @param name - 群组名称。
         * @returns API响应。
         */
        createGroup(name: string): Promise<APIResponse>;
        /**
         * 加入指定群组。
         * @param groupid - 群组ID。
         * @param password - 群组密码（如果需要）。
         * @returns API响应。
         */
        joinGroup(groupid: number, password?: string): Promise<APIResponse>;
        /**
         * 邀请用户加入群组。
         * @param groupid - 群组ID。
         * @param username - 被邀请的用户名。
         * @returns API响应。
         */
        inviteToGroup(groupid: number, username: string): Promise<APIResponse>;
        /**
         * 设置群组成员的等级。
         * @param groupid - 群组ID。
         * @param username - 成员用户名。
         * @param level - 新的等级（0: Member, 1: Manager, 2: Owner）。
         * @returns API响应。
         */
        setUserLevel(groupid: number, username: string, level: number): Promise<APIResponse>;
        /**
         * 将用户踢出群组。
         * @param groupid - 群组ID。
         * @param username - 被踢出的用户名。
         * @returns API响应。
         */
        kickUser(groupid: number, username: string): Promise<APIResponse>;
        /**
         * 更改群组数据。
         * @param groupid - 群组ID。
         * @param data - 包含要更改的群组信息的对象。
         * @returns API响应。
         */
        changeGroupData(groupid: number, data: { name?: string; password?: string }): Promise<APIResponse>;
        /**
         * 获取群列表。
         * @returns 包含群组ID列表的API响应。
         */
        getGroups(): Promise<{ groupid: number; name: string | "" }[]>;
        /**
         * 用户在群组中的等级常量。
         */
        UserLevel: {
            Member: 0;
            Manager: 1;
            Owner: 2;
        };
    };

    export const message: {
        /**
         * 设置消息回调函数。
         * @param callback - 消息回调函数。
         */
        setMsgCallback(callback: (data: { groupid: number, type: number, data: any }) => void): void;
        /**
         * 搜索消息。按 DESC 顺序返回。
         * @param groupid - 群组ID。
         * @param msgID - 最老消息的ID。0 表示返回所有消息。
         * @param page - 页码。
         * @param limit - 每页限制数量。
         * @param other_sql - 其他SQL查询语句。
         * @param compare - 查询msgID时比较符号，默认为"<"。
         * @returns 包含消息数据的API响应。
         */
        searchMessage(groupid: number, msgID: number, limit: number = 1000, offset: number = 0, other_sql: string = "", compare: string = "<"): Promise<APIResponse<MessageData[]>>;
        /**
         * 发送消息到指定群组。
         * @param groupid - 群组ID。
         * @param content - 消息内容。
         * @param contentType - 消息类型，默认为Text。
         * @returns API响应。
         */
        sendMessage(groupid: number, content: string, contentType?: number): Promise<APIResponse>;
        /**
         * 撤回指定群组中的消息。
         * @param groupid - 群组ID。
         * @param msgID - 要撤回的消息ID。
         * @returns API响应。
         */
        recallMessage(groupid: number, msgID: number): Promise<APIResponse>;
        /**
         * 拉取指定群组的消息。
         * @param groupid - 群组ID。
         * @param onSuccess - 消息回调函数，接收包含消息数据和群组ID的对象。
         * @returns API响应。
         */
        pullMessage(groupid: number, onSuccess: ((close) => void)): Promise<APIResponse>;
        /**
         * 消息类型常量。
         */
        msgType: {
            Text: 0;
            Image: 1;
            LargeEmoji: 2;
            Emoji: 3;
            File: 4;
            Card: 5;
            InnerLink: 6;
            Recall: 16;
        };
    };

    export const file: {
        /**
         * 获取文件信息。
         * @param fileHash - 文件的哈希值。
         * @returns 包含文件大小的API响应。
         */
        getFileInfo(fileHash: string): Promise<APIResponse<{ size: bigint }>>;
        /**
         * 上传文件。
         * @param file - 要上传的文件对象（浏览器中的File对象或Node.js中的文件路径）。
         * @param groupid - 群组ID。
         * @param callback - 上传进度回调函数。
         * @returns API响应。
         */
        uploadFile(file: File | string, groupid: number, callback: (progress: { stage: string; finished: number; total: number; stage_num: number; stage_total: number; progress: number }) => void): Promise<APIResponse<{ hash: string }>>;
        /**
         * 下载文件。
         * @param fileHash - 文件的哈希值。
         * @param callback - 下载进度回调函数。
         * @param fileObj - 在浏览器中为FileSystemFileHandle，在Node.js中为文件路径字符串。
         * @returns API响应。
         */
        downloadFile(fileHash: string, callback: (progress: { stage: string; finished: number; total: number; stage_num: number; stage_total: number; progress: number }) => void, fileObj?: FileSystemFileHandle | string): Promise<APIResponse>;
    };

    /**
     * 启动后台同步。
     */
    export function startBackgroundSync(): void;

    /**
     * StealthIM SDK的默认导出对象。
     */
    const stim: {
        init: typeof init;
        user: typeof user;
        group: typeof group;
        message: typeof message;
        file: typeof file;
        startBackgroundSync: typeof startBackgroundSync;
    };

    export default stim;
}
