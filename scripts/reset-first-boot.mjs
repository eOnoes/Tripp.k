import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resetFirstBootState } from "../lib/tripp-first-boot-reset.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeDir = process.env.TRIPP_RUNTIME_DIR;
const result = resetFirstBootState({ root, runtimeDir });

console.log("Tripp first-boot reset complete.");
console.log(`Runtime: ${result.runtimeDir}`);
console.log(`Reset version: ${result.resetVersion}`);
console.log(`Cleared stores: ${result.clearedStores.join(", ")}`);
console.log(`Removed files: ${result.removedFiles.length ? result.removedFiles.join(", ") : "none present"}`);
console.log(`Metadata: ${result.rewrittenFiles.join(", ")}`);
console.log(`Browser storage keys invalidated: ${result.browserStorageKeys.join(", ")}`);
console.log(`Server restart required: ${result.restartRequired ? "yes" : "no"}`);
console.log(`Next step: ${result.expectedNextStep}`);
console.log(JSON.stringify(result, null, 2));
