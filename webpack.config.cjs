const path = require('path');

module.exports = {
    mode: 'development', // 或者 'production'
    entry: './src/index.mjs',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        library: 'StealthIMJSSDK',
        libraryTarget: 'umd',
        globalObject: 'this'
    },
    module: {
        rules: [
            {
                test: /\.m?js$/, // 匹配 .mjs 和 .js 文件
                exclude: /(node_modules)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                    },
                },
            },
        ],
    },
    resolve: {
        extensions: ['.mjs', '.js', '.json'],
        fallback: {
            "https": false,
            "http": false,
            "fs": false, // 通常前端不需要fs
            "path": require.resolve("path-browserify"),
            "crypto": require.resolve("crypto-browserify"),
            "util": require.resolve("util/"),
            "os": require.resolve("os-browserify/browser"),
            "vm": require.resolve("vm-browserify"),
            "stream": require.resolve("stream-browserify"),
            // "blake3": require.resolve("blake3/browser")
        }
    },
    devtool: 'source-map',
};
