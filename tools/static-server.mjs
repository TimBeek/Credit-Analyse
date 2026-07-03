import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const port = Number(process.env.PORT || 8091);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
};

function sendText(response, status, body) {
  response.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(body);
}

http.createServer((request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    let requestedPath = decodeURIComponent(url.pathname);
    if (requestedPath === "/") requestedPath = "/index.html";

    const filePath = path.normalize(path.join(root, requestedPath));
    const relativePath = path.relative(root, filePath);
    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
      sendText(response, 403, "Forbidden");
      return;
    }

    fs.stat(filePath, (error, stat) => {
      if (error || !stat.isFile()) {
        sendText(response, 404, "Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(filePath).pipe(response);
    });
  } catch {
    sendText(response, 500, "Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`ReMarkt Credit Analyse live op http://localhost:${port}/`);
});
