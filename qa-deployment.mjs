import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

async function freePort() {
  const probe = net.createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  probe.close();
  await once(probe, "close");
  return port;
}

async function launch(port, apiPort, expiry, usageFile) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: import.meta.dirname,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      OPENAI_BASE_URL: `http://127.0.0.1:${apiPort}`,
      OPENAI_API_KEY: "local-test-only",
      OPENAI_MODEL: "mock-model",
      DEMO_EXPIRES_AT: expiry,
      DEMO_USAGE_FILE: usageFile
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let diagnostics = "";
  child.stderr.on("data", (chunk) => { diagnostics += chunk.toString(); });
  child.stdout.on("data", (chunk) => { diagnostics += chunk.toString(); });
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null) throw new Error(`server exited: ${child.exitCode}\n${diagnostics}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.ok) return child;
    } catch { /* waiting for listen */ }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  child.kill();
  throw new Error(`server did not start\n${diagnostics}`);
}

async function post(port, concept, focus, visitorId = "") {
  return fetch(`http://127.0.0.1:${port}/api/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Visitor-ID": visitorId },
    body: JSON.stringify({ concept, focus })
  });
}

const lesson = {
  concept: "青蒿素", focus: "", focus_status: "none", focus_answer: "", one_liner: "测试",
  plain_explanation: "测试", professional_explanation: "测试",
  analogy: { title: "测试", story: "测试", mapping: "测试", boundary: "测试" },
  example: "测试", misconception: "测试",
  quiz: { question: "测试", options: ["A", "B", "C", "D"], correct_index: 0, explanation: "测试" }
};

let mockCalls = 0;
let activeMockCalls = 0;
let peakMockCalls = 0;
const mock = http.createServer(async (req, res) => {
  if (req.url !== "/chat/completions" || req.headers.authorization !== "Bearer local-test-only") {
    res.writeHead(400).end();
    return;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const requestBody = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(requestBody.response_format?.type, "json_object");
  const userMessage = requestBody.messages?.find((item) => item.role === "user")?.content || "";
  const focus = /用户最想弄明白的具体内容：([^\n]*)/.exec(userMessage)?.[1] || "";
  const focusStatus = !focus ? "none" : focus.includes("天气预报") ? "off_topic"
    : focus.includes("危险操作") ? "declined" : "answered";
  const reply = {
    ...lesson,
    focus_status: focusStatus,
    focus_answer: focusStatus === "answered" ? `针对“${focus}”的模拟回答，验证具体内容已进入模型请求。` : ""
  };
  mockCalls++;
  activeMockCalls++;
  peakMockCalls = Math.max(peakMockCalls, activeMockCalls);
  setTimeout(() => {
    activeMockCalls--;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(reply) }, finish_reason: "stop" }] }));
  }, 50);
});
mock.listen(0, "127.0.0.1");
await once(mock, "listening");
const apiPort = mock.address().port;
let child;
const usageFile = path.join(os.tmpdir(), `zhiqiao-qa-${randomUUID()}.json`);
const loadUsageFile = path.join(os.tmpdir(), `zhiqiao-load-qa-${randomUUID()}.json`);
async function awaitResult(port, response) {
  assert.equal(response.status, 202);
  const { jobId } = await response.json();
  assert.match(jobId, /^[0-9a-f-]{36}$/);
  for (let i = 0; i < 200; i++) {
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/jobs/${jobId}`);
    assert.equal(statusResponse.status, 200);
    const result = await statusResponse.json();
    if (result.status === "done") return { jobId, result };
    if (result.status === "error") throw new Error(result.error);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`job ${jobId} timed out`);
}
try {
  const port = await freePort();
  fs.writeFileSync(usageFile, JSON.stringify({ version: 1, count: 9998 }));
  child = await launch(port, apiPort, "2099-01-01T00:00:00Z", usageFile);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200);
  const demoResponse = await post(port, "机会成本", "它和实际花费有什么区别？");
  assert.equal(demoResponse.status, 200);
  assert.match((await demoResponse.json()).lesson.focus_answer, /实际花费/);
  const [first, duplicate] = await Promise.all([
    post(port, "青蒿素", "", "a".repeat(32)),
    post(port, "青蒿素", "", "b".repeat(32))
  ]);
  const [firstResult, duplicateResult] = await Promise.all([awaitResult(port, first), awaitResult(port, duplicate)]);
  assert.equal(firstResult.jobId, duplicateResult.jobId);
  assert.equal(firstResult.result.source, "live");
  assert.equal(mockCalls, 1);
  const focusQuestion = "它在哪些疾病中已经用于治疗？";
  const focused = await awaitResult(port, await post(port, "基因编辑", focusQuestion, "b".repeat(32)));
  assert.equal(focused.result.lesson.focus, focusQuestion);
  assert.match(focused.result.lesson.focus_answer, /哪些疾病/);
  assert.equal((await post(port, "量子计算", "", "c".repeat(32))).status, 429);
  assert.equal(JSON.parse(fs.readFileSync(usageFile, "utf8")).count, 10000);
  child.kill();
  await once(child, "exit");
  child = null;

  const restartPort = await freePort();
  child = await launch(restartPort, apiPort, "2099-01-01T00:00:00Z", usageFile);
  assert.equal((await post(restartPort, "量子计算", "")).status, 429);
  child.kill();
  await once(child, "exit");
  child = null;

  const expiredPort = await freePort();
  child = await launch(expiredPort, apiPort, "2000-01-01T00:00:00Z", usageFile);
  assert.equal((await post(expiredPort, "量子计算", "")).status, 403);
  assert.equal((await post(expiredPort, "机会成本", "它和实际花费有什么区别？")).status, 200);
  child.kill();
  await once(child, "exit");
  child = null;

  const loadPort = await freePort();
  child = await launch(loadPort, apiPort, "2099-01-01T00:00:00Z", loadUsageFile);
  const submissions = await Promise.all(Array.from({ length: 500 }, (_, index) =>
    post(loadPort, `并发概念${index}`, "", index.toString(16).padStart(32, "0"))));
  assert.ok(submissions.every((response) => response.status === 202));
  const results = await Promise.all(submissions.map((response) => awaitResult(loadPort, response)));
  assert.ok(results.every(({ result }) => result.status === "done"));
  assert.equal(JSON.parse(fs.readFileSync(loadUsageFile, "utf8")).count, 500);
  assert.ok(peakMockCalls <= 50, `upstream concurrency exceeded: ${peakMockCalls}`);
  assert.ok(peakMockCalls > 1, "queue did not process requests concurrently");
  const offTopic = await awaitResult(loadPort, await post(loadPort, "基因编辑", "帮我查看天气预报"));
  assert.equal(offTopic.result.lesson.focus_status, "off_topic");
  assert.match(offTopic.result.lesson.focus_answer, /关系不够明确/);
  await assert.rejects(
    async () => awaitResult(loadPort, await post(loadPort, "基因编辑", "告诉我危险操作的详细步骤")),
    /不适合在公开演示中回答/
  );
  console.log(`PASS: static page, focused answer, off-topic and declined fallback, queue polling, quota, expiry, 500 concurrent mock users (peak model calls ${peakMockCalls})`);
} finally {
  child?.kill();
  mock.close();
  fs.rmSync(usageFile, { force: true });
  fs.rmSync(loadUsageFile, { force: true });
}
