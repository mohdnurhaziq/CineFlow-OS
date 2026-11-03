// Preloaded with `--import` so the resolve hook is active before the runner loads.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
