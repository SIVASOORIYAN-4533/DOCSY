import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import dotenv from "dotenv";

const parsePort = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const canUsePort = (port) =>
  new Promise((resolve, reject) => {
    const tester = net.createServer();

    tester.once("error", (error) => {
      if (error.code === "EADDRINUSE") {
        resolve(false);
        return;
      }

      reject(error);
    });

    tester.once("listening", () => {
      tester.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }

        resolve(true);
      });
    });

    tester.listen(port, "0.0.0.0");
  });

const findAvailablePort = async (preferredPort, searchLimit, reservedPorts = new Set()) => {
  for (let offset = 0; offset <= searchLimit; offset += 1) {
    const candidatePort = preferredPort + offset;
    if (reservedPorts.has(candidatePort)) {
      continue;
    }

    if (await canUsePort(candidatePort)) {
      return candidatePort;
    }
  }

  throw new Error(
    `Unable to find an available port between ${preferredPort} and ${preferredPort + searchLimit}.`,
  );
};

const startProcess = (scriptName, envVars, label) => {
  const childProcess = spawn(`npm run ${scriptName}`, {
    stdio: ["ignore", "pipe", "pipe"],
    env: envVars,
    shell: true,
  });

  childProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[${label}] ${chunk}`);
  });

  childProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[${label}] ${chunk}`);
  });

  return childProcess;
};

const main = async () => {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
  dotenv.config();

  const portSearchLimit = 20;
  const preferredBackendPort = parsePort(process.env.PORT, 5001);
  const preferredFrontendPort = parsePort(process.env.VITE_PORT, 5173);

  const backendPort = await findAvailablePort(preferredBackendPort, portSearchLimit);
  const frontendPort = await findAvailablePort(
    preferredFrontendPort,
    portSearchLimit,
    new Set([backendPort]),
  );

  if (backendPort !== preferredBackendPort) {
    console.warn(`Port ${preferredBackendPort} is in use. Backend will run on ${backendPort}.`);
  }

  if (frontendPort !== preferredFrontendPort) {
    console.warn(`Port ${preferredFrontendPort} is in use. Frontend will run on ${frontendPort}.`);
  }

  const backendUrl = `http://localhost:${backendPort}`;
  const frontendUrl = `http://localhost:${frontendPort}`;
  console.log(`Backend URL: ${backendUrl}`);
  console.log(`Frontend URL: ${frontendUrl}`);

  const sharedEnv = {
    ...process.env,
    PORT: String(backendPort),
    PORT_SEARCH_LIMIT: "0",
    VITE_PORT: String(frontendPort),
    VITE_API_TARGET: backendUrl,
    OAUTH_BASE_URL: backendUrl,
    FRONTEND_BASE_URL: frontendUrl,
  };

  const backendProcess = startProcess("dev:backend", sharedEnv, "backend");
  const frontendProcess = startProcess("dev:frontend", sharedEnv, "frontend");
  const childProcesses = [backendProcess, frontendProcess];

  let isStopping = false;
  const stopAll = (code = 0) => {
    if (isStopping) {
      return;
    }

    isStopping = true;
    for (const childProcess of childProcesses) {
      if (!childProcess.killed) {
        childProcess.kill("SIGTERM");
      }
    }

    setTimeout(() => {
      process.exit(code);
    }, 50).unref();
  };

  backendProcess.on("exit", (code) => {
    if (isStopping) {
      return;
    }
    console.error(`Backend process exited with code ${code ?? 0}. Stopping frontend process.`);
    stopAll(code ?? 0);
  });

  frontendProcess.on("exit", (code) => {
    if (isStopping) {
      return;
    }
    console.error(`Frontend process exited with code ${code ?? 0}. Stopping backend process.`);
    stopAll(code ?? 0);
  });

  process.on("SIGINT", () => stopAll(0));
  process.on("SIGTERM", () => stopAll(0));
};

main().catch((error) => {
  console.error("Failed to start development servers.", error);
  process.exit(1);
});
