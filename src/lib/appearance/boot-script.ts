import { APPEARANCE_STORAGE_KEY, THEME_COLORS } from "./appearance";

/**
 * The first-paint script (spec §7.3, R6), inlined in the root layout's <head>
 * so it runs before the body paints. It reads this device's mirror of the last
 * applied appearance and, for an explicit Light or Dark, sets the <html> class
 * and browser chrome color. Anything else (System, nothing stored, storage
 * blocked) does nothing, leaving the device's preference in charge.
 *
 * It contains no account data, makes no request, and keeps the root layout
 * static. The account's stored value is re-applied after hydration by
 * AppearanceSync, which corrects a device last used by another account.
 */
export const APPEARANCE_BOOT_SCRIPT = `(function(){try{var a=window.localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)});if(a!=="light"&&a!=="dark")return;document.documentElement.classList.add(a);var c=a==="dark"?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(
  THEME_COLORS.light,
)};var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c);}catch(e){}})();`;
