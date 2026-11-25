"use strict";

// 서버 없이 실행하는 데모입니다. 금액은 모두 '이 기부자에게 배분된 금액'입니다.
const STORAGE_KEY = "ongi-demo-v1";
const organizations = [
  { id: "meal", name: "따뜻한 한 끼", region: "서울 성북구", description: "돌봄이 필요한 아이들에게 든든한 식사를 전합니다. 식재료 구입부터 도시락 전달까지, 매일의 식사를 함께합니다.", directRate: 90, since: "2021", icon: "meal" },
  { id: "learn", name: "내일을 그리는 아이들", region: "부산 영도구", description: "아이들이 배움의 기회를 놓치지 않도록 학용품과 교육 자료를 지원합니다. 작은 배움이 더 큰 내일로 이어집니다.", directRate: 85, since: "2020", icon: "book" }
];
const icons = {
  home: '<path d="m3 10 9-7 9 7v10H4V10"/><path d="M9 20v-7h6v7"/>',
  list: '<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  building: '<path d="M3 21h18M6 21V5l6-2 6 2v16M10 8h4M10 12h4M10 21v-5h4v5"/>',
  bell: '<path d="M5 16h14l-2-3V9a5 5 0 0 0-10 0v4l-2 3ZM10 20h4"/>',
  heart: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 3 11 8 15 5-4 12-10 8-15Z"/>',
  wallet: '<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M3 8V5l14-3v3M21 11h-6v5h6M17 13.5h.1"/>',
  check: '<path d="m8 12 3 3 5-6"/><circle cx="12" cy="12" r="9"/>',
  meal: '<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-5 3-5 10 0 10"/>',
  book: '<path d="M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1v15"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.heart}</svg>`;
const money = value => new Intl.NumberFormat("ko-KR").format(value);
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const org = id => organizations.find(item => item.id === id);
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const seed = () => ({
  donations: [
    { id: "d1", orgId: "meal", amount: 100000, date: "2026-11-01" },
    { id: "d2", orgId: "learn", amount: 50000, date: "2026-11-05" }
  ],
  expenses: [
    { id: "e1", orgId: "meal", title: "아이들을 위한 신선한 식재료 구입", category: "식사 지원", amount: 45000, date: "2026-11-23", attachment: null },
    { id: "e2", orgId: "learn", title: "새 학기를 준비하는 학용품 전달", category: "교육 지원", amount: 30000, date: "2026-11-21", attachment: null },
    { id: "e3", orgId: "meal", title: "따뜻한 도시락 만들기", category: "식사 지원", amount: 30000, date: "2026-11-18", attachment: null }
  ],
  notifications: [
    { id: "n1", title: "따뜻한 마음이 한 끼의 식사가 되었어요", text: "따뜻한 한 끼에서 식재료 구입 내역 45,000원과 예시 증빙을 공개했어요.", date: "2026-11-23", read: false, expenseId: "e1" },
    { id: "n2", title: "아이들의 새로운 시작을 함께했어요", text: "내일을 그리는 아이들에서 학용품 지원 내역 30,000원과 예시 증빙을 공개했어요.", date: "2026-11-21", read: false, expenseId: "e2" }
  ]
});
let state;
let storageAvailable = true;
let persistedRaw = null;
let stateVersion = 0;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  persistedRaw = saved;
  state = saved ? JSON.parse(saved) : seed();
  if (!state || ![state.donations, state.expenses, state.notifications].every(Array.isArray)) throw new Error("잘못된 데이터");
} catch { state = seed(); storageAvailable = false; }
const main = document.querySelector("#main");
const dialog = document.querySelector("#dialog");
let currentView = "home";
let toastTimer;
let lastMutation = null;
let pendingImport = null;
let proofUrl = null;
let dialogVersion = 0;
let pdfLibrary = null;
let pdfTask = null;
let pdfDocument = null;
let pdfPageNumber = 1;
let pdfViewToken = 0;
let pdfRendering = false;
function toast(message) {
  const target = document.querySelector("#toast");
  target.textContent = message;
  target.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { target.hidden = true; }, 4500);
}
async function commit(next, expectedRaw = persistedRaw) {
  try {
    if (!globalThis.navigator?.locks) throw new Error("탭 간 안전한 저장을 지원하는 최신 브라우저에서 열어 주세요.");
    return await navigator.locks.request(`${STORAGE_KEY}-write`, () => {
      const latest = localStorage.getItem(STORAGE_KEY);
      if (latest !== expectedRaw) {
        syncStorage(latest);
        toast("다른 탭에서 기록이 바뀌었어요. 최신 내용을 확인하고 다시 시도해 주세요.");
        return false;
      }
      const raw = JSON.stringify(next);
      localStorage.setItem(STORAGE_KEY, raw);
      persistedRaw = raw;
      state = next;
      stateVersion++;
      storageAvailable = true;
      return true;
    });
  } catch (error) {
    toast(globalThis.navigator?.locks ? "저장하지 못했어요. 브라우저 저장 설정과 남은 공간을 확인해 주세요." : error.message);
    return false;
  }
}
function syncStorage(raw) {
  if (raw === persistedRaw) return;
  try {
    const next = raw === null ? { donations: [], expenses: [], notifications: [] } : validateData(JSON.parse(raw));
    state = next;
    persistedRaw = raw;
    stateVersion++;
    render();
    const notice = document.querySelector("#sync-notice");
    notice.textContent = "다른 탭의 변경을 반영했어요. 열어 둔 입력창은 닫고 다시 열어 주세요.";
    notice.hidden = false;
  } catch {
    toast("다른 탭의 데이터를 읽지 못했어요. 기존 화면을 유지합니다.");
  }
}
const sum = items => items.reduce((total, item) => total + item.amount, 0);
// 같은 날의 기부금은 그날의 사용에 배분할 수 있습니다.
function balanceError(next, orgIds) {
  for (const orgId of new Set(orgIds)) {
    const daily = new Map();
    for (const [records, sign] of [[next.donations, 1], [next.expenses, -1]]) {
      for (const record of records.filter(item => item.orgId === orgId)) {
        daily.set(record.date, (daily.get(record.date) || 0) + sign * record.amount);
      }
    }
    let balance = 0;
    for (const date of [...daily.keys()].sort()) {
      balance += daily.get(date);
      if (balance < 0) return `${org(orgId).name}의 ${date} 기준 기부금이 ${money(-balance)}원 부족해요. 기부일·사용일과 금액을 확인해 주세요.`;
    }
  }
  return "";
}
function recordActions(type, id, label) {
  return `<div class="record-actions"><button class="text-link" data-edit="${escapeHTML(id)}" data-type="${type}" aria-label="${escapeHTML(label)} 수정">수정</button><button class="text-link danger" data-delete="${escapeHTML(id)}" data-type="${type}" aria-label="${escapeHTML(label)} 삭제">삭제</button></div>`;
}
const fingerprint = value => JSON.stringify(value, (key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
function changesBetween(before, after) {
  return ["donations", "expenses", "notifications"].flatMap(collection => {
    const oldItems = new Map(before[collection].map(item => [item.id, item]));
    const newItems = new Map(after[collection].map(item => [item.id, item]));
    return [...new Set([...oldItems.keys(), ...newItems.keys()])].filter(id => fingerprint(oldItems.get(id)) !== fingerprint(newItems.get(id))).map(id => ({
      collection, id, before: oldItems.get(id) || null, after: newItems.get(id) || null,
      index: before[collection].findIndex(item => item.id === id)
    }));
  });
}
async function saveMutation(next, message) {
  const changes = changesBetween(state, next);
  if (!await commit(next)) return false;
  lastMutation = changes;
  dialog.close();
  render();
  document.querySelector("#undo-message").textContent = message;
  document.querySelector("#undo-panel").hidden = false;
  return true;
}
const withoutRead = item => item ? Object.fromEntries(Object.entries(item).filter(([key]) => key !== "read")) : null;
async function undoMutation() {
  if (!lastMutation) return;
  const next = structuredClone(state);
  for (const change of lastMutation) {
    const current = next[change.collection].find(item => item.id === change.id) || null;
    const comparable = item => change.collection === "notifications" ? withoutRead(item) : item;
    if (fingerprint(comparable(current)) !== fingerprint(comparable(change.after))) {
      toast("같은 기록이 다른 탭에서 변경되어 실행 취소할 수 없어요. 최신 기록을 확인해 주세요.");
      return;
    }
    next[change.collection] = next[change.collection].filter(item => item.id !== change.id);
    if (change.before) {
      const restored = structuredClone(change.before);
      if (change.collection === "notifications" && current && current.read !== change.after.read) restored.read = current.read;
      next[change.collection].splice(Math.max(change.index, 0), 0, restored);
    }
  }
  const problem = balanceError(next, organizations.map(item => item.id));
  if (problem) { toast(problem); return; }
  if (!await commit(next)) return;
  lastMutation = null;
  document.querySelector("#undo-panel").hidden = true;
  render();
  toast("직전 기록 변경을 취소했어요. 다른 기록과 알림 읽음 상태는 유지했어요.");
}
const sortedExpenses = () => [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
function pageHeading(title, description, action = "") {
  return `<div class="page-heading"><div><h1>${title}</h1><p class="subtitle">${description}</p></div>${action}</div>`;
}
function stats() {
  const donated = sum(state.donations), used = sum(state.expenses);
  const meals = Math.floor(sum(state.expenses.filter(e => e.category === "식사 지원")) / 5000);
  return `<div class="stats">
    <div class="stat"><div class="stat-top">누적 기부금<span class="stat-icon">${icon("wallet")}</span></div><div class="stat-value">${money(donated)}<small>원</small></div><div class="stat-note">${new Set(state.donations.map(d => d.orgId)).size}곳에 전한 따뜻한 마음</div></div>
    <div class="stat"><div class="stat-top">사용 내역이 등록된 금액<span class="stat-icon">${icon("list")}</span></div><div class="stat-value">${money(used)}<small>원</small></div><div class="stat-note">기부금 중 <strong>${donated ? Math.round(used / donated * 100) : 0}%</strong> · 증빙 미검증</div></div>
    <div class="stat"><div class="stat-top">등록 내역으로 추산한 변화<span class="stat-icon">${icon("meal")}</span></div><div class="stat-value">${meals}<small>끼의 식사</small></div><div class="stat-note">식사 지원금 5,000원당 1끼로 추산</div></div>
  </div>`;
}
function expenseRow(item) {
  return `<article class="expense"><span class="expense-symbol ${item.category === "교육 지원" ? "blue" : ""}">${icon(org(item.orgId).icon)}</span><div class="expense-info"><h3>${escapeHTML(item.title)}</h3><div class="metadata">${org(item.orgId).name} · ${item.date}</div><span class="category-tag">${escapeHTML(item.category)}</span><span class="proof-status">${item.attachment ? "증빙 첨부 · 미검증" : "첨부 없음 · 미검증"}</span></div><div class="expense-side"><strong>${money(item.amount)}원</strong><button class="proof-button" data-proof="${escapeHTML(item.id)}">증빙 보기</button>${recordActions("expense", item.id, item.title)}</div></article>`;
}
function distribution() {
  const total = sum(state.expenses);
  const colors = ["#31826a", "#a0bdb0", "#d4dfd6"];
  const categories = ["식사 지원", "교육 지원", "운영 지원"].map((name, i) => ({ name, amount: sum(state.expenses.filter(e => e.category === name)), color: colors[i] }));
  let cursor = 0;
  const stops = categories.map(c => { const start = cursor; cursor += total ? c.amount / total * 100 : 0; return `${c.color} ${start}% ${cursor}%`; }).join(",");
  return `<section class="card"><h2>어디에 쓰였을까요?</h2><div class="distribution"><div class="donut" style="background:${total ? `conic-gradient(${stops})` : "#edf1ed"}"><div class="donut-center">${state.expenses.length}건<small>등록된 사용 내역</small></div></div><div class="legend">${categories.map(c => `<div class="legend-row"><span><i class="legend-dot" style="background:${c.color}"></i>${c.name}</span><strong>${total ? Math.round(c.amount / total * 100) : 0}%</strong></div>`).join("")}</div></div><p class="card-note">등록된 사용 금액의 항목별 비율이며, 증빙의 진위나 실제 사용 여부를 검증한 결과는 아니에요.</p></section>`;
}
const artwork = `<div class="hero-art" aria-hidden="true"><svg viewBox="0 0 220 190"><ellipse cx="117" cy="179" rx="83" ry="9" fill="#d4e3d6"/><path d="M112 133C49 125 48 81 67 71c20-10 37 10 45 25 7-26 27-44 46-34 28 15 5 57-46 71" fill="#78a087"/><path d="M112 159V103" stroke="#497b5d" stroke-width="4"/><path d="m108 150-28-24M114 127l27-24" stroke="#497b5d" stroke-width="3"/><path d="m31 146 19-21c9-10 22-8 32-1l30 20 31-10c17-6 24 9 10 16l-40 22c-10 6-18 4-27 0l-34-13-11 9" fill="#f9faf4"/><path d="m80 134 23 13c7 4 13-3 7-8" stroke="#d1dccb" stroke-width="2"/><path d="m30 144 17 20-14 18-23-22Z" fill="#31826a"/><circle cx="174" cy="32" r="4" fill="#d9b878"/><path d="m45 49 4-8 4 8 8 4-8 4-4 8-4-8-8-4Z" fill="#abc4ab"/><path d="m182 101 2-5 3 5 5 2-5 2-3 5-2-5-5-2Z" fill="#abc4ab"/></svg></div>`;
function home() {
  return pageHeading("내 마음이 닿은 곳", "보내주신 온기가 만들어 낸 변화를 확인해 보세요.", `<button class="button secondary" data-action="donate">${icon("plus")} 기부 기록 추가</button>`) +
    `<section class="hero"><div><div class="eyebrow">A LITTLE WARMTH, A REAL CHANGE</div><h2>당신의 작은 나눔이<br><strong>누군가의 오늘을 바꾸고 있어요.</strong></h2><p>기부금이 쓰인 순간부터, 그 뒤의 이야기까지.</p></div>${artwork}</section>` + stats() +
    `<div class="columns"><div><div class="section-heading"><div><h2>최근 기부금 사용 내역</h2><p>기부처가 등록한 사용 내역을 살펴보세요.</p></div><a class="text-link" href="#history">전체 보기</a></div><section class="card">${sortedExpenses().slice(0, 4).map(expenseRow).join("") || '<p class="empty">아직 등록된 사용 내역이 없어요.</p>'}</section><div class="card progress-card"><span>${icon("heart")}</span><div><h3>아직 전해질 온기가 남아 있어요</h3><p>남은 ${money(sum(state.donations) - sum(state.expenses))}원의 사용 소식도 이곳에서 알려드릴게요.</p></div></div></div><div class="right-column">${distribution()}<section class="card"><div class="section-heading"><h2>새로운 소식</h2><a class="text-link" href="#notifications">모두 보기</a></div>${state.notifications.slice(0, 2).map(n => `<div class="update"><span>${icon("heart")}</span><div><p>${escapeHTML(n.title)}</p><small>${n.date}</small></div></div>`).join("") || '<p class="empty">새로운 소식을 기다리고 있어요.</p>'}</section></div></div>`;
}
function history() {
  return pageHeading("나의 기부 기록", "나눔의 시작부터 사용된 순간까지, 한곳에서 확인하세요.", '<button class="button" data-action="donate">기부 기록 추가</button>') + stats() +
    `<section class="card"><div class="section-heading"><div><h2>기부금 사용 내역</h2><p>금액은 내 기부금에 배분된 사용액입니다.</p></div><button class="button secondary small" data-action="expense">증빙 등록 · 데모</button></div><div class="toolbar"><input id="search" type="search" placeholder="사용 내역 검색" aria-label="사용 내역 검색"><select id="org-filter" aria-label="기부처 필터"><option value="">모든 기부처</option>${orgOptions()}</select><select id="category-filter" aria-label="지원 항목 필터"><option value="">모든 항목</option>${["식사 지원", "교육 지원", "운영 지원"].map(c => `<option>${c}</option>`).join("")}</select></div><div id="expense-list">${sortedExpenses().map(expenseRow).join("")}</div></section>
    <section class="card"><div class="section-heading"><h2>보낸 마음의 기록</h2></div><div class="table-wrap"><table><thead><tr><th>기부일</th><th>기부처</th><th>기부 금액</th><th>관리</th></tr></thead><tbody>${[...state.donations].sort((a, b) => b.date.localeCompare(a.date)).map(d => `<tr><td>${d.date}</td><td>${org(d.orgId).name}</td><td><strong>${money(d.amount)}원</strong></td><td>${recordActions("donation", d.id, `${d.date} ${org(d.orgId).name} 기부 기록`)}</td></tr>`).join("")}</tbody></table></div><p class="card-note">직접 입력한 기록이며, 실제 결제나 기부금 영수증 발급은 이루어지지 않아요.</p></section>`;
}
function organizationsView() {
  return pageHeading("기부처 알아보기", "기부처의 활동과 사용 비율을 나란히 살펴보세요.") +
    `<div class="organizations">${organizations.map(o => `<section class="card"><div class="org-top"><span class="org-logo">${icon(o.icon)}</span><div><h2>${o.name}</h2><div class="metadata">${icon("pin")} ${o.region} · 가상 기부처</div></div></div><p class="org-description">${o.description}</p><div class="org-numbers"><div>직접 사업비 비율<strong>${o.directRate}%</strong></div><div>운영비 비율<strong>${100 - o.directRate}%</strong></div><div>활동 시작<strong>${o.since}년</strong></div></div><div class="progress"><span style="width:${o.directRate}%"></span></div><p class="card-note">기부처 전체 예산 기준 예시 비율 · 내 기부금 사용률과 별개입니다.</p><div class="org-numbers" style="margin:22px 0"><div>내 누적 기부금<strong>${money(sum(state.donations.filter(d => d.orgId === o.id)))}원</strong></div><div>공개된 내 사용 내역<strong>${state.expenses.filter(e => e.orgId === o.id).length}건</strong></div></div><button class="button secondary" data-donate-org="${o.id}">이 기부처에 기록 추가</button></section>`).join("")}</div><p class="card-note">이름, 활동 이력 및 비율은 기능을 보여주기 위한 예시이며 실제 단체를 평가한 정보가 아닙니다.</p>`;
}
function notificationsView() {
  return pageHeading("알림", "사용 내역이 등록되면 새로운 소식을 전해드려요.", '<button class="button secondary" data-action="read-all">모두 읽음</button>') +
    `<section class="card">${state.notifications.map(n => `<article class="notification ${n.read ? "" : "unread"}"><span class="icon-wrap">${icon("bell")}</span><div><h3>${escapeHTML(n.title)}</h3><p>${escapeHTML(n.text)}</p><div class="metadata">${n.date} · ${n.read ? "읽음" : "새 알림"}</div><button class="text-link" data-notification="${n.id}">사용 내역 확인</button></div></article>`).join("") || '<p class="empty">아직 알림이 없어요.</p>'}</section><p class="card-note">데모에서는 이 브라우저에서 증빙을 등록하면 앱 안 알림이 생성됩니다. 앱이 닫혀 있을 때 보내는 푸시 알림은 지원하지 않습니다.</p>`;
}
function render() {
  const view = location.hash.slice(1) || "home";
  currentView = ["home", "history", "organizations", "notifications"].includes(view) ? view : "home";
  main.innerHTML = ({ home, history, organizations: organizationsView, notifications: notificationsView })[currentView]();
  document.querySelectorAll("[data-nav]").forEach(a => { a.classList.toggle("active", a.dataset.nav === currentView); if (a.dataset.nav === currentView) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  const unread = state.notifications.filter(n => !n.read).length;
  document.querySelector("#nav-badge").textContent = unread || "";
  document.querySelector("#unread-dot").hidden = !unread;
}
function orgOptions(selected = "") { return organizations.map(o => `<option value="${o.id}" ${o.id === selected ? "selected" : ""}>${o.name}</option>`).join(""); }
function openDialog(title, content) {
  clearProof();
  dialogVersion = stateVersion;
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-content").innerHTML = content;
  dialog.showModal();
}
function openForm(type, selected = "meal", record = null) {
  const expense = type === "expense", editing = Boolean(record);
  selected = record?.orgId || selected;
  openDialog(editing ? (expense ? "사용 내역 수정" : "기부 기록 수정") : (expense ? "사용 내역과 증빙 등록" : "기부 기록 추가"), `<form id="record-form" data-type="${type}" data-id="${escapeHTML(record?.id || "")}" data-version="${stateVersion}"><p class="form-note">${expense ? "기부처 담당자의 등록 과정을 체험하는 데모입니다. 내 기부금에서 사용된 금액만 입력해 주세요." : "이미 기부한 내역을 직접 기록해 보세요. 실제 결제는 진행되지 않습니다."}</p>
    <label class="form-field">기부처<select name="orgId">${orgOptions(selected)}</select></label>
    ${expense ? `<label class="form-field">사용 내용<input name="title" required maxlength="80" value="${escapeHTML(record?.title || "")}" placeholder="예: 아이들을 위한 식재료 구입"></label><label class="form-field">사용 항목<select name="category">${["식사 지원", "교육 지원", "운영 지원"].map(category => `<option ${record?.category === category ? "selected" : ""}>${category}</option>`).join("")}</select></label>` : ""}
    <label class="form-field">${expense ? "사용" : "기부"} 금액 (원)<input name="amount" type="number" min="1" max="1000000000" step="1" required value="${record?.amount || ""}" placeholder="예: 10000"></label>
    <label class="form-field">${expense ? "사용일" : "기부일"}<input name="date" type="date" required value="${record?.date || today()}" max="${today()}"></label>
    ${expense ? `<label class="form-field">사진 또는 영수증<input name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" ${editing ? "" : "required"}><small>${editing ? (record.attachment ? `현재 첨부: ${escapeHTML(record.attachment.name)}. 새 파일을 선택하지 않으면 기존 증빙을 유지합니다. ` : "현재 첨부 파일이 없습니다. 파일을 첨부할 수 있어요. ") : ""}JPG, PNG, WebP 또는 PDF · 최대 2MB · 이 브라우저에만 저장됩니다. 개인정보가 없는 샘플 파일을 사용해 주세요.</small></label>` : ""}
    ${expense && record?.attachment ? '<label class="checkbox-field"><input type="checkbox" name="removeAttachment">기존 첨부 삭제 (새 파일 선택 시 새 파일로 교체)</label>' : ""}
    <p id="form-error" class="form-error" role="alert"></p><button class="button form-submit" type="submit">${editing ? "수정 저장" : (expense ? "사용 내역 등록" : "기부 기록 저장")}</button></form>`);
}
function showProof(id) {
  const e = state.expenses.find(item => item.id === id);
  if (!e) return;
  const a = e.attachment;
  const safeAttachment = a && validAttachment(a);
  openDialog("기부금 사용 증빙", `<div class="receipt"><p class="receipt-title">등록된 사용 내역서</p><p class="card-note" style="text-align:center">${org(e.orgId).name}</p><p class="proof-status">${a ? "증빙 첨부 · 미검증" : "첨부 없음 · 미검증"}</p><dl><div><dt>사용일</dt><dd>${e.date}</dd></div><div><dt>활동 지역</dt><dd>${org(e.orgId).region}</dd></div><div><dt>사용 내용</dt><dd>${escapeHTML(e.title)}</dd></div><div><dt>지원 항목</dt><dd>${escapeHTML(e.category)}</dd></div><div><dt>내 기부금 사용액</dt><dd><strong>${money(e.amount)}원</strong></dd></div></dl></div>${safeAttachment ? '<div id="proof-preview"></div>' : ""}<p class="proof-disclaimer">${a ? "등록자가 첨부한 자료입니다. 앱에서 증빙의 진위나 실제 기부금 사용 여부를 검증하지 않습니다." : "첨부 증빙이 없는 등록 내역입니다. 기본 예시 내역에는 실제 영수증이나 현장 사진이 포함되지 않습니다."}</p>`);
  if (safeAttachment) {
    const bytes = Uint8Array.from(atob(a.data.split(",")[1]), char => char.charCodeAt(0));
    proofUrl = URL.createObjectURL(new Blob([bytes], {type:a.type}));
    document.querySelector("#proof-preview").innerHTML = a.type === "application/pdf"
      ? `<div class="pdf-toolbar"><button class="button secondary small" data-pdf-page="-1" disabled>이전 페이지</button><span id="pdf-page-label" role="status">PDF를 불러오는 중이에요.</span><button class="button secondary small" data-pdf-page="1" disabled>다음 페이지</button></div><canvas id="pdf-canvas" aria-label="${escapeHTML(a.name)} PDF 미리보기"></canvas><p id="pdf-error" class="form-error" role="alert"></p>`
      : `<img class="proof-image" src="${proofUrl}" alt="${escapeHTML(a.name)}">`;
    document.querySelector("#proof-preview").innerHTML += `<a class="attachment-link" href="${proofUrl}" download="${escapeHTML(a.name)}">첨부 증빙 다운로드 · ${escapeHTML(a.name)}</a>`;
    if (a.type === "application/pdf") loadPdf(bytes);
  }
}
function clearProof() {
  pdfViewToken++;
  if (pdfTask) { pdfTask.destroy().catch(() => {}); pdfTask = null; }
  pdfDocument = null;
  pdfRendering = false;
  if (proofUrl) { URL.revokeObjectURL(proofUrl); proofUrl = null; }
}
function ensurePdfLibrary() {
  if (!pdfLibrary) {
    const loadScript = src => new Promise((resolve,reject) => {
      const script = document.createElement("script");
      script.src = src; script.onload = resolve;
      script.onerror = () => { script.remove(); reject(new Error("PDF 뷰어를 불러오지 못했어요.")); };
      document.head.appendChild(script);
    });
    pdfLibrary = loadScript("vendor/pdfjs/pdf.worker.min.js").then(() => loadScript("vendor/pdfjs/pdf.min.js")).catch(error => { pdfLibrary = null; throw error; });
  }
  return pdfLibrary;
}
async function loadPdf(bytes) {
  const token = pdfViewToken;
  try {
    await ensurePdfLibrary();
    if (token !== pdfViewToken) return;
    pdfTask = pdfjsLib.getDocument({data:bytes, isEvalSupported:false, useSystemFonts:true, disableWorkerRendering:true});
    const loaded = await pdfTask.promise;
    if (token !== pdfViewToken) return;
    pdfDocument = loaded;
    pdfPageNumber = 1;
    await renderPdfPage(0);
  } catch (error) {
    if (token !== pdfViewToken) return;
    document.querySelector("#pdf-page-label").textContent = "미리보기를 표시하지 못했어요.";
    document.querySelector("#pdf-error").textContent = error.name === "PasswordException" ? "암호가 있는 PDF입니다. 다운로드해 열어 주세요." : "PDF를 읽지 못했어요. 아래 파일을 다운로드해 확인해 주세요.";
  }
}
async function renderPdfPage(direction) {
  if (!pdfDocument || pdfRendering) return;
  pdfRendering = true;
  const token = pdfViewToken;
  const buttons = [...document.querySelectorAll("[data-pdf-page]")];
  buttons.forEach(button => {button.disabled=true;});
  try {
    pdfPageNumber = Math.max(1,Math.min(pdfDocument.numPages,pdfPageNumber+direction));
    const page = await pdfDocument.getPage(pdfPageNumber);
    if (token !== pdfViewToken) return;
    const canvas = document.querySelector("#pdf-canvas");
    const base = page.getViewport({scale:1});
    const scale = Math.min(2, 1200/base.width, 1800/base.height);
    const viewport = page.getViewport({scale});
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext("2d"),viewport}).promise;
    if (token !== pdfViewToken) return;
    canvas.setAttribute("aria-label", `PDF 미리보기 ${pdfPageNumber} / ${pdfDocument.numPages} 페이지`);
    document.querySelector("#pdf-page-label").textContent = `${pdfPageNumber} / ${pdfDocument.numPages} 페이지`;
    document.querySelector("#pdf-error").textContent = "";
  } catch {
    if (token === pdfViewToken) document.querySelector("#pdf-error").textContent = "페이지를 그리지 못했어요. 파일을 다운로드해 확인해 주세요.";
  } finally {
    if (token === pdfViewToken) {
      pdfRendering = false;
      buttons.forEach(button => {button.disabled = Number(button.dataset.pdfPage)<0 ? pdfPageNumber<=1 : pdfPageNumber>=pdfDocument.numPages;});
    }
  }
}
const validDate = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
function validAttachment(a) {
  return a && typeof a.name === "string" && a.name.length <= 255 && ["image/jpeg","image/png","image/webp","application/pdf"].includes(a.type)
    && typeof a.data === "string" && a.data.startsWith(`data:${a.type};base64,`)
    && /^data:[^;]+;base64,(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(a.data)
    && a.data.split(",")[1].length > 0 && a.data.split(",")[1].length <= Math.ceil(2 * 1024 * 1024 / 3) * 4;
}
function validateData(input) {
  if (!input || ![input.donations,input.expenses,input.notifications].every(Array.isArray)) throw new Error("기록 형식이 올바르지 않아요.");
  const idOK = value => typeof value === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(value);
  const textOK = (value, max) => typeof value === "string" && value.length > 0 && value.length <= max;
  const data = {donations:[], expenses:[], notifications:[]};
  for (const collection of Object.keys(data)) {
    const ids = new Set();
    for (const item of input[collection]) {
      if (!item || !idOK(item.id) || ids.has(item.id) || !validDate(item.date)) throw new Error("기록 ID 또는 날짜가 올바르지 않아요.");
      ids.add(item.id);
      if (collection === "notifications") {
        if (!textOK(item.title,200) || !textOK(item.text,2000) || typeof item.read !== "boolean" || !input.expenses.some(e => e?.id === item.expenseId)) throw new Error("알림의 내용이나 연결된 사용 내역이 올바르지 않아요.");
        data.notifications.push({id:item.id,title:item.title,text:item.text,date:item.date,read:item.read,expenseId:item.expenseId});
      } else {
        if (!org(item.orgId) || !Number.isSafeInteger(item.amount) || item.amount < 1 || item.amount > 1000000000 || item.date > today()) throw new Error("기부처·금액·날짜를 확인해 주세요.");
        const record = {id:item.id,orgId:item.orgId,amount:item.amount,date:item.date};
        if (collection === "expenses") {
          if (!textOK(item.title,80) || !["식사 지원","교육 지원","운영 지원"].includes(item.category) || (item.attachment != null && !validAttachment(item.attachment))) throw new Error("사용 내역이나 첨부 파일 형식이 올바르지 않아요.");
          Object.assign(record,{title:item.title,category:item.category,attachment:item.attachment || null});
        }
        data[collection].push(record);
      }
    }
  }
  const problem = balanceError(data, organizations.map(item => item.id));
  if (problem) throw new Error(problem);
  return data;
}
function exportBackup() {
  try { syncStorage(localStorage.getItem(STORAGE_KEY)); }
  catch { toast("현재 저장 데이터를 읽지 못해 백업하지 못했어요."); return; }
  const blob = new Blob([JSON.stringify({app:"ongi",version:1,exportedAt:new Date().toISOString(),data:state},null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `ongi-backup-${today()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("기록·첨부 증빙·알림을 백업 파일로 내보냈어요.");
}
function openImport() {
  pendingImport = null;
  openDialog("백업 복원", `<form id="import-form"><p class="form-note">온기에서 내보낸 JSON 백업을 선택해 주세요. 내용을 확인한 뒤 현재 기록을 교체합니다. 첨부 증빙과 알림도 함께 복원되며 직전 변경은 실행 취소할 수 있어요.</p><label class="form-field">백업 파일<input name="backup" type="file" accept=".json,application/json" required><small>최대 20MB · 온기 백업 파일</small></label><p id="import-error" class="form-error" role="alert"></p><button class="button" type="submit">백업 내용 확인</button></form>`);
}
async function inspectBackup(event) {
  if (event.target.id !== "import-form") return;
  event.preventDefault();
  const form = event.target, version = dialogVersion, file = new FormData(form).get("backup");
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    if (!file?.size || file.size > 20 * 1024 * 1024) throw new Error("20MB 이하의 백업 파일을 선택해 주세요.");
    const envelope = JSON.parse(await file.text());
    if (!form.isConnected || !dialog.open) return;
    if (version !== stateVersion) throw new Error("다른 작업에서 기록이 바뀌었어요. 복원 창을 다시 열어 주세요.");
    if (envelope.app !== "ongi" || envelope.version !== 1) throw new Error("지원하는 온기 백업 파일이 아니에요.");
    const data = validateData(envelope.data);
    openDialog("백업 복원 내용 확인", `<p>기부 기록 <strong>${data.donations.length}건</strong>, 사용 내역 <strong>${data.expenses.length}건</strong>, 첨부 <strong>${data.expenses.filter(e=>e.attachment).length}개</strong>, 알림 <strong>${data.notifications.length}건</strong></p><p class="form-note">현재 기록 전체를 이 백업으로 교체합니다. 복원 후 실행 취소할 수 있어요.</p><p id="import-error" class="form-error" role="alert"></p><div class="dialog-actions"><button class="button secondary" data-action="cancel-dialog">취소</button><button class="button" data-action="restore-backup">이 백업으로 복원</button></div>`);
    pendingImport = data;
  } catch (error) { if (form.isConnected) form.querySelector("#import-error").textContent = error instanceof SyntaxError ? "JSON 파일을 읽지 못했어요. 온기에서 내보낸 파일을 선택해 주세요." : error.message; }
  finally { button.disabled = false; }
}
async function restoreBackup() {
  if (!pendingImport) return;
  if (dialogVersion !== stateVersion) { document.querySelector("#import-error").textContent = "다른 탭의 변경이 있어요. 백업을 다시 선택해 주세요."; return; }
  if (await saveMutation(structuredClone(pendingImport), "백업의 기록과 증빙, 알림을 복원했어요.")) pendingImport = null;
  else document.querySelector("#import-error").textContent = "복원하지 못했어요. 저장 공간 또는 다른 탭의 변경을 확인해 주세요.";
}
async function submitRecord(event) {
  if (event.target.id !== "record-form") return;
  event.preventDefault();
  const form = event.target, data = new FormData(form), expense = form.dataset.type === "expense";
  const collection = expense ? "expenses" : "donations", editId = form.dataset.id;
  const formVersion = Number(form.dataset.version);
  const existing = editId ? state[collection].find(item => item.id === editId) : null;
  const error = message => { form.querySelector("#form-error").textContent = message; };
  if (formVersion !== stateVersion) return error("다른 작업에서 기록이 바뀌었어요. 입력창을 닫고 다시 열어 주세요.");
  if (editId && !existing) return error("수정할 기록을 찾지 못했어요. 다시 열어 주세요.");
  const amount = Number(data.get("amount")), orgId = data.get("orgId"), date = data.get("date");
  if (!org(orgId) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000000) return error("금액은 1원부터 10억 원까지 정수로 입력해 주세요.");
  if (!validDate(date) || date > today()) return error("오늘까지의 올바른 날짜를 선택해 주세요.");
  if (expense && !String(data.get("title")).trim()) return error("사용 내용을 입력해 주세요.");
  if (expense && !["식사 지원", "교육 지원", "운영 지원"].includes(data.get("category"))) return error("지원 항목을 선택해 주세요.");
  const submit = form.querySelector("[type=submit]");
  submit.disabled = true;
  try {
    let attachment = data.get("removeAttachment") ? null : (existing?.attachment || null);
    if (expense) {
      const file = data.get("attachment");
      if (file?.size) {
        if (file.size > 2 * 1024 * 1024 || !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(file.type)) { error("2MB 이하의 JPG, PNG, WebP 또는 PDF 파일을 선택해 주세요."); return; }
        const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
        if (!form.isConnected || !dialog.open) return;
        attachment = { name: file.name, type: file.type, data: content };
      } else if (!existing) return error("사진 또는 영수증을 선택해 주세요.");
    }
    if (formVersion !== stateVersion) return error("파일을 읽는 동안 기록이 바뀌었어요. 입력창을 다시 열어 주세요.");
    const next = structuredClone(state), id = existing?.id || uid();
    const record = { id, orgId, amount, date, ...(expense ? { title: String(data.get("title")).trim(), category: data.get("category"), attachment } : {}) };
    if (existing) next[collection] = next[collection].map(item => item.id === id ? record : item);
    else next[collection].unshift(record);
    const problem = balanceError(next, [orgId, ...(existing ? [existing.orgId] : [])]);
    if (problem) return error(problem);
    if (expense) {
      const linked = next.notifications.find(item => item.expenseId === id);
      next.notifications = next.notifications.filter(item => item.expenseId !== id);
      next.notifications.unshift({ id: linked?.id || uid(), title: existing ? "기부금 사용 내역이 수정됐어요" : "새로운 기부금 사용 내역이 등록됐어요", text: `${org(orgId).name}의 ${money(amount)}원 사용 내역이 ${existing ? "수정" : "등록"}됐어요. ${attachment ? "첨부 증빙은 미검증 상태입니다." : "첨부 증빙은 없습니다."}`, date: today(), read: false, expenseId: id });
    }
    if (!await saveMutation(next, `${expense ? "사용 내역" : "기부 기록"}을 ${existing ? "수정" : "저장"}했어요.`)) error("저장하지 못했어요. 브라우저 저장 설정과 남은 공간을 확인해 주세요.");
  } catch { error("파일을 읽거나 저장하지 못했어요. 다시 시도해 주세요."); }
  finally { submit.disabled = false; }
}
function requestDelete(type, id) {
  const record = state[type === "expense" ? "expenses" : "donations"].find(item => item.id === id);
  if (!record) return;
  openDialog("기록 삭제", `<p>${escapeHTML(org(record.orgId).name)} · ${record.date} · <strong>${money(record.amount)}원</strong></p><p class="form-note">${type === "expense" ? "사용 내역과 첨부 증빙, 연결된 알림을 함께 삭제합니다." : "이 기부금을 삭제하면 날짜별 잔액을 다시 확인합니다. 이미 등록된 사용 내역에 필요한 기부금은 삭제할 수 없습니다."} 삭제 후 직전 변경을 실행 취소할 수 있어요.</p><p id="delete-error" role="alert" class="form-error"></p><div class="dialog-actions"><button class="button secondary" data-action="cancel-dialog">취소</button><button class="button delete-button" data-confirm-delete="${escapeHTML(id)}" data-type="${type}">삭제</button></div>`);
}
async function deleteRecord(type, id) {
  if (dialogVersion !== stateVersion) { document.querySelector("#delete-error").textContent = "다른 작업에서 기록이 바뀌었어요. 삭제 창을 다시 열어 주세요."; return; }
  const collection = type === "expense" ? "expenses" : "donations";
  const record = state[collection].find(item => item.id === id);
  if (!record) return;
  const next = structuredClone(state);
  next[collection] = next[collection].filter(item => item.id !== id);
  const problem = balanceError(next, [record.orgId]);
  if (problem) { document.querySelector("#delete-error").textContent = problem; return; }
  if (type === "expense") next.notifications = next.notifications.filter(item => item.expenseId !== id);
  if (!await saveMutation(next, `${type === "expense" ? "사용 내역과 연결된 알림" : "기부 기록"}을 삭제했어요.`)) document.querySelector("#delete-error").textContent = "삭제를 저장하지 못했어요. 브라우저 저장 설정과 남은 공간을 확인해 주세요.";
}
function filterExpenses() {
  if (currentView !== "history") return;
  const search = document.querySelector("#search").value.trim().toLowerCase(), orgId = document.querySelector("#org-filter").value, category = document.querySelector("#category-filter").value;
  const items = sortedExpenses().filter(e => (!orgId || e.orgId === orgId) && (!category || e.category === category) && `${e.title} ${org(e.orgId).name}`.toLowerCase().includes(search));
  document.querySelector("#expense-list").innerHTML = items.map(expenseRow).join("") || '<p class="empty">조건에 맞는 사용 내역이 없어요.</p>';
}
document.addEventListener("click", async event => {
  const target = event.target.closest("button,[data-donate-org]");
  if (!target) return;
  if (target.dataset.edit) {
    const type = target.dataset.type;
    const record = state[type === "expense" ? "expenses" : "donations"].find(item => item.id === target.dataset.edit);
    if (record) openForm(type, record.orgId, record);
  }
  if (target.dataset.delete) requestDelete(target.dataset.type, target.dataset.delete);
  if (target.dataset.confirmDelete) await deleteRecord(target.dataset.type, target.dataset.confirmDelete);
  if (target.dataset.action === "cancel-dialog") dialog.close();
  if (target.dataset.pdfPage) await renderPdfPage(Number(target.dataset.pdfPage));
  if (target.dataset.action === "export-backup") exportBackup();
  if (target.dataset.action === "import-backup") openImport();
  if (target.dataset.action === "restore-backup") await restoreBackup();
  if (target.dataset.action === "undo") await undoMutation();
  if (target.dataset.proof) showProof(target.dataset.proof);
  if (target.dataset.donateOrg) openForm("donation", target.dataset.donateOrg);
  if (target.dataset.action === "donate") openForm("donation");
  if (target.dataset.action === "expense") openForm("expense");
  if (target.dataset.action === "read-all") {
    const next = structuredClone(state); next.notifications.forEach(n => { n.read = true; });
    if (await commit(next)) { render(); toast("모든 알림을 읽음으로 표시했어요."); }
  }
  if (target.dataset.notification) {
    const next = structuredClone(state), notification = next.notifications.find(n => n.id === target.dataset.notification);
    if (notification) { notification.read = true; if (await commit(next)) render(); showProof(notification.expenseId); }
  }
});
document.addEventListener("input", event => { if (["search", "org-filter", "category-filter"].includes(event.target.id)) filterExpenses(); });
document.addEventListener("change", event => { if (["org-filter", "category-filter"].includes(event.target.id)) filterExpenses(); });
document.addEventListener("submit", submitRecord);
document.addEventListener("submit", inspectBackup);
window.addEventListener("storage", event => { if (event.key === STORAGE_KEY || event.key === null) syncStorage(localStorage.getItem(STORAGE_KEY)); });
window.addEventListener("focus", () => { try { syncStorage(localStorage.getItem(STORAGE_KEY)); } catch {} });
dialog.addEventListener("close", () => { clearProof(); pendingImport = null; });
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#notification-button").addEventListener("click", () => { location.hash = "notifications"; });
window.addEventListener("hashchange", render);
document.querySelectorAll("[data-icon]").forEach(el => { el.innerHTML = icon(el.dataset.icon); });
render();
if (!storageAvailable) toast("저장된 데이터를 불러오지 못해 예시 데이터로 표시합니다. 브라우저 저장 설정을 확인해 주세요.");
