import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const USER_AGENT = "GVY-Wikelo/0.1 (+https://wikelo.gvyvoyagers.vip)";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchText(url, options = {}) {
  const cacheDir = options.cacheDir;
  const cacheKey = createHash("sha256").update(url).digest("hex");
  const cacheFile = cacheDir ? path.join(cacheDir, `${cacheKey}.txt`) : null;
  const missFile = cacheDir ? path.join(cacheDir, `${cacheKey}.miss`) : null;
  let lastError;

  if (cacheFile && options.preferCache) {
    try {
      const info = await stat(cacheFile);
      if (Date.now() - info.mtimeMs < (options.cacheMaxAgeMs ?? 24 * 60 * 60 * 1000)) {
        return { text: await readFile(cacheFile, "utf8"), fromCache: true, url };
      }
    } catch {
      // No fresh positive cache.
    }
    try {
      const info = await stat(missFile);
      if (Date.now() - info.mtimeMs < (options.cacheMaxAgeMs ?? 24 * 60 * 60 * 1000)) {
        throw new Error(`Cached not-found response for ${url}`);
      }
    } catch (error) {
      if (String(error).includes("Cached not-found")) throw error;
    }
  }

  for (let attempt = 0; attempt < (options.retries ?? 3); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: options.accept ?? "*/*" },
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.nonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
        if (error.nonRetryable && missFile) {
          await mkdir(cacheDir, { recursive: true });
          await writeFile(missFile, String(response.status), "utf8");
        }
        throw error;
      }
      const text = await response.text();
      if (cacheFile) {
        await mkdir(cacheDir, { recursive: true });
        await writeFile(cacheFile, text, "utf8");
      }
      return { text, fromCache: false, url };
    } catch (error) {
      lastError = error;
      if (error?.nonRetryable) break;
      if (attempt + 1 < (options.retries ?? 3)) await wait(700 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }

  if (cacheFile && options.allowStaleCache !== false) {
    try {
      return { text: await readFile(cacheFile, "utf8"), fromCache: true, url, error: String(lastError) };
    } catch {
      // No usable cache.
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError}`);
}

export async function fetchJson(url, options = {}) {
  const result = await fetchText(url, { ...options, accept: "application/json" });
  return { ...result, data: JSON.parse(result.text) };
}

export async function downloadBinary(url, destination, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < (options.retries ?? 3); attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "image/*" },
      });
      if (!response.ok) {
        const error = new Error(`${response.status} ${response.statusText}`);
        error.nonRetryable = response.status >= 400 && response.status < 500 && response.status !== 429;
        throw error;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 256) throw new Error("image response was unexpectedly small");
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
      return { sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length };
    } catch (error) {
      lastError = error;
      if (error?.nonRetryable) break;
      if (attempt + 1 < (options.retries ?? 3)) await wait(700 * (attempt + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`Failed to download ${url}: ${lastError}`);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
