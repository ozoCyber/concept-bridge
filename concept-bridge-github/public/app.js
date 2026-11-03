"use strict";

function getVisitorId() {
  try {
    const key = "zhiqiao-visitor-id";
    let id = localStorage.getItem(key);
    if (!/^[0-9a-f]{32}$/.test(id || "")) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      id = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return "";
  }
}

const visitorId = getVisitorId();
const $ = (selector) => document.querySelector(selector);
const form = $("#concept-form");
const conceptInput = $("#concept");
const focusInput = $("#focus");
const generateButton = $("#generate-button");
const generateLabel = $("#generate-label");
const lessonPanel = $("#lesson");
const quizOptions = $("#quiz-options");
let currentLesson = null;
let currentSource = null;
let currentRequest = null;
let requestId = 0;
let progressTimer = null;
let displayedProgress = 0;

function updateProgress(percent) {
  const value = Math.max(displayedProgress, Math.min(100, Math.floor(percent)));
  displayedProgress = value;
  $("#loading-progress").setAttribute("aria-valuenow", String(value));
  $("#loading-progress-fill").style.width = value + "%";
  $("#loading-progress-percent").textContent = value + "%";
}

function stopProgress() {
  if (progressTimer !== null) clearInterval(progressTimer);
  progressTimer = null;
}

function startProgress(initial = 5, ceiling = 35) {
  stopProgress();
  const startedAt = performance.now();
  const from = Math.max(initial, displayedProgress);
  const tick = () => {
    const elapsed = Math.max(0, performance.now() - startedAt);
    const fraction = 1 - Math.exp(-elapsed / 6500);
    updateProgress(Math.min(ceiling, from + (ceiling - from) * fraction));
  };
  tick();
  progressTimer = setInterval(tick, 350);
}

async function finishProgress() {
  stopProgress();
  $("#loading-progress-fill").classList.add("is-finishing");
  updateProgress(100);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  await new Promise((resolve) => setTimeout(resolve, reducedMotion ? 80 : 300));
  $("#loading-progress-fill").classList.remove("is-finishing");
}

function showQueue(ahead, initialAhead) {
  stopProgress();
  const fraction = initialAhead > 0 ? 1 - ahead / initialAhead : 1;
  const percent = Math.max(35, Math.min(55, 35 + 20 * fraction));
  put("loading-title", "已提交，正在排队…");
  put("loading-description", `前方约 ${ahead} 个请求，轮到你后会自动生成。`);
  updateProgress(percent);
}

async function waitForJob(jobId, signal) {
  let initialAhead = null;
  let running = false;
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30 * 60 * 1000) {
    await new Promise((resolve) => setTimeout(resolve, 2500 + Math.random() * 1000));
    if (signal.aborted) throw new DOMException("已取消", "AbortError");
    const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, { signal });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "查询失败，请重新提交");
    if (result.status === "done") return result;
    if (result.status === "error") throw new Error(result.error || "生成失败，请重试");
    if (result.status === "queued") {
      initialAhead = Math.max(initialAhead ?? 0, result.ahead || 0);
      showQueue(result.ahead || 0, initialAhead);
    } else if (result.status === "running" && !running) {
      running = true;
      put("loading-title", "正在生成解释…");
      put("loading-description", "正在梳理关键原理、生活类比和小题。");
      startProgress(60, 95);
    }
  }
  throw new Error("等待时间较长，请重新提交");
}

function showState(name) {
  for (const id of ["empty-state", "loading-state", "error-state", "lesson"]) {
    $("#" + id).classList.toggle("hidden", id !== name);
  }
  $("#result-count").textContent = {
    "empty-state": "等待生成",
    "loading-state": "生成中",
    "error-state": "遇到问题",
    lesson: "已完成"
  }[name];
}

function setBusy(busy) {
  generateButton.disabled = busy;
  generateLabel.textContent = busy ? "正在生成…" : "开始思考";
  conceptInput.readOnly = busy;
  focusInput.readOnly = busy;
  document.querySelectorAll("#sample-list button").forEach((button) => { button.disabled = busy; });
  document.querySelectorAll("#refine-buttons button").forEach((button) => { button.disabled = busy; });
}

function revealResultOnNarrowScreen() {
  if (!window.matchMedia("(max-width: 980px)").matches) return;
  const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  $("#result-panel").scrollIntoView({ behavior, block: "start" });
}

function put(id, value) {
  $("#" + id).textContent = value || "—";
}

function renderQuiz(quiz) {
  put("quiz-question", quiz.question);
  quizOptions.replaceChildren();
  $("#quiz-feedback").classList.add("hidden");
  $("#quiz-feedback").replaceChildren();
  const letters = ["A", "B", "C", "D"];
  quiz.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiz-option";
    const letter = document.createElement("span");
    letter.className = "option-letter";
    letter.textContent = letters[index];
    const text = document.createElement("span");
    text.textContent = option;
    button.append(letter, text);
    button.addEventListener("click", () => selectAnswer(index));
    quizOptions.append(button);
  });
}

function selectAnswer(index) {
  if (!currentLesson || quizOptions.dataset.answered === "true") return;
  quizOptions.dataset.answered = "true";
  const correct = currentLesson.quiz.correct_index;
  [...quizOptions.children].forEach((button, i) => {
    button.disabled = true;
    if (i === correct) button.classList.add("correct");
    else if (i === index) button.classList.add("incorrect");
  });
  const box = $("#quiz-feedback");
  const title = document.createElement("strong");
  title.textContent = index === correct ? "答对了，你抓住了关键。" : "再看一眼关键区别。";
  const explanation = document.createElement("p");
  explanation.textContent = currentLesson.quiz.explanation;
  box.append(title, explanation);
  box.classList.remove("hidden");
  box.classList.toggle("is-correct", index === correct);
}

function renderLesson(data, source) {
  currentLesson = data;
  currentSource = source;
  put("lesson-concept", data.concept);
  const focusPill = $("#lesson-focus");
  if (data.focus) {
    focusPill.textContent = "你想了解：" + data.focus;
    focusPill.classList.remove("hidden");
  } else {
    focusPill.textContent = "";
    focusPill.classList.add("hidden");
  }
  put("one-liner", data.one_liner);
  const focusAnswer = (data.focus_answer || "").trim();
  $("#focus-answer-block").classList.toggle("hidden", !data.focus || !focusAnswer);
  put("focus-answer-label", data.focus_status === "off_topic" ? "这部分与概念关联不明显" : "先回答你关注的内容");
  put("focus-answer", focusAnswer);
  put("plain-explanation", data.plain_explanation);
  put("professional-explanation", data.professional_explanation);
  put("analogy-title", data.analogy.title);
  put("analogy-story", data.analogy.story);
  put("analogy-mapping", data.analogy.mapping);
  put("analogy-boundary", data.analogy.boundary);
  put("lesson-example", data.example);
  put("lesson-misconception", data.misconception);
  quizOptions.dataset.answered = "false";
  renderQuiz(data.quiz);
  showState("lesson");
  $("#result-count").textContent = source === "demo" ? "内置示例" : "已生成";
  $("#refine-error").classList.add("hidden");
}

async function generate(feedback = null) {
  if (generateButton.disabled) return;
  const concept = conceptInput.value.trim();
  const focus = focusInput.value.trim();
  if (concept.length < 2) {
    conceptInput.setCustomValidity("请输入至少 2 个非空白字符的概念");
    conceptInput.reportValidity();
    conceptInput.focus();
    return;
  }
  conceptInput.setCustomValidity("");
  if (focus.length > 200) {
    focusInput.setCustomValidity("具体内容最多 200 字");
    focusInput.reportValidity();
    focusInput.focus();
    return;
  }
  focusInput.setCustomValidity("");
  const payload = { concept, focus };
  if (feedback && currentLesson) {
    payload.feedback = feedback;
    payload.previous = currentLesson;
  }
  const thisRequest = ++requestId;
  currentRequest?.abort();
  currentRequest = new AbortController();
  setBusy(true);
  $("#refine-error").classList.add("hidden");
  put("loading-title", feedback ? "正在换一种讲法…" : "正在整理解释…");
  put("loading-description", "正在提交请求…");
  showState("loading-state");
  revealResultOnNarrowScreen();
  displayedProgress = 0;
  startProgress();
  try {
    const response = await fetch("/api/explain", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Visitor-ID": visitorId },
      body: JSON.stringify(payload),
      signal: currentRequest.signal
    });
    let result = await response.json();
    if (!response.ok) throw new Error(result.error || "生成失败，请重试");
    if (response.status === 202) {
      if (!/^[0-9a-f-]{36}$/.test(result.jobId || "")) throw new Error("任务编号无效，请重新提交");
      result = await waitForJob(result.jobId, currentRequest.signal);
    }
    if (thisRequest !== requestId) return;
    await finishProgress();
    if (thisRequest !== requestId) return;
    renderLesson(result.lesson, result.source);
    if (feedback) lessonPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    if (error.name === "AbortError" || thisRequest !== requestId) return;
    if (feedback && currentLesson) {
      showState("lesson");
      $("#result-count").textContent = currentSource === "demo" ? "内置示例" : "已生成";
      put("refine-error", (error.message || "改写失败，请稍后重试") + "。原解释已保留。");
      $("#refine-error").classList.remove("hidden");
    } else {
      put("error-message", error.message || "请稍后重试。");
      showState("error-state");
    }
  } finally {
    if (thisRequest === requestId) {
      stopProgress();
      currentRequest = null;
      setBusy(false);
    }
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  generate();
});

$("#sample-list").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-concept]");
  if (!button) return;
  conceptInput.value = button.dataset.concept;
  focusInput.value = button.dataset.focus || "";
  conceptInput.setCustomValidity("");
  focusInput.setCustomValidity("");
  generate();
});

$("#refine-buttons").addEventListener("click", (event) => {
  const button = event.target.closest("button[data-feedback]");
  if (button && currentLesson) generate(button.dataset.feedback);
});

$("#retry-button").addEventListener("click", () => generate());

for (const input of [conceptInput, focusInput]) {
  input.addEventListener("input", () => {
    input.setCustomValidity("");
    if (currentLesson && (conceptInput.value.trim() !== currentLesson.concept || focusInput.value.trim() !== (currentLesson.focus || ""))) {
      document.querySelectorAll("#refine-buttons button").forEach((button) => { button.disabled = true; });
    } else if (currentLesson) {
      document.querySelectorAll("#refine-buttons button").forEach((button) => { button.disabled = false; });
    }
  });
}
