// A JSON-RPC endpoint that answers HTTP 429 to everything (B-19-lite failover probe). Put it FIRST in
// SERVER_RPC_URLS; the server's failover client must move on to FastNEAR/dRPC without a user-visible error.
//   node scripts/rpc-429-stub.mjs <port> <hits-file>
import { createServer } from "node:http"
import { writeFileSync } from "node:fs"
const [port = "3499", file = "/tmp/rpc-429-hits"] = process.argv.slice(2)
let hits = 0
writeFileSync(file, "0")
createServer((req, res) => {
  req.resume()
  req.on("end", () => {
    writeFileSync(file, String(++hits))
    res.writeHead(429, { "content-type": "application/json", "retry-after": "1" })
    res.end('{"error":"rate limited"}')
  })
}).listen(Number(port), "127.0.0.1", () => console.log(`rpc-429 stub on :${port}`))
