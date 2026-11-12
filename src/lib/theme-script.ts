export const THEME_STORAGE_KEY = "theme";

export const themeBootScript = `(function(){try{if(localStorage.getItem("${THEME_STORAGE_KEY}")==="dark")document.documentElement.setAttribute("data-theme","dark");}catch(e){}})();`;
