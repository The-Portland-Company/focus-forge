import {
  THEME_PRESETS,
  DEFAULT_THEME_PRESET,
  DEFAULT_GRADIENT_THEME,
} from "./theme-constants";

/**
 * Storage key must stay in sync with THEME_PREFERENCE_STORAGE_KEY in
 * ./theme-utils. It is duplicated here because this module is serialized into
 * an inline <script>, which cannot import at run time.
 */
const STORAGE_KEY = "focus-forge-theme-preference";

/** Every class any preset can put on <html>, so the script can clear them. */
const ALL_PRESET_CLASSES = Array.from(
  new Set(
    Object.values(THEME_PRESETS)
      .flatMap((preset) => (preset?.cssClass || "").split(" "))
      .filter(Boolean),
  ),
);

/** preset id -> { cssClass, defaultColor }, mirroring applyTheme's inputs. */
const PRESET_TABLE = Object.fromEntries(
  Object.entries(THEME_PRESETS).map(([id, preset]) => [
    id,
    {
      cssClass: preset?.cssClass || "",
      color: preset?.defaultColor || DEFAULT_GRADIENT_THEME,
    },
  ]),
);

/**
 * Blocking script that resolves and applies the stored theme before the first
 * paint, mirroring applyTheme/applyUserTheme in ./theme-utils. Keep the two in
 * step: this only needs the class list and the gradient variables, which are
 * what visibly flash — the rest can settle after hydration.
 *
 * The stored key is per-user (`<key>:<userId>`) once a profile is known, and
 * unscoped before that. The user id is not available pre-hydration, so fall
 * back to the first scoped key found.
 */
export const THEME_PREPAINT_SCRIPT = `(function(){try{
var P=${JSON.stringify(PRESET_TABLE)};
var ALL=${JSON.stringify(ALL_PRESET_CLASSES)};
var K=${JSON.stringify(STORAGE_KEY)};
var v=null;
try{
v=localStorage.getItem(K);
if(!v){for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);
if(k&&k.indexOf(K+":")===0){v=localStorage.getItem(k);break;}}}
}catch(e){}
var id=(v&&P[v])?v:${JSON.stringify(DEFAULT_THEME_PRESET)};
if(id==="system"){id=window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";}
var t=P[id];if(!t)return;
var r=document.documentElement;
ALL.forEach(function(c){r.classList.remove(c);});
t.cssClass.split(" ").filter(Boolean).forEach(function(c){r.classList.add(c);});
r.setAttribute("data-theme",v&&P[v]?v:id);
r.setAttribute("data-resolved-theme",id);
var c=t.color;if(!c)return;
var p=c.indexOf("linear-gradient")===0?(c.match(/#[A-Fa-f0-9]{6}/g)||[c])[0]:c;
r.style.setProperty("--theme-primary",p);
r.style.setProperty("--theme-gradient",c);
r.style.setProperty("--user-profile-color",p);
r.style.setProperty("--user-profile-gradient",c);
if(p.charAt(0)==="#"&&p.length===7){
var n=parseInt(p.slice(1),16);
var rgb=((n>>16)&255)+", "+((n>>8)&255)+", "+(n&255);
r.style.setProperty("--theme-primary-rgb",rgb);
r.style.setProperty("--user-profile-color-rgb",rgb);}
}catch(e){}})();`;
