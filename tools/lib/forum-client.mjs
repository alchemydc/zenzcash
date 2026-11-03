import { FORUM_ORIGIN, USER_AGENT } from "./config.mjs";
export function forumClient({ request = fetch, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), clock = Date.now } = {}) {
  let last = -Infinity;
  return async (path, {observe=()=>{}} = {}) => {
    const url = new URL(path, FORUM_ORIGIN);
    if (url.origin !== FORUM_ORIGIN) throw new Error(`refusing forum request outside ${FORUM_ORIGIN}`);
    for (let attempt = 0; attempt < 6; attempt++) {
      const throttle=Math.max(0,1000-(clock()-last));
      const waited=performance.now();await wait(throttle);
      observe({category:'forum.throttle',elapsed_ms:performance.now()-waited,status:'complete'});
      last = clock();
      const started=performance.now();let response;
      try {
        response = await request(url.href, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: AbortSignal.timeout(30000), redirect: "error" });
        observe({category:'forum.http',path,attempt:attempt+1,http_status:response.status,elapsed_ms:performance.now()-started,status:response.ok?'complete':'failed'});
      } catch(error) {observe({category:'forum.http',path,attempt:attempt+1,http_status:null,elapsed_ms:performance.now()-started,status:'failed',error:error.message});throw error;}
      if (response.status === 429) {
        const header = response.headers.get("retry-after");
        const delay = header === null ? 30000 : /^\d+$/.test(header) ? Number(header) * 1000 : Date.parse(header) - clock();
        if (!Number.isFinite(delay) || delay > 60000) throw new Error(`forum rate limited; retry later (Retry-After: ${header})`);
        const backedOff=performance.now();await wait(Math.max(1000, delay));
        observe({category:'forum.backoff',elapsed_ms:performance.now()-backedOff,status:'complete'});continue;
      }
      if ([403,404,410].includes(response.status)) return { unavailable: response.status };
      if (!response.ok) throw new Error(`GET ${url.href}: HTTP ${response.status}`);
      return { body: await response.json() };
    }
    throw new Error(`GET ${url.href}: still rate limited after 6 attempts`);
  };
}
export async function accountProfile(get, username) {
  const result = await get(`/u/${encodeURIComponent(username)}.json`);
  if (result.unavailable) return { created_at: null, status: "no public profile" };
  if (result.body?.user?.profile_hidden === true) return { created_at: null, status: "profile hidden" };
  const date = result.body?.user?.created_at;
  if (typeof date !== "string" || !Number.isFinite(Date.parse(date))) throw new Error(`@${username}: missing or invalid account creation time`);
  return { created_at: date, status: "ok" };
}
