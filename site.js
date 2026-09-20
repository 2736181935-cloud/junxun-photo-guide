"use strict";

const CATEGORY_NAMES = {
  A: "任务与选题", B: "准备与器材", C: "时机与人物", D: "机位与景别",
  E: "构图与边界", F: "曝光与画质", G: "光线与后期", H: "发布检查",
  I: "导出与上传", V: "视频拍摄"
};
const UNIVERSAL_PLAN_IDS = ["A01", "A02", "A03", "A04", "F07", "H01", "H02", "I01", "I03", "I04"];
const RULES_PER_PAGE = 12;
const INSTRUCTOR_ISSUE_URL = "https://github.com/2736181935-cloud/junxun-photo-agent/issues/new";
let rules = [];
let activeCategory = "all";
let visibleCount = RULES_PER_PAGE;

function normalize(value) {
  return String(value || "").toLocaleLowerCase("zh-CN").replace(/[\s\p{P}\p{S}]/gu, "");
}

function grams(value) {
  const result = new Set();
  for (const width of [2, 3]) {
    for (let index = 0; index <= value.length - width; index += 1) {
      result.add(value.slice(index, index + width));
    }
  }
  return result;
}

function scoreRule(rule, query) {
  const normalized = normalize(query);
  if (!normalized) return 1;
  let score = 0;
  for (const field of [rule.title, rule.condition, rule.action]) {
    const value = normalize(field);
    if (normalized.length >= 2 && value.includes(normalized)) score += 16;
  }
  for (const tag of rule.tags || []) {
    const value = normalize(tag);
    if (value.length >= 2 && normalized.includes(value)) score += 9;
  }
  for (const alias of rule.aliases || []) {
    const value = normalize(alias);
    if (value.length >= 2 && normalized.includes(value)) score += 24;
  }
  const text = normalize([rule.title, rule.condition, rule.action, ...(rule.tags || []), ...(rule.aliases || [])].join(" "));
  const known = grams(text);
  for (const gram of grams(normalized)) {
    if (known.has(gram)) score += 1;
  }
  return score;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function ruleCard(rule) {
  const card = element("article", "rule-card");
  const top = element("div", "card-top");
  top.append(element("span", "rule-id", rule.id));
  top.append(element("span", `level${rule.level === "硬性要求" ? " hard" : ""}`, rule.level));
  card.append(top, element("h3", "", rule.title), element("p", "", rule.action));
  card.append(element("div", "rule-condition", `适用：${rule.condition}`));
  card.append(element("div", "rule-source", `来源：${(rule.sources || []).join(" · ")}`));
  return card;
}

function commentCard(item) {
  const card = element("article", "rule-card comment-card");
  const top = element("div", "card-top");
  top.append(element("span", "rule-id", item.id));
  top.append(element("span", "level", item.category_name));
  card.append(top, element("h3", "", item.title), element("p", "", item.comment));
  card.append(element("div", "rule-condition", `场景：${item.scene || "未填写"} · 环节：${item.stage || "自动判断"}`));
  card.append(element("div", "rule-source", `编码：${(item.related_rules || []).join(" · ") || "待分类"} · 来源：${item.source}`));
  return card;
}

async function loadComments() {
  const container = document.querySelector("#comment-list");
  try {
    const response = await fetch("comments.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.comments)) throw new Error("点评数据格式错误");
    const comments = [...payload.comments].reverse();
    document.querySelector("#comments-count").textContent = `已审核 ${comments.length} 条点评`;
    container.replaceChildren();
    if (!comments.length) container.append(element("p", "empty-note", "暂无已审核的新增点评。可先学习上方规则。"));
    else for (const item of comments) container.append(commentCard(item));
  } catch (error) {
    document.querySelector("#comments-count").textContent = "点评载入失败";
    container.replaceChildren(element("p", "empty-note", "点评数据暂时无法载入，请刷新页面重试。"));
    console.error(error);
  }
}

function previewClassification() {
  const form = document.querySelector("#instructor-form");
  const scene = form.elements.namedItem("scene").value.trim();
  const comment = form.elements.namedItem("comment").value.trim();
  const stage = form.elements.namedItem("stage").value;
  const query = `${scene} ${comment}`.trim();
  const empty = document.querySelector("#classification-empty");
  const result = document.querySelector("#classification-result");
  if (!query || !rules.length) {
    empty.hidden = false;
    result.hidden = true;
    return;
  }
  const ranked = rules.map(rule => ({ rule, score: scoreRule(rule, query) + (stage !== "自动判断" && rule.stage.includes(stage) ? 3 : 0) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))
    .slice(0, 3);
  const category = ranked.length ? ranked[0].rule.id[0] : "";
  empty.hidden = true;
  result.hidden = false;
  document.querySelector("#classification-code").textContent = category || "?";
  document.querySelector("#classification-name").textContent = CATEGORY_NAMES[category] || "待人工分类";
  document.querySelector("#classification-rules").textContent = `可能关联：${ranked.map(item => `${item.rule.id} ${item.rule.title}`).join(" · ") || "暂无"}`;
}

function submitInstructorComment(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const scene = form.elements.namedItem("scene").value.trim();
  const stage = form.elements.namedItem("stage").value;
  const comment = form.elements.namedItem("comment").value.trim();
  const parameters = new URLSearchParams({
    template: "instructor-comment.yml",
    title: `[指导员点评] ${scene}`,
    scene,
    stage,
    comment,
    public: "确认可公开学习",
  });
  window.open(`${INSTRUCTOR_ISSUE_URL}?${parameters.toString()}`, "_blank", "noopener,noreferrer");
}

function setQuery(value) {
  document.querySelector("#search-input").value = value;
  activeCategory = "all";
  visibleCount = RULES_PER_PAGE;
  renderCategories();
  renderRules();
  document.querySelector("#explore").scrollIntoView({ behavior: "smooth" });
}

function renderCategories() {
  const container = document.querySelector("#category-list");
  container.replaceChildren();
  const categories = [["all", "全部规则", rules.length], ...Object.entries(CATEGORY_NAMES).map(([code, label]) => [
    code, label, rules.filter(rule => rule.id.startsWith(code)).length
  ])];
  for (const [code, label, count] of categories) {
    const button = element("button", code === activeCategory ? "active" : "");
    button.type = "button";
    button.setAttribute("aria-pressed", String(code === activeCategory));
    button.append(element("span", "", label), element("span", "", String(count)));
    button.addEventListener("click", () => {
      activeCategory = code;
      visibleCount = RULES_PER_PAGE;
      renderCategories();
      renderRules();
    });
    container.append(button);
  }
}

function renderRules() {
  const query = document.querySelector("#search-input").value.trim();
  const container = document.querySelector("#rule-results");
  const matches = rules
    .filter(rule => activeCategory === "all" || rule.id.startsWith(activeCategory))
    .map(rule => ({ rule, score: scoreRule(rule, query) }))
    .filter(item => !query || item.score > 0)
    .sort((a, b) => query ? b.score - a.score || a.rule.id.localeCompare(b.rule.id) : a.rule.id.localeCompare(b.rule.id));
  document.querySelector("#results-label").textContent = query ? `找到 ${matches.length} 条相关规则` : `共 ${matches.length} 条规则`;
  container.replaceChildren();
  if (!matches.length) {
    container.append(element("p", "empty-note", "没有匹配的规则。试试更短的关键词，或切换到全部分类。"));
    return;
  }
  for (const item of matches.slice(0, visibleCount)) container.append(ruleCard(item.rule));
  if (matches.length > visibleCount) {
    const more = element("button", "button button-outline", `再看 ${Math.min(RULES_PER_PAGE, matches.length - visibleCount)} 条`);
    more.type = "button";
    more.style.color = "var(--ink)";
    more.style.borderColor = "var(--line)";
    more.addEventListener("click", () => { visibleCount += RULES_PER_PAGE; renderRules(); });
    container.append(more);
  }
}

function planGroup(title, selected) {
  if (!selected.length) return null;
  const section = element("section", "plan-group");
  section.append(element("h3", "", title));
  const list = element("ul");
  for (const rule of selected) {
    const item = element("li");
    item.append(element("b", "", rule.id), document.createTextNode(`${rule.title}：${rule.action}`));
    item.append(element("small", "", `来源 ${rule.sources.slice(0, 3).join(" · ")}${rule.sources.length > 3 ? " 等" : ""}`));
    list.append(item);
  }
  section.append(list);
  return section;
}

function renderPlan(scene) {
  const container = document.querySelector("#plan-results");
  const byId = new Map(rules.map(rule => [rule.id, rule]));
  const sceneMatches = rules.map(rule => ({ rule, score: scoreRule(rule, scene) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8).map(item => item.rule.id);
  const ids = [...new Set([...UNIVERSAL_PLAN_IDS, ...sceneMatches])];
  const selected = ids.map(id => byId.get(id)).filter(Boolean);
  container.replaceChildren();
  container.append(element("p", "plan-summary", `“${scene}”拍摄清单 · ${selected.length} 项提醒`));
  const grid = element("div", "plan-grid");
  const before = selected.filter(rule => /策划|选题/.test(rule.stage));
  const delivery = selected.filter(rule => /交付|导出|后期/.test(rule.stage) || rule.id.startsWith("H") || rule.id.startsWith("I"));
  const field = selected.filter(rule => !before.includes(rule) && !delivery.includes(rule));
  for (const group of [planGroup("出发前", before), planGroup("现场拍摄", field), planGroup("选片与交付", delivery)]) {
    if (group) grid.append(group);
  }
  container.append(grid, element("p", "plan-disclaimer", "清单按关键词匹配；具体站位、光线与设备参数请在现场确认。"));
}

function selectedBoolean(form, name) {
  const value = form.elements.namedItem(name).value;
  return value === "yes" ? true : value === "no" ? false : null;
}

function evaluateSubmission(form) {
  const issues = [];
  const add = (severity, id, message) => issues.push({ severity, id, message });
  const face = selectedBoolean(form, "clear_instructor_face");
  const insignia = selectedBoolean(form, "visible_insignia");
  const blurred = selectedBoolean(form, "insignia_blurred");
  if (face === true) add(3, "H01", "出现清晰可辨的教官面部；重新选片或调整取景、裁切。");
  else if (face === null) add(1, "H01", "尚未确认教官面部是否清晰可辨。");
  if (insignia === true && blurred === false) add(3, "H02", "可辨的徽章等标志尚未模糊。");
  else if (insignia === true && blurred === null) add(1, "H02", "有可辨标志，但尚未确认模糊结果。");
  else if (insignia === null) add(1, "H02", "尚未确认画面中是否有可辨徽章等标志。");
  if (selectedBoolean(form, "has_personal_info") === true && selectedBoolean(form, "personal_info_blurred") !== true) {
    add(3, "H05", "可辨个人信息尚未确认完成处理。");
  }
  if (selectedBoolean(form, "out_of_focus") === true) add(2, "F01", "主体虚焦，建议重选或补拍。");
  if (selectedBoolean(form, "eyes_closed") === true) add(2, "C03", "人物闭眼，建议重选。");
  if (selectedBoolean(form, "cut_joint") === true) {
    const keyMoment = selectedBoolean(form, "key_moment") === true;
    add(keyMoment ? 1 : 2, "E03", keyMoment ? "人物截关节；关键新闻瞬间需人工判断事实价值与裁切。" : "人物截关节，建议重选或调整裁切。");
  }
  const ratio = form.elements.namedItem("ratio").value;
  if (ratio === "unknown") add(1, "I03", "尚未确认照片比例。");
  else if (ratio !== "3:2") add(2, "I03", "照片比例不符合项目的 3:2 要求。");
  if (form.elements.namedItem("purpose").value === "public_article") {
    const size = form.elements.namedItem("file_mb").value;
    if (size === "") add(1, "I02", "公众号供稿尚未确认导出文件大小。");
    else if (Number(size) > 10) add(2, "I02", "常规公众号供稿文件超过 10 MB。");
  }
  return issues;
}

function renderReview(issues) {
  const container = document.querySelector("#review-results");
  container.replaceChildren();
  const highest = Math.max(0, ...issues.map(issue => issue.severity));
  const names = { 0: ["可进入人工终审", "pass"], 1: ["待人工复核", "review"], 2: ["需重选或修正", "fix"], 3: ["不能交付", "block"] };
  const [title, style] = names[highest];
  const box = element("div", `result-box ${style}`);
  box.append(element("h3", "", title));
  box.append(element("p", "", "本结果仅依据你填写的事实。最终发布前仍需查看实际照片和导出文件。"));
  if (issues.length) {
    const list = element("ul", "issue-list");
    for (const issue of issues) {
      const item = element("li");
      item.append(element("b", "", issue.id), document.createTextNode(issue.message));
      list.append(item);
    }
    box.append(list);
  }
  container.append(box);
  box.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function start() {
  loadComments();
  try {
    const response = await fetch("rules.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.rules)) throw new Error("规则数据格式错误");
    rules = payload.rules;
    document.querySelector("#rule-count").textContent = String(payload.rule_count);
    document.querySelector("#data-version").textContent = payload.version;
    renderCategories();
    renderRules();
  } catch (error) {
    document.querySelector("#results-label").textContent = "规则载入失败";
    document.querySelector("#rule-results").append(element("p", "empty-note", "无法载入规则数据，请刷新页面重试。"));
    console.error(error);
  }
  document.querySelector("#search-input").addEventListener("input", () => { visibleCount = RULES_PER_PAGE; renderRules(); });
  document.querySelector("#clear-search").addEventListener("click", () => setQuery(""));
  document.querySelectorAll("[data-query]").forEach(button => button.addEventListener("click", () => setQuery(button.dataset.query)));
  document.querySelector("#plan-form").addEventListener("submit", event => {
    event.preventDefault();
    const scene = document.querySelector("#scene-input").value.trim();
    if (scene && rules.length) renderPlan(scene);
  });
  document.querySelector("#review-form").addEventListener("submit", event => {
    event.preventDefault();
    renderReview(evaluateSubmission(event.currentTarget));
  });
  const instructorForm = document.querySelector("#instructor-form");
  instructorForm.addEventListener("input", previewClassification);
  instructorForm.addEventListener("change", previewClassification);
  instructorForm.addEventListener("submit", submitInstructorComment);
}

document.addEventListener("DOMContentLoaded", start);
