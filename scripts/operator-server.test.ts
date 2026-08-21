import assert from "node:assert/strict";
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

const port = 3101;
const radarUrl = `http://127.0.0.1:${port}/admin/radar`;
const reviewUrl = `http://127.0.0.1:${port}/review`;
const logPath = join(homedir(), "Desktop/ssnn-outputs/operator-server.log");
const operatorScriptPath = "scripts/operator-server.sh";

const stopProcessGroup = async (process: ChildProcess) => {
  if (process.pid === undefined || process.exitCode !== null || process.signalCode !== null) {
    return;
  }

  const exit = once(process, "exit");

  try {
    globalThis.process.kill(-process.pid, "SIGTERM");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      throw error;
    }
  }

  const exited = await Promise.race([exit.then(() => true), delay(5_000, false)]);
  if (exited) {
    return;
  }

  try {
    globalThis.process.kill(-process.pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return;
    }

    throw error;
  }

  await Promise.race([exit, delay(5_000)]);
};

const waitForStatus = async (url: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | null = null;
  let lastError: string | null = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
      });
      lastStatus = response.status;

      if (response.status === 200) {
        return { lastError: null, status: response.status };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return { lastError, status: lastStatus };
};

const fileSize = async (path: string) => {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return 0;
    }

    throw error;
  }
};

test(
  "operator server serves every operator surface through webpack",
  { timeout: 120_000 },
  async (context) => {
    const operatorScript = await readFile(operatorScriptPath, "utf8");
    assert.match(operatorScript, /REPO="\$\{HOME\}\/Projects\/sandbox-daily"/);

    const logOffset = await fileSize(logPath);
    const server = spawn("bash", ["scripts/operator-server.sh"], {
      detached: true,
      env: {
        ...process.env,
        SD_OPERATOR_PORT: String(port),
      },
      stdio: "ignore",
    });

    context.after(() => stopProcessGroup(server));

    const review = await waitForStatus(reviewUrl, 45_000);
    const radar = await waitForStatus(radarUrl, 45_000);
    const newLog = (await readFile(logPath)).subarray(logOffset).toString("utf8");

    assert.equal(review.status, 200, review.lastError ?? "Review did not return HTTP 200");
    assert.equal(radar.status, 200, radar.lastError ?? "Radar did not return HTTP 200");
    assert.match(newLog, /Next\.js .+ \(webpack\)/);
  },
);
