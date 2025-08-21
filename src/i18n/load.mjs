// 导入中文翻译文件
import * as zh from "./translate/zh-cn.js";
// 导入英文翻译文件
import * as en from "./translate/en-us.js";

// 翻译文件映射对象
const translates = {
    "zh-cn": zh,
    "en-us": en
}

// 国际化对象
export var i18n = {
    "t": {}
};

// 加载国际化文件
export async function loadi18n(lang = "en-us") {
    console.log("[StealthIM]Loading i18n: " + lang);
    i18n.t = translates[lang];
}
export default i18n;
