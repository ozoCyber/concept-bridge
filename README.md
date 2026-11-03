# Concept Bridge · 知桥

**把陌生概念，讲到你会用。**

[在线体验（魔搭创空间）](https://modelscope.cn/studios/cyberchoi/zhiqiao)

知桥是一个面向跨专业阅读和自主学习的概念理解小助手。输入一个概念，还可以选填最想弄明白的具体问题；它会先回答问题，再用不同层次的解释、类比、实例和小题，帮助读者从“看过定义”走到“能够理解和使用”。

## 项目背景

跨领域学习时，陌生术语常常成为第一道门槛。搜索能很快找到定义，但定义里可能还有新术语，也未必能说明概念在实际场景中如何起作用。知桥围绕一个概念构建一条简短的理解路径，让没有相关专业背景的读者也能循序渐进地学习。

## 可以做什么

1. **提出问题**：填写必填的概念，可选填具体疑问。例如只输入“机会成本”，或进一步问“它与实际花费有什么不同？”
2. **分层理解**：获得直接回答、一句话概括、通俗解释、专业解释、生活类比及其适用边界、具体实例和容易理解错的地方。
3. **即时检验**：完成一道四选一理解小题，查看答案与解析。
4. **按需调整**：觉得太难、太浅，或想换个例子时，可以让系统重新组织讲解。

页面还提供三组内置示例，不配置模型接口也能体验基本流程；电脑和手机浏览器均可使用。

## 项目亮点

- **问题优先**：有具体疑问时先回应它，再展开概念讲解；明显无关的问题会回到概念本身。
- **类比有边界**：说明类比中哪些部分对应概念，以及类比在哪里不再适用。
- **即学即测**：小题检验核心理解，帮助发现“看懂了文字，却仍不会用”的情况。
- **适合现场体验**：内置示例可直接打开；自由输入采用服务端排队和状态查询，页面显示等待进度。

## 技术实现

项目使用原生 HTML、CSS、JavaScript 和 Node.js 24，无需安装第三方 npm 依赖。Node.js 服务负责静态页面、请求校验、任务队列、模型调用、短期缓存及演示用量限制；浏览器轮询任务状态并呈现结果。模型接口使用兼容 Chat Completions 的 JSON 输出模式。

```text
.
├── public/
│   ├── index.html       # 页面结构
│   ├── styles.css       # 响应式样式
│   └── app.js           # 交互、排队进度与结果展示
├── demo-lessons.js      # 三组内置示例
├── server.js            # HTTP 服务和模型任务队列
├── start-local.js       # Windows 本地启动器
├── qa-deployment.mjs    # 本地模拟接口检查
├── Dockerfile           # 容器部署配置
└── package.json
```

## 本地运行

需要 **Node.js 24 或更新版本**。在 PowerShell 中进入仓库根目录，设置环境变量后启动：

```powershell
$env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable('OPENAI_API_KEY', 'User')
$env:OPENAI_BASE_URL = ''
$env:OPENAI_MODEL = ''
$env:DEMO_EXPIRES_AT = ''
$env:DEMO_USAGE_FILE = Join-Path $env:TEMP 'concept-bridge-usage.json'
npm start
```

打开 <http://127.0.0.1:3000/>。如需改端口，可在启动前设置 `$env:PORT = '3001'`。没有有效 API Key 或截止时间时，仍可点击内置示例；自由输入需要完整配置。Windows 本地启动器会在需要时读取系统代理，Docker 容器则直接运行 `server.js`。


## 环境变量

| 变量 | 作用 |
| --- | --- |
| `OPENAI_API_KEY` | 自由输入所需的模型接口密钥。 |
| `OPENAI_BASE_URL` | 兼容 Chat Completions 的接口地址。 |
| `OPENAI_MODEL` | 模型名称。 |
| `DEMO_EXPIRES_AT` | 演示截止时间，使用带时区的 ISO 8601 时间；到期后停止自由输入。 |
| `DEMO_USAGE_FILE` | 模型任务累计用量文件；容器默认 `/mnt/workspace/zhiqiao-demo-usage.json`，本地需指定可写路径。 |
| `DEMO_MODEL_CONCURRENCY` | 同时发出的模型请求数；默认 50，最多 100。 |
| `HOST` / `PORT` | 本地默认 `127.0.0.1:3000`；Dockerfile 使用 `0.0.0.0:7860`。 |

服务端设有每位浏览器每 10 分钟 20 次、全站每 10 分钟 5000 次，以及演示期累计 10000 次模型任务的限制；内置示例和成功复用的通用概念结果不计入模型任务数。公开部署时，请为 `DEMO_USAGE_FILE` 配置可持久化路径，并按实际模型额度调整并发设置。

## 检查

```powershell
npm run check
node qa-deployment.mjs
```

`qa-deployment.mjs` 使用本地模拟模型接口，不会调用模型api。
