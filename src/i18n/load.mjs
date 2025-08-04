import * as zh from "./translate/zh-cn.js";
import * as en from "./translate/en-us.js";

const translates = {
    "zh-cn": zh,
    "en-us": en
}

export var i18n = {
    "t": {}
};

export async function loadi18n(lang = "en-us") {
    console.log("[StealthIM]Loading i18n: " + lang);
    i18n.t = translates[lang];
}
export default i18n;
