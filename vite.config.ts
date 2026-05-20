import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = __dirname;

function normalizeModuleId(id: string): string {
  const clean = id.split("?")[0] ?? id;
  const normalized = clean.split(path.sep).join("/");
  const rootPrefix = `${root.split(path.sep).join("/")}/`;
  return normalized.startsWith(rootPrefix) ? normalized.slice(rootPrefix.length) : normalized;
}

function buildSizeManifest(): Plugin {
  let manifest = "";

  return {
    name: "gigahrush-build-size-manifest",
    apply: "build",
    enforce: "pre",
    generateBundle(_options, bundle) {
      const chunks = [];
      const assets = [];
      const modules = [];

      for (const output of Object.values(bundle)) {
        if (output.type === "chunk") {
          chunks.push({
            fileName: output.fileName,
            bytes: Buffer.byteLength(output.code, "utf8"),
            moduleCount: Object.keys(output.modules).length,
          });

          for (const [id, info] of Object.entries(output.modules)) {
            modules.push({
              id: normalizeModuleId(id),
              chunk: output.fileName,
              originalLength: info.originalLength,
              renderedLength: info.renderedLength,
            });
          }
        } else {
          const source = output.source;
          const bytes = typeof source === "string" ? Buffer.byteLength(source, "utf8") : source.length;
          assets.push({ fileName: output.fileName, bytes });
        }
      }

      manifest = JSON.stringify({ version: 1, chunks, assets, modules }, null, 2);
    },
    async writeBundle(options) {
      if (!manifest) return;
      const outDir = options.dir ? (path.isAbsolute(options.dir) ? options.dir : path.resolve(root, options.dir)) : path.resolve(root, "dist");
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "build-size-manifest.json"), manifest);
    },
  };
}

export default defineConfig({
  plugins: [buildSizeManifest(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
