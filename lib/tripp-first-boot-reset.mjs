import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const firstBootResetBrowserKeys = [
  "tripp.firstBootComplete",
  "tripp.connections.firstBootDismissed",
  "tripp.defaultPromptConnectionId",
];

export function firstBootRuntimePaths({ root = process.cwd(), runtimeDir } = {}) {
  const resolvedRoot = resolve(root);
  const resolvedRuntimeDir = resolve(runtimeDir || join(resolvedRoot, ".tripp-runtime"));
  return {
    root: resolvedRoot,
    runtimeDir: resolvedRuntimeDir,
    connectionsFile: join(resolvedRuntimeDir, "connections.json"),
    connectionSecretsFile: join(resolvedRuntimeDir, "connection-secrets.json"),
    taskStoreFile: join(resolvedRuntimeDir, "tasks.json"),
    sessionStoreFile: join(resolvedRuntimeDir, "sessions.json"),
    cystStoreFile: join(resolvedRuntimeDir, "cyst-events.json"),
    resetMetadataFile: join(resolvedRuntimeDir, "first-boot-reset.json"),
  };
}

export function readFirstBootResetMetadata(options = {}) {
  const { resetMetadataFile } = firstBootRuntimePaths(options);
  try {
    if (!existsSync(resetMetadataFile)) {
      return {
        resetVersion: null,
        browserStorageKeys: firstBootResetBrowserKeys,
      };
    }
    const metadata = JSON.parse(readFileSync(resetMetadataFile, "utf8"));
    return {
      resetVersion: metadata.resetVersion || null,
      resetAt: metadata.resetAt || null,
      clearedStores: Array.isArray(metadata.clearedStores) ? metadata.clearedStores : [],
      rewrittenFiles: Array.isArray(metadata.rewrittenFiles) ? metadata.rewrittenFiles : [],
      removedFiles: Array.isArray(metadata.removedFiles) ? metadata.removedFiles : [],
      browserStorageKeys: firstBootResetBrowserKeys,
      restartRequired: Boolean(metadata.restartRequired),
      expectedNextStep: metadata.expectedNextStep || "Reopen Tripp and expect the Connections first-boot setup state.",
    };
  } catch {
    return {
      resetVersion: null,
      browserStorageKeys: firstBootResetBrowserKeys,
    };
  }
}

export function resetFirstBootState(options = {}) {
  const paths = firstBootRuntimePaths(options);
  mkdirSync(paths.runtimeDir, { recursive: true });
  const removedFiles = [];
  for (const file of [
    paths.connectionsFile,
    paths.connectionSecretsFile,
    paths.taskStoreFile,
    paths.sessionStoreFile,
    paths.cystStoreFile,
  ]) {
    if (existsSync(file)) {
      rmSync(file, { force: true });
      removedFiles.push(file);
    }
  }

  const resetAt = new Date().toISOString();
  const resetVersion = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const metadata = {
    artifactType: "tripp_first_boot_reset",
    resetVersion,
    resetAt,
    runtimeDir: paths.runtimeDir,
    clearedStores: [
      "connections",
      "connectionSecrets",
      "defaultPromptTestingConnection",
      "connectionFirstBootBrowserFlags",
      "firstBootSessions",
      "firstBootTasks",
      "firstBootCystEvents",
    ],
    removedFiles,
    rewrittenFiles: [paths.resetMetadataFile],
    browserStorageKeys: firstBootResetBrowserKeys,
    restartRequired: false,
    expectedNextStep: "Reload or reopen Tripp and expect the Connections first-boot setup state.",
    scopeNote: "Local/dev reset only. This does not change Tripp's current read-only scope.",
  };
  writeFileSync(paths.resetMetadataFile, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return metadata;
}
