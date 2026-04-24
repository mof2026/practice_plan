(() => {
const {
  MAX_COLS,
  MAX_TABLE_ROWS_PER_PAGE,
  blankPracticeSet,
  curveLabel,
  dateLabels,
  formatDateJP,
  loadState,
  defaultState,
  escapeHtml,
} = window.PianoPracticeShared;

const main = document.querySelector(".print-view main.panel");
const printBtn = document.getElementById("print-btn");

printBtn?.addEventListener("click", triggerPrint);
window.addEventListener("beforeprint", render);
window.addEventListener("pageshow", render);

render();

function triggerPrint() {
  if (typeof window.print === "function") window.print();
}

function render() {
  if (!main) return;

  const state = loadState();
  const labels = dateLabels(state.startDate, state.dayCount);
  const pages = buildPageBlocks(state);

  main.innerHTML = pages.map((pageBlocks, pageIndex) => pageHtml(state, labels, pageBlocks, pageIndex)).join("");
}

function pageHtml(state, labels, pageBlocks, pageIndex) {
  return `
    <section class="sheet-card">
      <div class="sheet">
        <div class="sheet-date">${pageIndex === 0 ? `作成日 ${escapeHtml(formatDateJP(state.createdDate))}` : "&nbsp;"}</div>
        <div class="sheet-frame">
          ${buildTable(labels, pageBlocks)}
        </div>
      </div>
    </section>
  `;
}

function buildTable(labels, pageBlocks) {
  const rows = [];

  rows.push(`
    <tr class="dates-row">
      <td class="section-left">&nbsp;</td>
      ${labels.map((label) => `<td class="day">${label ? escapeHtml(label) : "&nbsp;"}</td>`).join("")}
    </tr>
  `);

  pageBlocks.forEach((block) => {
    const memoText = block.showMemo ? String(block.memo || "") : "";
    rows.push(`
      <tr class="curve-row">
        <td class="section-left"><span class="section-title-text">${escapeHtml(curveLabel(block.curveName, block.curveIndex))}</span></td>
        <td class="curve-memo-cell" colspan="${MAX_COLS}">
          ${memoText.trim() ? `<span class="memo-label-inline">☆</span>${escapeHtml(memoText)}` : "&nbsp;"}
        </td>
      </tr>
    `);

    block.rows.forEach(([title, desc]) => {
      const safeTitle = String(title || "");
      const safeDesc = String(desc || "");
      const lineCount = (safeTitle.trim() ? 1 : 0) + (safeDesc.trim() ? 1 : 0);
      const wrapClass = lineCount <= 1 ? "practice-wrap is-single-line" : "practice-wrap";
      rows.push(`
        <tr class="practice-row">
          <td class="left-cell">
            <div class="${wrapClass}">
              <p class="practice-title">${escapeHtml(safeTitle)}</p>
              ${safeDesc.trim() ? `<p class="practice-desc">${escapeHtml(safeDesc)}</p>` : ""}
            </div>
          </td>
          ${Array.from({ length: MAX_COLS }, () => "<td></td>").join("")}
        </tr>
      `);
    });
  });

  return `
    <table class="plan" aria-label="ピアノ練習計画表">
      <colgroup>
        <col class="left" />
        <col class="day" span="${MAX_COLS}" />
      </colgroup>
      <tbody>${rows.join("")}</tbody>
    </table>
  `;
}

function buildPageBlocks(state) {
  const pages = [];
  const curves = Array.isArray(state?.curves) && state.curves.length ? state.curves : defaultState().curves;
  const memos = Array.isArray(state?.curveMemos) ? state.curveMemos : [];
  let currentPage = [];
  let usedRows = 1;

  function pushPage() {
    if (!currentPage.length) return;
    pages.push(currentPage);
    currentPage = [];
    usedRows = 1;
  }

  curves.forEach((curveName, curveIndex) => {
    const curveRows = rowsForCurve(state, curveIndex);
    let offset = 0;

    while (offset < curveRows.length) {
      const remainingRows = MAX_TABLE_ROWS_PER_PAGE - usedRows;
      const availablePracticeRows = remainingRows - 1;

      if (availablePracticeRows <= 0) {
        pushPage();
        continue;
      }

      const sliceSize = Math.max(1, Math.min(availablePracticeRows, curveRows.length - offset));
      currentPage.push({
        curveIndex,
        curveName: String(curveName || ""),
        showMemo: offset === 0,
        memo: offset === 0 ? String(memos[curveIndex] || "") : "",
        rows: curveRows.slice(offset, offset + sliceSize),
      });

      usedRows += sliceSize + 1;
      offset += sliceSize;

      if (offset < curveRows.length) pushPage();
    }
  });

  pushPage();

  if (!pages.length) {
    const fallback = defaultState();
    pages.push([{
      curveIndex: 0,
      curveName: fallback.curves[0],
      showMemo: true,
      memo: fallback.curveMemos[0] || "",
      rows: fallback.practices[0],
    }]);
  }

  return pages;
}

function rowsForCurve(state, curveIndex) {
  const rows = Array.isArray(state?.practices?.[curveIndex]) ? state.practices[curveIndex] : null;
  if (!rows || !rows.length) return blankPracticeSet(5);
  return rows.map((row) => [String(row?.[0] || ""), String(row?.[1] || "")]);
}

window.PianoPracticePrint = {
  buildPageBlocks,
};
})();
