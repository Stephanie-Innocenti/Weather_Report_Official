import { copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = new URL("../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url);
const destination = new URL("../public/maplibre-gl-worker.mjs", import.meta.url);

copyFileSync(fileURLToPath(source), fileURLToPath(destination));
