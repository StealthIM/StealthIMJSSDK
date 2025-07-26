import axios from 'axios';

const instance = axios.create();

// 添加响应拦截器
instance.interceptors.response.use(
    response => {
        // 对响应数据做点什么
        return response;
    },
    error => {
        // 对响应错误做点什么
        if (error.response && error.response.status === 400) {
            // 当状态码为 400 时，返回 response，不抛出错误
            return error.response;
        }
        // 其他错误继续抛出
        return Promise.reject(error);
    }
);

export default instance;
