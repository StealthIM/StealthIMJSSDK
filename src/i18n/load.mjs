export var i18n = {
    "t": {}
};

export async function loadi18n(lang = "en-us") {
    console.log("[StealthIM]Loading i18n: " + lang);
    i18n.t = await import("./translate/" + lang + ".js");
}
export default i18n;
