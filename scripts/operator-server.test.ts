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

type ProcessGroupStatus = "alive" | "gone" | "indeterminate";

const getProcessGroupStatus = (processGroupId: number): ProcessGroupStatus => {
  try {
    globalThis.process.kill(-processGroupId, 0);
    return "alive";
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return "gone";
    }

    if ((error as NodeJS.ErrnoException).code === "EPERM") {
      return "indeterminate";
    }

    throw error;
  }
};

const signalProcessGroup = (processGroupId: number, signal: NodeJS.Signals) => {
  try {
    globalThis.process.kill(-processGroupId, signal);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ESRCH") {
      return false;
    }

    throw error;
  }
};

const waitForProcessGroupExit = async (processGroupId: number, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (getProcessGroupStatus(processGroupId) === "gone") {
      return true;
    }

    await delay(25);
  }

  return getProcessGroupStatus(processGroupId) === "gone";
};

const forceStopProcessGroup = async (processGroupId: number) => {
  signalProcessGroup(processGroupId, "SIGKILL");

  assert.equal(
    await waitForProcessGroupExit(processGroupId, 5_000),
    true,
    `Emergency cleanup could not stop process group ${processGroupId}`,
  );
};

const stopProcessGroup = async (process: ChildProcess) => {
  if (process.pid === undefined) {
    return;
  }

  const processGroupId = process.pid;

  if (getProcessGroupStatus(processGroupId) === "gone") {
    return;
  }

  signalProcessGroup(processGroupId, "SIGTERM");
  if (await waitForProcessGroupExit(processGroupId, 5_000)) {
    return;
  }

  signalProcessGroup(processGroupId, "SIGKILL");
  if (await waitForProcessGroupExit(processGroupId, 5_000)) {
    return;
  }

  throw new Error(`Could not stop process group ${processGroupId} after SIGTERM and SIGKILL`);
};

test(
  "operator cleanup removes a detached group after its leader exits",
  { timeout: 20_000 },
  async (context) => {
    const server = spawn("bash", ["-c", "sleep 30 & exit 0"], {
      detached: true,
      stdio: "ignore",
    });
    const processGroupId = server.pid;

    if (processGroupId === undefined) {
      throw new Error("Detached process did not receive a PID");
    }

    context.after(async () => forceStopProcessGroup(processGroupId));

    await once(server, "exit");

    assert.equal(
      getProcessGroupStatus(processGroupId),
      "alive",
      "Expected the descendant to remain alive",
    );

    await stopProcessGroup(server);

    assert.equal(
      await waitForProcessGroupExit(processGroupId, 250),
      true,
      `Cleanup left detached process group ${processGroupId} alive after its leader exited`,
    );
  },
);

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
