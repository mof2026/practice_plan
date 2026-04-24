(() => {
const {
  MAX_CURVES,
  MAX_PRACTICE_ROWS_PER_CURVE,
  MIN_DAY_COUNT,
  MAX_COLS,
  candidateById,
  backupFileName,
  buildBackupPayload,
  clampDayCount,
  clearStorageErrors,
  consumeStorageErrors,
  curveLabel,
  ensurePracticesShape,
  escapeHtml,
  filteredCandidates,
  formatCreatedDateLabel,
  formatDateTimeJP,
  loadMemoLog,
  loadRecentCandidateIds,
  loadState,
  parseBackupPayload,
  pushRecentCandidate,
  saveMemoLog,
  saveRecentCandidateIds,
  saveState,
  todayLocalISO,
  addMemoLogEntry,
  removeMemoLogEntry,
} = window.PianoPracticeShared;

const createdEl = document.getElementById("created-date");
const startEl = document.getElementById("start-date");
const dayEl = document.getElementById("day-count");
const curve0 = document.getElementById("curve-0");
const curve1 = document.getElementById("curve-1");
const extraWrap = document.getElementById("extra-curves");
const addCurveBtn = document.getElementById("add-curve-btn");
const dayShortcutBtns = document.querySelectorAll(".day-shortcuts button");
const printLink = document.getElementById("open-print-btn");
const backupExportBtn = document.getElementById("backup-export-btn");
const backupImportBtn = document.getElementById("backup-import-btn");
const backupImportFile = document.getElementById("backup-import-file");
const stickyStatusEl = document.getElementById("sticky-status");
const editorShell = document.querySelector(".shell");
const createdDateDisplayEl = document.getElementById("created-date-display");
const candidateSheet = document.getElementById("candidate-sheet");
const candidateSheetPanel = candidateSheet?.querySelector(".candidate-sheet-panel");
const candidateSheetCloseBtn = document.getElementById("candidate-sheet-close");
const candidateSheetSub = document.getElementById("candidate-sheet-sub");
const candidateSearchInput = document.getElementById("candidate-search-input");
const candidateRecentList = document.getElementById("candidate-recent-list");
const candidateMasterList = document.getElementById("candidate-master-list");
const candidateRecentGroup = document.getElementById("candidate-group-recent");
const practiceAccordionList = document.getElementById("practice-accordion-list");
const memoHistoryBtn = document.getElementById("memo-history-btn");
const memoHistorySheet = document.getElementById("memo-history-sheet");
const memoHistoryPanel = memoHistorySheet?.querySelector(".memo-history-panel");
const memoHistoryCloseBtn = document.getElementById("memo-history-close");
const memoHistorySaveBtn = document.getElementById("memo-history-save");
const memoHistoryListEl = document.getElementById("memo-history-list");

let state = ensurePracticesShape(loadState());
let stickyStatusTimer = 0;
let persistDebounceTimer = 0;
let activeDialog = null;
let activeDialogPanel = null;
let dialogReturnFocus = null;
let dragState = null;
const candidateUiState = { curveIndex: null };

init();

function init() {
  initDayCountOptions();
  resetDatesForToday();
  bindEvents();
  render();
}

function resetDatesForToday() {
  const today = todayLocalISO();
  state.createdDate = today;
  state.startDate = today;
  persistStateOnly({ report: false });
}

function initDayCountOptions() {
  if (!dayEl || dayEl.tagName !== "SELECT" || dayEl.options.length > 0) return;
  for (let value = MIN_DAY_COUNT; value <= MAX_COLS; value += 1) {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = String(value);
    dayEl.appendChild(option);
  }
}

function bindEvents() {
  createdEl?.addEventListener("change", () => {
    if (!startEl.value) startEl.value = createdEl.value;
    collectStateFromInputs();
    persistAndRender();
  });

  startEl?.addEventListener("change", () => {
    collectStateFromInputs();
    persistAndRender();
  });

  dayEl?.addEventListener("change", () => {
    dayEl.value = String(clampDayCount(dayEl.value));
    collectStateFromInputs();
    persistAndRender();
  });

  dayShortcutBtns.forEach((button) => {
    button.addEventListener("click", () => {
      dayEl.value = button.dataset.day || String(MAX_COLS);
      collectStateFromInputs();
      persistAndRender();
    });
  });

  [curve0, curve1].forEach((input) => {
    input?.addEventListener("input", handleCurveInput);
    input?.addEventListener("change", handleCurveInput);
  });

  extraWrap?.addEventListener("input", handleCurveInput);
  extraWrap?.addEventListener("change", handleCurveInput);
  extraWrap?.addEventListener("click", handleExtraCurveClick);

  editorShell?.addEventListener("input", handleEditorInput);
  editorShell?.addEventListener("change", handleEditorInput);
  editorShell?.addEventListener("click", handleEditorClick);
  editorShell?.addEventListener("pointerdown", handlePracticeDragStart);

  addCurveBtn?.addEventListener("click", handleAddCurve);
  candidateSheetCloseBtn?.addEventListener("click", closeCandidatePicker);
  candidateSheet?.addEventListener("click", handleCandidateSheetClick);
  candidateSearchInput?.addEventListener("input", renderCandidatePicker);
  memoHistoryBtn?.addEventListener("click", openMemoHistory);
  memoHistoryCloseBtn?.addEventListener("click", closeMemoHistory);
  memoHistorySheet?.addEventListener("click", handleMemoHistoryOverlayClick);
  memoHistorySaveBtn?.addEventListener("click", handleMemoHistorySave);
  memoHistoryListEl?.addEventListener("click", handleMemoHistoryListClick);

  backupExportBtn?.addEventListener("click", exportBackupJson);
  backupImportBtn?.addEventListener("click", () => backupImportFile?.click());
  backupImportFile?.addEventListener("change", handleBackupFileSelected);
  printLink?.addEventListener("click", handleOpenPrintPage);

  document.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("pointermove", handlePracticeDragMove, { passive: false });
  window.addEventListener("pointerup", handlePracticeDragEnd);
  window.addEventListener("pointercancel", handlePracticeDragEnd);
  window.addEventListener("beforeunload", flushPersist);
  window.addEventListener("beforeprint", flushPersist);
}

function handleOpenPrintPage(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  flushPersist();
  collectStateFromInputs();
  const { ok } = persistStateOnly({ report: false });
  if (!ok) {
    setStickyStatus("保存できないため印刷できませんでした");
    return false;
  }
  if (typeof window.print === "function") window.print();
  return false;
}

function handleCurveInput() {
  collectStateFromInputs();
  persistStateOnly();
  renderAddCurveButton();
  renderPracticeAccordions();
  renderCandidatePicker();
  if (!memoHistorySheet?.hidden) renderMemoHistory();
}

function handleExtraCurveClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const button = target?.closest("[data-delete-curve-index]");
  if (!button) return;

  const curveIndex = Number(button.getAttribute("data-delete-curve-index") || NaN);
  if (!Number.isInteger(curveIndex) || curveIndex < 2) return;

  collectStateFromInputs();
  state.curves.splice(curveIndex, 1);
  state.practices.splice(curveIndex, 1);
  state.curveMemos.splice(curveIndex, 1);
  state.collapsedCurveIndices = state.collapsedCurveIndices
    .filter((index) => index !== curveIndex)
    .map((index) => (index > curveIndex ? index - 1 : index));
  persistAndRender();
}

function handleEditorInput(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;
  if (
    target.closest(".practice-mini")
    || target.classList.contains("curve-memo-input")
    || target.classList.contains("accordion-title-input")
  ) {
    if (target.classList.contains("accordion-title-input")) syncAccordionTitleHeights();
    collectStateFromInputs();
    schedulePersist();
  }
}

function handleEditorClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : event.target?.parentElement;
  if (!target) return;

  if (dispatchDeleteCurve(target, event)) return;
  if (dispatchAccordionToggle(target, event)) return;
  if (dispatchRowAction(target, event)) return;
  if (dispatchAddMode(target, event)) return;
  dispatchClearCurve(target, event);
}

function dispatchAccordionToggle(target, event) {
  const head = target.closest(".accordion-head");
  if (!head || target.closest("button, a, input, select, textarea, label")) return false;

  const accordion = head.closest(".accordion-item[data-curve-index]");
  const curveIndex = Number(accordion?.dataset.curveIndex || NaN);
  if (!Number.isInteger(curveIndex) || curveIndex < 0) return true;

  event.preventDefault();
  toggleAccordion(curveIndex);
  return true;
}

function dispatchRowAction(target, event) {
  const button = target.closest("[data-row-action]");
  if (!button) return false;

  const row = button.closest(".practice-mini");
  const accordion = button.closest(".accordion-item[data-curve-index]");
  const curveIndex = Number(accordion?.dataset.curveIndex || NaN);
  const rowIndex = Number(row?.dataset.practiceIndex || NaN);
  const action = button.getAttribute("data-row-action") || "";
  if (!Number.isInteger(curveIndex) || !Number.isInteger(rowIndex) || !action) return true;

  event.preventDefault();
  handleRowAction(curveIndex, rowIndex, action);
  return true;
}

function handlePracticeDragStart(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const handle = target?.closest("[data-drag-handle]");
  if (!handle) return;

  const row = handle.closest(".practice-mini[data-curve-index]");
  const list = row?.closest(".practice-list");
  const curveIndex = Number(row?.getAttribute("data-curve-index") || NaN);
  if (!(row instanceof HTMLElement) || !(list instanceof HTMLElement) || !Number.isInteger(curveIndex)) return;

  dragState = {
    pointerId: event.pointerId,
    handleEl: handle,
    rowEl: row,
    listEl: list,
    curveIndex,
    moved: false,
  };

  row.classList.add("is-dragging");
  document.body.classList.add("is-row-dragging");
  handle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function handlePracticeDragMove(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const { rowEl, listEl, curveIndex } = dragState;
  const hit = document.elementFromPoint(event.clientX, event.clientY);
  const targetRow = hit instanceof HTMLElement
    ? hit.closest(`.practice-mini[data-curve-index="${curveIndex}"]`)
    : null;
  if (!(targetRow instanceof HTMLElement) || targetRow === rowEl || targetRow.parentElement !== listEl) {
    event.preventDefault();
    return;
  }

  const rect = targetRow.getBoundingClientRect();
  const placeBefore = event.clientY < rect.top + rect.height / 2;
  if (placeBefore) listEl.insertBefore(rowEl, targetRow);
  else listEl.insertBefore(rowEl, targetRow.nextElementSibling);
  refreshPracticeRowIndices(listEl);
  dragState.moved = true;
  event.preventDefault();
}

function handlePracticeDragEnd(event) {
  if (!dragState || dragState.pointerId !== event.pointerId) return;

  const { rowEl, listEl, curveIndex, moved } = dragState;
  rowEl.classList.remove("is-dragging");
  document.body.classList.remove("is-row-dragging");
  dragState = null;

  if (!moved) return;

  refreshPracticeRowIndices(listEl);
  const rowIndex = Array.from(listEl.querySelectorAll(".practice-mini[data-curve-index]")).indexOf(rowEl);
  collectStateFromInputs();
  persistAndRender();
  focusPracticeTitle(curveIndex, Math.max(0, rowIndex));
}

function dispatchDeleteCurve(target, event) {
  const button = target.closest("[data-delete-curve-index]");
  if (!button) return false;

  const curveIndex = Number(button.getAttribute("data-delete-curve-index") || NaN);
  if (!Number.isInteger(curveIndex) || curveIndex < 2) return true;

  event.preventDefault();
  collectStateFromInputs();
  state.curves.splice(curveIndex, 1);
  state.practices.splice(curveIndex, 1);
  state.curveMemos.splice(curveIndex, 1);
  state.collapsedCurveIndices = state.collapsedCurveIndices
    .filter((index) => index !== curveIndex)
    .map((index) => (index > curveIndex ? index - 1 : index));
  persistAndRender();
  return true;
}

function dispatchAddMode(target, event) {
  const button = target.closest("[data-add-mode]");
  if (!button) return false;

  const accordion = button.closest(".accordion-item[data-curve-index]");
  const curveIndex = Number(accordion?.dataset.curveIndex || NaN);
  const mode = button.getAttribute("data-add-mode") || "";
  if (!Number.isInteger(curveIndex) || curveIndex < 0) return true;

  event.preventDefault();
  if (mode === "candidate") {
    openCandidatePicker(curveIndex, button);
    return true;
  }

  if (mode === "new") {
    collectStateFromInputs();
    if (state.practices[curveIndex].length >= MAX_PRACTICE_ROWS_PER_CURVE) {
      setStickyStatus("1曲あたり60行までです");
      return true;
    }
    state.practices[curveIndex].push(["新しい練習", ""]);
    persistAndRender();
    focusPracticeTitle(curveIndex, state.practices[curveIndex].length - 1);
    return true;
  }

  return false;
}

function dispatchClearCurve(target, event) {
  const button = target.closest("[data-clear-curve-slot]");
  if (!button) return false;

  const slot = Number(button.getAttribute("data-clear-curve-slot") || NaN);
  if (!Number.isInteger(slot) || slot < 0 || slot > 1) return true;

  event.preventDefault();
  collectStateFromInputs();
  state.curves[slot] = "";
  state.curveMemos[slot] = "";
  state.practices[slot] = [["", ""]];
  state.collapsedCurveIndices = state.collapsedCurveIndices.filter((index) => index !== slot);
  persistAndRender();
  focusCurveInput(slot);
  return true;
}

function handleRowAction(curveIndex, rowIndex, action) {
  collectStateFromInputs();
  const rows = state.practices[curveIndex];
  if (!Array.isArray(rows) || !Array.isArray(rows[rowIndex])) return;

  if (action === "up" && rowIndex > 0) {
    [rows[rowIndex - 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex - 1]];
  }
  if (action === "down" && rowIndex < rows.length - 1) {
    [rows[rowIndex + 1], rows[rowIndex]] = [rows[rowIndex], rows[rowIndex + 1]];
  }
  if (action === "duplicate") {
    if (rows.length >= MAX_PRACTICE_ROWS_PER_CURVE) {
      setStickyStatus("1曲あたり60行までです");
      return;
    }
    const [title, desc] = rows[rowIndex];
    rows.splice(rowIndex + 1, 0, [String(title || ""), String(desc || "")]);
  }
  if (action === "delete") {
    rows.splice(rowIndex, 1);
    if (!rows.length) rows.push(["新しい練習", ""]);
  }

  persistAndRender();
  const nextIndex = action === "duplicate"
    ? rowIndex + 1
    : Math.max(0, Math.min(rowIndex, state.practices[curveIndex].length - 1));
  focusPracticeTitle(curveIndex, nextIndex);
}

function toggleAccordion(curveIndex) {
  collectStateFromInputs();
  const set = new Set(state.collapsedCurveIndices || []);
  if (set.has(curveIndex)) set.delete(curveIndex);
  else set.add(curveIndex);
  state.collapsedCurveIndices = Array.from(set).sort((a, b) => a - b);
  persistAndRender();
}

function handleAddCurve() {
  collectStateFromInputs();
  const reusableSlot = findReusableCurveSlot(state.curves);
  if (reusableSlot >= 0) {
    persistAndRender();
    focusCurveInput(reusableSlot);
    return;
  }

  if (state.curves.length >= MAX_CURVES) {
    setStickyStatus("5曲までです");
    return;
  }

  state.curves.push("");
  state.practices.push([["新しい練習", ""]]);
  state.curveMemos.push("");
  persistAndRender();
  focusCurveInput(state.curves.length - 1);
}

function handleCandidateSheetClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target) return;

  if (target === candidateSheet) {
    closeCandidatePicker();
    return;
  }

  const button = target.closest("[data-candidate-id]");
  if (!button) return;

  const curveIndex = Number(candidateUiState.curveIndex);
  const candidate = candidateById.get(button.getAttribute("data-candidate-id") || "");
  if (!Number.isInteger(curveIndex) || curveIndex < 0 || !candidate) return;

  collectStateFromInputs();
  if (state.practices[curveIndex].length >= MAX_PRACTICE_ROWS_PER_CURVE) {
    setStickyStatus("1曲あたり60行までです");
    return;
  }

  clearStorageErrors();
  state.practices[curveIndex].push([candidate.title, candidate.desc || ""]);
  pushRecentCandidate(candidate.id);
  state = saveState(state);
  const errors = consumeStorageErrors();

  render();
  closeCandidatePicker();
  if (errors.length) setStickyStatus("保存できませんでした（ブラウザの保存領域を確認）");
  focusPracticeTitle(curveIndex, state.practices[curveIndex].length - 1);
}

function openCandidatePicker(curveIndex, triggerEl) {
  candidateUiState.curveIndex = curveIndex;
  if (candidateSearchInput) candidateSearchInput.value = "";
  renderCandidatePicker();
  openDialog(candidateSheet, candidateSheetPanel, triggerEl || document.activeElement, candidateSearchInput);
}

function closeCandidatePicker() {
  closeDialog(candidateSheet);
  candidateUiState.curveIndex = null;
  if (candidateSearchInput) candidateSearchInput.value = "";
}

function openMemoHistory() {
  renderMemoHistory();
  openDialog(memoHistorySheet, memoHistoryPanel, memoHistoryBtn, memoHistorySaveBtn);
}

function closeMemoHistory() {
  closeDialog(memoHistorySheet);
}

function handleMemoHistoryOverlayClick(event) {
  if (event.target === memoHistorySheet) closeMemoHistory();
}

function handleMemoHistorySave() {
  collectStateFromInputs();
  clearStorageErrors();
  const { added } = addMemoLogEntry(state);
  const errors = consumeStorageErrors();
  renderMemoHistory();

  if (errors.length) {
    setStickyStatus("履歴を保存できませんでした");
    return;
  }

  if (!added) {
    setStickyStatus("保存するメモがありません");
    return;
  }

  setStickyStatus("履歴に残しました");
}

function handleMemoHistoryListClick(event) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const button = target?.closest("[data-memo-log-delete]");
  if (!button) return;

  const id = button.getAttribute("data-memo-log-delete") || "";
  if (!id) return;

  clearStorageErrors();
  removeMemoLogEntry(id);
  const errors = consumeStorageErrors();
  renderMemoHistory();
  if (errors.length) setStickyStatus("履歴を削除できませんでした");
}

async function handleBackupFileSelected(event) {
  const file = event.target instanceof HTMLInputElement ? event.target.files?.[0] : null;
  if (!file) return;

  try {
    const text = await file.text();
    const parsed = parseBackupPayload(JSON.parse(text));
    if (!parsed) {
      setStickyStatus("復元できないJSONです");
      return;
    }

    const confirmed = window.confirm("現在の内容を上書きして復元します。続けますか？");
    if (!confirmed) return;

    clearStorageErrors();
    state = saveState(parsed.state);
    saveRecentCandidateIds(parsed.recentCandidateIds);
    saveMemoLog(parsed.memoLog);
    const errors = consumeStorageErrors();

    render();
    setStickyStatus(errors.length ? "一部保存できませんでした" : "復元しました");
  } catch {
    setStickyStatus("JSON の読み込みに失敗しました");
  } finally {
    backupImportFile.value = "";
  }
}

function exportBackupJson() {
  flushPersist();
  collectStateFromInputs();
  const { ok } = persistStateOnly({ report: false });
  if (!ok) {
    setStickyStatus("保存できないためバックアップできませんでした");
    return;
  }

  const payload = buildBackupPayload(state);
  createBackupDownload(payload);
  setStickyStatus("バックアップを書き出しました");
}

function createBackupDownload(payload) {
  const { createDownload } = window.PianoPracticeShared;
  createDownload(
    backupFileName(payload.state),
    JSON.stringify(payload, null, 2),
    "application/json",
  );
}

function schedulePersist() {
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
  persistDebounceTimer = window.setTimeout(() => {
    persistDebounceTimer = 0;
    persistStateOnly();
  }, 250);
}

function flushPersist() {
  if (!persistDebounceTimer) return;
  clearTimeout(persistDebounceTimer);
  persistDebounceTimer = 0;
  persistStateOnly();
}

function persistStateOnly({ report = true } = {}) {
  clearStorageErrors();
  state = saveState(state);
  const errors = consumeStorageErrors();
  const ok = errors.length === 0;
  if (!ok && report) setStickyStatus("保存できませんでした（ブラウザの保存領域を確認）");
  return { ok, errors };
}

function persistAndRender() {
  persistStateOnly();
  render();
}

function render() {
  state = ensurePracticesShape(state);
  renderMetaFields();
  renderCurves();
  renderPracticeAccordions();
  syncAccordionTitleHeights();
  renderCandidatePicker();
  if (!memoHistorySheet?.hidden) renderMemoHistory();
  document.dispatchEvent(new CustomEvent("piano-practice:state-rendered"));
}

function renderMetaFields() {
  const nextDay = String(clampDayCount(state.dayCount));
  const nextCurve0 = state.curves[0] || "";
  const nextCurve1 = state.curves[1] || "";

  if (createdEl.value !== state.createdDate) createdEl.value = state.createdDate || todayLocalISO();
  if (startEl.value !== state.startDate) startEl.value = state.startDate || createdEl.value || todayLocalISO();
  if (dayEl.value !== nextDay) dayEl.value = nextDay;
  if (curve0 && curve0.value !== nextCurve0) curve0.value = nextCurve0;
  if (curve1 && curve1.value !== nextCurve1) curve1.value = nextCurve1;
  if (createdDateDisplayEl) createdDateDisplayEl.textContent = formatCreatedDateLabel(createdEl.value || "");
}

function renderCurves() {
  if (!extraWrap) return;
  extraWrap.innerHTML = state.curves.slice(2).map((value, index) => extraCurveRowHtml(index + 2, value)).join("");
  renderAddCurveButton();
}

function renderAddCurveButton() {
  if (addCurveBtn) {
    const canAdd = findReusableCurveSlot(state.curves) >= 0 || state.curves.length < MAX_CURVES;
    addCurveBtn.disabled = !canAdd;
    addCurveBtn.innerHTML = canAdd ? '+<span>ADD PIECE</span>' : '<span>5 PIECES MAX</span>';
  }
}

function renderPracticeAccordions() {
  if (!practiceAccordionList) return;
  practiceAccordionList.innerHTML = state.curves
    .map((curveName, curveIndex) => accordionHtml(
      curveIndex,
      curveName,
      state.practices[curveIndex] || [],
      state.curveMemos[curveIndex] || "",
      state.collapsedCurveIndices.includes(curveIndex),
    ))
    .join("");
}

function renderCandidatePicker() {
  if (!candidateMasterList || !candidateRecentList || !candidateRecentGroup) return;

  const curveIndex = candidateUiState.curveIndex === null ? NaN : Number(candidateUiState.curveIndex);
  const curveName = Number.isInteger(curveIndex) && curveIndex >= 0
    ? curveLabel(state.curves[curveIndex], curveIndex)
    : "";
  if (candidateSheetSub) {
    candidateSheetSub.textContent = curveName ? `${curveName} に追加する候補` : "曲ごとの候補を選択";
  }

  const recentIds = loadRecentCandidateIds();
  const recentCandidates = recentIds.map((id) => candidateById.get(id)).filter(Boolean);
  const filtered = filteredCandidates(candidateSearchInput?.value || "");

  candidateRecentGroup.hidden = recentCandidates.length === 0;
  candidateRecentList.innerHTML = recentCandidates.length
    ? recentCandidates.map(candidateOptionHtml).join("")
    : `<p class="candidate-empty">最近使った候補はまだありません</p>`;

  candidateMasterList.innerHTML = filtered.length
    ? filtered.map(candidateOptionHtml).join("")
    : `<p class="candidate-empty">該当する候補がありません</p>`;
}

function renderMemoHistory() {
  if (!memoHistoryListEl) return;

  const log = loadMemoLog();
  memoHistorySaveBtn.disabled = !state.curveMemos.some((memo) => String(memo || "").trim());

  memoHistoryListEl.innerHTML = log.length
    ? log.map(memoHistoryEntryHtml).join("")
    : `<p class="memo-history-empty">まだ保存されたメモはありません</p>`;
}

function accordionHtml(curveIndex, curveName, rows, memo, collapsed) {
  const rowList = (Array.isArray(rows) ? rows : [])
    .map((row, practiceIndex) => practiceRowHtml(curveIndex, practiceIndex, row))
    .join("");
  const pieceLabel = `PIECE ${toRoman(curveIndex + 1)}`;
  const actionButton = curveIndex >= 2
    ? `<button type="button" class="curve-delete-btn" data-delete-curve-index="${curveIndex}" aria-label="${curveIndex + 1}曲目を削除">×</button>`
    : `<button type="button" class="curve-delete-btn" data-clear-curve-slot="${curveIndex}" aria-label="${curveIndex + 1}曲目を空欄にする">−</button>`;

  return `
    <div class="accordion-item ${collapsed ? "is-collapsed" : ""}" data-curve-index="${curveIndex}">
      <div class="accordion-head" aria-expanded="${collapsed ? "false" : "true"}">
        <div class="accordion-head-main">
          <textarea
            class="accordion-title-input"
            data-curve-title-index="${curveIndex}"
            rows="1"
            aria-label="${curveIndex + 1}曲目のタイトル"
            placeholder="Chopin: Nocturne in E-flat Major, Op. 9 No. 2"
          >${escapeHtml(curveName || "")}</textarea>
          <p class="accordion-sub">${rows.length} items</p>
        </div>
        <div class="accordion-head-side">
          <span class="piece-index">${pieceLabel}</span>
          ${actionButton}
          <div class="caret" aria-hidden="true">${collapsed ? "▼" : "▲"}</div>
        </div>
      </div>
      <div class="accordion-body" ${collapsed ? "hidden" : ""}>
        <div class="curve-memo-field">
          <span class="curve-memo-label">Lesson Notes</span>
          <textarea
            class="curve-memo-input"
            data-curve-memo-index="${curveIndex}"
            placeholder="Focus points, teacher notes, reminders..."
            rows="3"
          >${escapeHtml(memo)}</textarea>
        </div>
        <div class="practice-list">${rowList}</div>
        <div class="action-strip">
          <button type="button" class="chip add-item-chip" data-add-mode="new">+ ADD ITEM</button>
          <button type="button" class="chip helper-chip" data-add-mode="candidate">候補</button>
        </div>
      </div>
    </div>
  `;
}

function practiceRowHtml(curveIndex, practiceIndex, row) {
  const title = Array.isArray(row) ? row[0] : "";
  const desc = Array.isArray(row) ? row[1] : "";
  return `
    <div class="practice-mini" data-curve-index="${curveIndex}" data-practice-index="${practiceIndex}">
      <button type="button" class="drag-handle" data-drag-handle aria-label="並べ替え">
        <span class="drag-dots" aria-hidden="true"></span>
      </button>
      <p class="t"><input class="practice-title-input" type="text" value="${escapeHtml(title)}" /></p>
      <p class="d"><input class="practice-desc-input" type="text" value="${escapeHtml(desc)}" /></p>
      <div class="mini-tools">
        <button type="button" data-row-action="duplicate" aria-label="複製">⧉</button>
        <button type="button" data-row-action="delete" aria-label="削除">×</button>
      </div>
    </div>
  `;
}

function extraCurveRowHtml(index, value) {
  return `
    <div class="field-row with-tail" data-curve-index="${index}">
      <div class="label">${index + 1}曲目</div>
      <div class="field"><input class="field-input extra-curve-input" type="text" value="${escapeHtml(value || "")}" /></div>
      <button type="button" class="curve-tail-btn" data-delete-curve-index="${index}" aria-label="${index + 1}曲目を削除">×</button>
    </div>
  `;
}

function candidateOptionHtml(candidate) {
  return `
    <button type="button" class="candidate-option" data-candidate-id="${escapeHtml(candidate.id)}">
      <span class="name">${escapeHtml(candidate.title)}</span>
      <span class="desc">${escapeHtml(candidate.desc || "")}</span>
    </button>
  `;
}

function memoHistoryEntryHtml(entry) {
  return `
    <article class="memo-history-entry">
      <div class="memo-history-entry-head">
        <div class="memo-history-stamp">${escapeHtml(formatDateTimeJP(entry.savedAt))}</div>
        <button type="button" class="memo-history-delete" data-memo-log-delete="${escapeHtml(entry.id)}">削除</button>
      </div>
      <div class="memo-history-entry-body">
        ${entry.entries.map((row) => `
          <div class="memo-history-curve">
            <p class="memo-history-curve-name">${escapeHtml(row.curveName)}</p>
            <p class="memo-history-curve-text">${escapeHtml(row.memo)}</p>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

function collectStateFromInputs() {
  const titleInputs = practiceAccordionList
    ? Array.from(practiceAccordionList.querySelectorAll(".accordion-title-input"))
    : [];
  const curves = titleInputs.length
    ? titleInputs.map((input) => input.value)
    : [curve0?.value || "", curve1?.value || ""];
  if (!titleInputs.length) {
    extraWrap?.querySelectorAll(".extra-curve-input").forEach((input) => curves.push(input.value));
  }
  state.curves = curves.slice(0, MAX_CURVES);

  const practiceMap = state.curves.map(() => []);
  practiceAccordionList?.querySelectorAll(".practice-mini[data-curve-index]").forEach((card) => {
    const curveIndex = Number(card.dataset.curveIndex || NaN);
    if (!Number.isInteger(curveIndex) || !practiceMap[curveIndex]) return;
    const title = card.querySelector(".practice-title-input")?.value || "";
    const desc = card.querySelector(".practice-desc-input")?.value || "";
    practiceMap[curveIndex].push([title, desc]);
  });
  state.practices = practiceMap;

  state.curveMemos = state.curves.map((_, curveIndex) => {
    const input = practiceAccordionList?.querySelector(`[data-curve-memo-index="${curveIndex}"]`);
    return input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement
      ? input.value
      : String(state.curveMemos?.[curveIndex] || "");
  });

  state.createdDate = createdEl?.value || todayLocalISO();
  state.startDate = startEl?.value || state.createdDate;
  state.dayCount = clampDayCount(dayEl?.value || state.dayCount);
  state = ensurePracticesShape(state);
}

function findReusableCurveSlot(curves) {
  return (Array.isArray(curves) ? curves : []).findIndex((value) => String(value || "").trim() === "");
}

function focusCurveInput(index) {
  const titleInput = practiceAccordionList?.querySelector(
    `.accordion-item[data-curve-index="${index}"] .accordion-title-input`,
  );
  if (titleInput instanceof HTMLInputElement || titleInput instanceof HTMLTextAreaElement) {
    titleInput.focus();
    titleInput.select?.();
    return;
  }
  if (index === 0) {
    curve0?.focus();
    return;
  }
  if (index === 1) {
    curve1?.focus();
    return;
  }
  const input = extraWrap?.querySelectorAll(".extra-curve-input")[index - 2];
  input?.focus();
}

function toRoman(value) {
  const numerals = [
    [10, "X"],
    [9, "IX"],
    [5, "V"],
    [4, "IV"],
    [1, "I"],
  ];
  let rest = Math.max(1, Number(value) || 1);
  let result = "";
  numerals.forEach(([arabic, roman]) => {
    while (rest >= arabic) {
      result += roman;
      rest -= arabic;
    }
  });
  return result;
}

function syncAccordionTitleHeights() {
  practiceAccordionList?.querySelectorAll(".accordion-title-input").forEach((input) => {
    if (!(input instanceof HTMLTextAreaElement)) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  });
}

function refreshPracticeRowIndices(root) {
  root?.querySelectorAll(".practice-mini[data-curve-index]").forEach((row, index) => {
    row.setAttribute("data-practice-index", String(index));
  });
}

function focusPracticeTitle(curveIndex, rowIndex) {
  const row = practiceAccordionList?.querySelector(
    `.practice-mini[data-curve-index="${curveIndex}"][data-practice-index="${rowIndex}"] .practice-title-input`,
  );
  row?.focus();
  row?.select?.();
}

function setStickyStatus(message) {
  if (!stickyStatusEl) return;
  stickyStatusEl.textContent = message;
  if (stickyStatusTimer) clearTimeout(stickyStatusTimer);
  stickyStatusTimer = window.setTimeout(() => {
    if (stickyStatusEl.textContent === message) stickyStatusEl.textContent = "";
  }, 2600);
}

function handleGlobalKeydown(event) {
  if (event.key === "Escape") {
    if (activeDialog === candidateSheet) {
      event.preventDefault();
      closeCandidatePicker();
      return;
    }
    if (activeDialog === memoHistorySheet) {
      event.preventDefault();
      closeMemoHistory();
      return;
    }
  }

  if (event.key === "Tab" && activeDialogPanel) trapFocus(event);
}

function openDialog(container, panel, returnFocusEl, initialFocusEl) {
  if (!container || !panel) return;
  dialogReturnFocus = returnFocusEl instanceof HTMLElement ? returnFocusEl : document.activeElement;
  activeDialog = container;
  activeDialogPanel = panel;
  document.body.classList.add("modal-open");
  container.hidden = false;
  container.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => {
    const focusTarget = initialFocusEl instanceof HTMLElement ? initialFocusEl : firstFocusable(panel) || panel;
    focusTarget?.focus();
  });
}

function closeDialog(container) {
  if (!container) return;
  container.hidden = true;
  container.setAttribute("aria-hidden", "true");
  if (activeDialog === container) {
    activeDialog = null;
    activeDialogPanel = null;
    document.body.classList.remove("modal-open");
    if (dialogReturnFocus instanceof HTMLElement) dialogReturnFocus.focus();
  }
}

function trapFocus(event) {
  const focusable = getFocusable(activeDialogPanel);
  if (!focusable.length) {
    event.preventDefault();
    activeDialogPanel.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!activeDialogPanel.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function firstFocusable(root) {
  return getFocusable(root)[0] || null;
}

function getFocusable(root) {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && !el.hidden);
}
})();
