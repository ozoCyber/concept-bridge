# Concept Bridge（知桥）

一个面向普通读者的概念理解小助手。输入概念，可选填最想弄明白的问题，获得直接回答、通俗解释、专业解释、生活类比、实例、常见误解和一道四选一小题。

项目使用原生 HTML、CSS、JavaScript 和 Node.js 24，无需安装第三方依赖。三组内置示例可以离线体验；自由输入由服务端调用模型，API Key 不会发送给浏览器。

## 功能

- 优先回答选填的具体问题；明显跑题时回到概念本身，不适合公开回答的操作性要求会返回提示。此判断依赖模型，不能代替完整的内容审核。
- 生成任务在服务端排队，浏览器自动查询状态；相同的通用概念可复用短期缓存。
- 响应式布局，适合电脑和手机浏览器。
- 内置三组示例，演示时无需等待模型。

## 本地运行

需要 Node.js 24 或更新版本。先在当前终端配置 `OPENAI_API_KEY`，再设置演示截止时间和本地用量文件。不要将密钥写入仓库。

PowerShell 示例：

```powershell
$env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User')
$env:OPENAI_BASE_URL = 'https://api.teamorouter.cn/v1'
$env:OPENAI_MODEL = 'deepseek-flash'
$env:DEMO_EXPIRES_AT = (Get-Date).AddDays(7).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$env:DEMO_USAGE_FILE = Join-Path $env:TEMP 'concept-bridge-usage.json'
$env:PORT = '3001'
npm start
```

打开 `http://127.0.0.1:3001/`。若没有配置密钥或有效截止时间，内置示例仍可使用。Windows 本地启动器会在需要时读取已启用的系统代理；Docker 容器直接启动服务。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 自由输入所需的模型接口密钥。 |
| `OPENAI_BASE_URL` | 默认 `https://api.teamorouter.cn/v1`。 |
| `OPENAI_MODEL` | 默认 `deepseek-flash`。 |
| `DEMO_EXPIRES_AT` | 必填；UTC ISO 8601 时间，达到该时刻后停止自由输入。 |
| `DEMO_USAGE_FILE` | 用量计数文件；Docker 默认 `/mnt/workspace/zhiqiao-demo-usage.json`，本地运行应改成可写路径。 |
| `DEMO_MODEL_CONCURRENCY` | 同时发出的模型请求数，默认 50，最多 100。 |
| `PORT`、`HOST` | 本地默认 `3000`、`127.0.0.1`；Dockerfile 使用 `7860`、`0.0.0.0`。 |

模型调用使用 Chat Completions 接口的 JSON 输出模式。公开部署前应配置持久化的 `DEMO_USAGE_FILE`、合理的截止时间和密钥。服务端当前设置为每位浏览器每 10 分钟最多提交 20 次、全站每 10 分钟最多 5000 次、演示期累计最多 10000 次模型任务；内置示例和成功复用的通用概念结果不占用模型额度。

## 检查

```powershell
npm run check
node qa-deployment.mjs
```

`qa-deployment.mjs` 使用本地模拟模型接口，不会调用付费模型。
