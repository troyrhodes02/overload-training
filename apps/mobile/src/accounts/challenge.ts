/**
 * The embedded Turnstile challenge (spec §10.3, RD-6). Pure helpers, so the
 * message parsing and the navigation allowlist are unit-tested.
 *
 * The page is inline HTML loaded with `baseUrl` set to the public web origin
 * app config names, so the widget runs on a hostname Cloudflare already
 * allows for the web. It loads only Cloudflare's script, and the token comes
 * back through `postMessage`. The token is single-use, held in memory, and
 * verified only by the server.
 */

export type ChallengeMessage =
  { type: "token"; token: string } | { type: "expired" } | { type: "error" };

const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit";

export function parseChallengeMessage(data: string): ChallengeMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const m = parsed as { type?: unknown; token?: unknown };
  if (m.type === "token") {
    return typeof m.token === "string" &&
      m.token.length > 0 &&
      m.token.length <= 4096
      ? { type: "token", token: m.token }
      : null;
  }
  if (m.type === "expired" || m.type === "error") return { type: m.type };
  return null;
}

/** Only the blank page, the page's own origin, and Cloudflare's challenge. */
export function isAllowedChallengeUrl(url: string, origin: string): boolean {
  if (url === "about:blank" || url.startsWith("about:srcdoc")) return true;
  if (url === origin || url.startsWith(`${origin}/`)) return true;
  return url.startsWith("https://challenges.cloudflare.com/");
}

/** The inline page. Values are JSON-encoded, never concatenated as code. */
export function challengeHtml(
  siteKey: string,
  theme: "light" | "dark",
): string {
  const config = JSON.stringify({ sitekey: siteKey, theme });
  return `<!doctype html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<style>html,body{margin:0;padding:0;background:transparent}#w{display:flex;justify-content:center}</style>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
var CONFIG=${config};
window.onTurnstileLoad=function(){
  turnstile.render('#w',{
    sitekey:CONFIG.sitekey,theme:CONFIG.theme,size:'flexible',appearance:'always',
    callback:function(t){post({type:'token',token:t});},
    'expired-callback':function(){post({type:'expired'});},
    'error-callback':function(){post({type:'error'});}
  });
};
</script>
<script src="${TURNSTILE_SCRIPT}" async defer onerror="post({type:'error'})"></script>
</head>
<body><div id="w"></div></body>
</html>`;
}
