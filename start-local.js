"use strict";

const { execFileSync, spawn } = require("node:child_process");
const path = require("node:path");

function windowsSystemProxy() {
  if (process.platform !== "win32") return null;
  const key = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
  try {
    const enabled = execFileSync("reg.exe", ["query", key, "/v", "ProxyEnable"], {
      encoding: "utf8", windowsHide: true, timeout: 2000
    });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enabled)) return null;
    const settings = execFileSync("reg.exe", ["query", key, "/v", "ProxyServer"], {
      encoding: "utf8", windowsHide: true, timeout: 2000
    });
    let address = /ProxyServer\s+REG_SZ\s+([^\r\n]+)/i.exec(settings)?.[1]?.trim();
    if (address?.includes("=")) {
      address = address.split(";").map((part) => part.trim())
        .find((part) => part.toLowerCase().startsWith("https="))?.slice(6);
    }
    if (!address) return null;
    const proxy = new URL(address.includes("://") ? address : `http://${address}`);
    if (!(["http:", "https:"].includes(proxy.protocol) && proxy.hostname && proxy.port)) return null;
    return proxy.origin;
  } catch {
    return null;
  }
}

const env = { ...process.env };
if (!env.HTTPS_PROXY && !env.https_proxy) {
  const proxy = windowsSystemProxy();
  if (proxy) {
    env.HTTPS_PROXY = proxy;
    console.log("Model connection: Windows system proxy");
  }
}

const child = spawn(process.execPath, ["--use-env-proxy", path.join(__dirname, "server.js"), ...process.argv.slice(2)], {
  cwd: __dirname,
  env,
  stdio: "inherit"
});
child.on("error", (error) => {
  console.error("Could not start server:", error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1;
});
