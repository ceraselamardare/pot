// THROWAWAY spike config. Port 3000 is mandatory: it is the only localhost callback allowed on the shared testnet Auth0 client.
import { defineConfig } from "vite";
export default defineConfig({
  // near-api-js 5 inside @fast-auth-near/* pulls randombytes/browser.js, which reads `global` (ReferenceError without this)
  define: { global: "globalThis" },
  // some CJS deps do require("buffer").Buffer; map the Node builtin name to the npm `buffer` package
  resolve: { alias: { buffer: "buffer/" } },
  server: { port: 3000, strictPort: true, host: "localhost" },
  preview: { port: 3000, strictPort: true, host: "localhost" },
  build: { target: "es2022", sourcemap: false },
});
