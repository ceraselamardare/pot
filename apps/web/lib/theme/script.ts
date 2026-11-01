// The no-flash theme script (brand README §7, frontend-architecture §7.1). It runs inline in <head>,
// parser-blocking, before the body paints: reads localStorage 'pot-theme' (day | night), else follows
// prefers-color-scheme, and sets <html data-theme> + color-scheme. It is static, so Cache Components keeps
// the shell prerendered. If a CSP ever gains script-src, allow it by its sha256 hash (F-25).
export const THEME_STORAGE_KEY = "pot-theme"

export const THEME_SCRIPT = `(function(){var d=document.documentElement,t=null;try{t=localStorage.getItem('${THEME_STORAGE_KEY}')}catch(e){}if(t!=='day'&&t!=='night')t=matchMedia('(prefers-color-scheme: dark)').matches?'night':'day';d.dataset.theme=t;d.style.colorScheme=t==='night'?'dark':'light'})()`
