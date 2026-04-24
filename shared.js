(() => {
const STORAGE_KEY = "pianoPracticeMockState";
const STORAGE_KEY_MEMO_LOG = "pianoPracticeMockMemoLog";
const RECENT_CANDIDATE_KEY = "pianoPracticeMockRecentCandidates";

const MIN_DAY_COUNT = 14;
const MAX_COLS = 21;
const MAX_CURVES = 5;
const MAX_TABLE_ROWS_PER_PAGE = 20;
const MAX_PRACTICE_ROWS_PER_CURVE = 60;
const MEMO_LOG_LIMIT = 200;
const RECENT_CANDIDATE_LIMIT = 8;

let storageErrors = [];

const CANDIDATE_LIBRARY = [
  { id: "rh-slow", title: "右手練習", desc: "ゆっくり一定拍で（3回）" },
  { id: "lh-slow", title: "左手練習", desc: "和声の流れを確認（音価を保つ）" },
  { id: "hands-separate", title: "片手ずつ", desc: "指使いと運指の再確認" },
  { id: "two-voices", title: "2声練習", desc: "主旋律と低声をそろえる" },
  { id: "inner-voices", title: "内声確認", desc: "アルト/テナーを消さずに弾く" },
  { id: "rhythm", title: "リズム練習", desc: "付点↔均等 / 手拍子→片手→原形" },
  { id: "chunk", title: "部分練習", desc: "2小節ずつ区切って往復" },
  { id: "leap", title: "跳躍確認", desc: "着地点を先読みしてから弾く" },
  { id: "tempo-up", title: "テンポ上げ", desc: "メトロノームを+4ずつ" },
  { id: "balance", title: "音量バランス", desc: "主旋律を少し前に出す" },
  { id: "pedal", title: "ペダル確認", desc: "踏み替え位置だけを確認" },
  { id: "through", title: "通し", desc: "止まらず最後まで / 流れ優先" },
];

const candidateById = new Map(CANDIDATE_LIBRARY.map((candidate) => [candidate.id, candidate]));

function pushStorageError(scope, error) {
  storageErrors.push({
    scope: String(scope || "storage"),
    name: String(error?.name || "Error"),
    message: String(error?.message || ""),
  });

  try {
    console.warn(`[PianoPracticeShared] ${scope} failed`, error);
  } catch {
    // noop
  }
}

function clearStorageErrors() {
  storageErrors = [];
}

function consumeStorageErrors() {
  const next = storageErrors.slice();
  storageErrors = [];
  return next;
}

function safeSetLocalStorage(key, value, scope) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    pushStorageError(scope || key, error);
    return false;
  }
}

function todayLocalISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isIsoDateText(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function clampDayCount(value) {
  return Math.max(MIN_DAY_COUNT, Math.min(MAX_COLS, Number(value) || MAX_COLS));
}

function normalizeCurveSlots(list) {
  const raw = (Array.isArray(list) ? list : []).map((value) => String(value ?? ""));
  while (raw.length < 2) raw.push("");
  return raw.slice(0, MAX_CURVES);
}

function normalizeCurveMemos(list, curveCount) {
  const raw = (Array.isArray(list) ? list : []).map((value) => String(value ?? ""));
  while (raw.length < curveCount) raw.push("");
  return raw.slice(0, curveCount);
}

function normalizePracticeRow(row, fallback = ["", ""]) {
  if (!Array.isArray(row)) return [String(fallback[0] || ""), String(fallback[1] || "")];
  return [String(row[0] ?? fallback[0] ?? ""), String(row[1] ?? fallback[1] ?? "")];
}

function defaultPracticeSet(curveIndex = 0) {
  const presets = [
    [
      ["右手練習", "テーマをゆっくり（♩=60 / 3回）"],
      ["左手練習", "和声の流れ確認（音価を保つ）"],
      ["ソプラノ＋バス", "2声で歌い方をそろえる"],
      ["右手リズム", "手拍子→片手→原形"],
      ["通し", "止まらず最後まで"],
    ],
    [
      ["右手練習", "フレーズごとに区切って確認"],
      ["左手練習", "跳躍の位置を先読み"],
      ["アルト＋バス", "内声を消さない"],
      ["リズム練習", "付点↔均等で変換"],
      ["通し", "流れ優先 / 止まらない"],
    ],
  ];

  return (presets[curveIndex] || [
    ["右手練習", "確認ポイントを短く書く"],
    ["左手練習", "確認ポイントを短く書く"],
    ["部分練習", "必要な箇所を指定"],
    ["リズム練習", "必要ならリズム変換"],
    ["通し", "流れ優先 / 止まらない"],
  ]).map((row) => normalizePracticeRow(row));
}

function blankPracticeSet(rowCount = 5) {
  return Array.from({ length: rowCount }, () => ["", ""]);
}

function defaultState() {
  const today = todayLocalISO();
  return {
    schemaVersion: 2,
    createdDate: today,
    startDate: today,
    dayCount: MAX_COLS,
    curves: ["インベンション8番", "シンフォニア12番"],
    curveMemos: ["", ""],
    practices: [defaultPracticeSet(0), defaultPracticeSet(1)],
    collapsedCurveIndices: [],
  };
}

function sanitizeCollapsedCurveIndices(values, curveCount) {
  return (Array.isArray(values) ? values : [])
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value < curveCount)
    .filter((value, index, arr) => arr.indexOf(value) === index)
    .sort((a, b) => a - b);
}

function migrateState(raw) {
  if (!raw || typeof raw !== "object") return defaultState();

  let next = { ...raw };
  const version = Number(next.schemaVersion) || 1;

  if (version < 2) {
    const curves = normalizeCurveSlots(next.curves);
    next = {
      ...next,
      schemaVersion: 2,
      curveMemos: normalizeCurveMemos(next.curveMemos, curves.length),
      collapsedCurveIndices: sanitizeCollapsedCurveIndices(next.collapsedCurveIndices, curves.length),
    };
  }

  return next;
}

function sanitizeState(input) {
  const base = defaultState();
  const migrated = migrateState(input);
  const curves = normalizeCurveSlots(migrated.curves || base.curves);
  const practices = curves.map((_, curveIndex) => {
    const sourceSet = Array.isArray(migrated.practices?.[curveIndex]) ? migrated.practices[curveIndex] : [];
    const fallbackSet = defaultPracticeSet(curveIndex);
    const rows = sourceSet
      .slice(0, MAX_PRACTICE_ROWS_PER_CURVE)
      .map((row, rowIndex) => normalizePracticeRow(row, fallbackSet[rowIndex] || ["", ""]));
    return rows.length ? rows : [normalizePracticeRow(fallbackSet[0] || ["", ""])];
  });

  return {
    schemaVersion: 2,
    createdDate: isIsoDateText(migrated.createdDate) ? migrated.createdDate : base.createdDate,
    startDate: isIsoDateText(migrated.startDate)
      ? migrated.startDate
      : (isIsoDateText(migrated.createdDate) ? migrated.createdDate : base.startDate),
    dayCount: clampDayCount(migrated.dayCount),
    curves,
    curveMemos: normalizeCurveMemos(migrated.curveMemos, curves.length),
    practices,
    collapsedCurveIndices: sanitizeCollapsedCurveIndices(migrated.collapsedCurveIndices, curves.length),
  };
}

function ensurePracticesShape(state) {
  return sanitizeState(state);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    return sanitizeState(JSON.parse(raw));
  } catch {
    return defaultState();
  }
}

function saveState(state) {
  const sanitized = sanitizeState(state);
  safeSetLocalStorage(STORAGE_KEY, JSON.stringify(sanitized), "state");
  return sanitized;
}

function formatCreatedDateLabel(iso) {
  if (!iso) return "--/--/-- 作成";
  const match = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return `${iso} 作成`;
  return `${match[1]}/${match[2]}/${match[3]} 作成`;
}

function formatDateJP(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}/${match[2]}/${match[3]}` : String(iso || "");
}

function formatDateTimeJP(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function curveLabel(curveName, fallbackIndex) {
  return String(curveName || "").trim() || `${fallbackIndex + 1}曲目`;
}

function sanitizeMemoLogEntry(entry) {
  if (!entry || typeof entry !== "object") return null;

  const savedAt = typeof entry.savedAt === "string" ? entry.savedAt : new Date().toISOString();
  const entries = (Array.isArray(entry.entries) ? entry.entries : [])
    .map((row) => ({
      curveName: String(row?.curveName ?? "").trim(),
      memo: String(row?.memo ?? "").trim(),
    }))
    .filter((row) => row.curveName || row.memo);

  if (!entries.length) return null;

  return {
    id: typeof entry.id === "string" && entry.id ? entry.id : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt,
    entries,
  };
}

function sanitizeMemoLog(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const entry of raw) {
    const cleaned = sanitizeMemoLogEntry(entry);
    if (cleaned) result.push(cleaned);
    if (result.length >= MEMO_LOG_LIMIT) break;
  }
  return result;
}

function loadMemoLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MEMO_LOG);
    if (!raw) return [];
    return sanitizeMemoLog(JSON.parse(raw));
  } catch {
    return [];
  }
}

function saveMemoLog(log) {
  const sanitized = sanitizeMemoLog(log);
  safeSetLocalStorage(STORAGE_KEY_MEMO_LOG, JSON.stringify(sanitized), "memoLog");
  return sanitized;
}

function buildMemoLogEntryFromState(state) {
  const curves = Array.isArray(state?.curves) ? state.curves : [];
  const memos = Array.isArray(state?.curveMemos) ? state.curveMemos : [];
  const entries = curves
    .map((curveName, index) => ({
      curveName: String(curveName || "").trim() || `${index + 1}曲目`,
      memo: String(memos[index] || "").trim(),
    }))
    .filter((row) => row.memo);

  if (!entries.length) return null;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: new Date().toISOString(),
    entries,
  };
}

function addMemoLogEntry(state) {
  const entry = buildMemoLogEntryFromState(state);
  if (!entry) return { log: loadMemoLog(), added: null };
  const next = [entry, ...loadMemoLog()].slice(0, MEMO_LOG_LIMIT);
  return { log: saveMemoLog(next), added: entry };
}

function removeMemoLogEntry(id) {
  const current = loadMemoLog();
  return saveMemoLog(current.filter((entry) => entry.id !== id));
}

function sanitizeRecentCandidateIds(ids) {
  return (Array.isArray(ids) ? ids : [])
    .filter((id) => typeof id === "string" && candidateById.has(id))
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, RECENT_CANDIDATE_LIMIT);
}

function loadRecentCandidateIds() {
  try {
    const raw = localStorage.getItem(RECENT_CANDIDATE_KEY);
    return sanitizeRecentCandidateIds(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

function saveRecentCandidateIds(ids) {
  const sanitized = sanitizeRecentCandidateIds(ids);
  safeSetLocalStorage(RECENT_CANDIDATE_KEY, JSON.stringify(sanitized), "recentCandidates");
  return sanitized;
}

function pushRecentCandidate(id) {
  if (!candidateById.has(id)) return loadRecentCandidateIds();
  const next = loadRecentCandidateIds().filter((item) => item !== id);
  next.unshift(id);
  return saveRecentCandidateIds(next);
}

function filteredCandidates(keyword) {
  const q = String(keyword || "").trim().toLowerCase();
  if (!q) return CANDIDATE_LIBRARY.slice();
  return CANDIDATE_LIBRARY.filter((candidate) => `${candidate.title} ${candidate.desc}`.toLowerCase().includes(q));
}

function compactDateLabel(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[1]}${match[2]}${match[3]}` : "";
}

function sanitizeFileLabelPart(value, fallback = "untitled") {
  const text = String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 24);
  return text || fallback;
}

function backupFileName(state) {
  const exportedStamp = new Date().toISOString().replaceAll(":", "-").slice(0, 16);
  const startPart = compactDateLabel(state?.startDate);
  const curvePart = sanitizeFileLabelPart(Array.isArray(state?.curves) ? state.curves[0] || "1曲目" : "1曲目", "1曲目");
  const parts = ["piano-practice-backup", exportedStamp];
  if (startPart) parts.push(`start${startPart}`);
  if (curvePart) parts.push(curvePart);
  return `${parts.join("_")}.json`;
}

function buildBackupPayload(state) {
  return {
    app: "piano_practice_app_mock",
    version: 2,
    exportedAt: new Date().toISOString(),
    state: sanitizeState(state),
    recentCandidateIds: loadRecentCandidateIds(),
    memoLog: loadMemoLog(),
  };
}

function isStateLike(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray(value.curves) &&
    Array.isArray(value.practices),
  );
}

function parseBackupPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  const looksWrapped =
    payload.app === "piano_practice_app_mock" ||
    Number.isFinite(payload.version) ||
    typeof payload.exportedAt === "string";

  const source = looksWrapped ? payload.state : payload;
  if (!isStateLike(source)) return null;

  return {
    state: sanitizeState(source),
    recentCandidateIds: payload && Array.isArray(payload.recentCandidateIds)
      ? sanitizeRecentCandidateIds(payload.recentCandidateIds)
      : loadRecentCandidateIds(),
    memoLog: payload && Array.isArray(payload.memoLog)
      ? sanitizeMemoLog(payload.memoLog)
      : loadMemoLog(),
  };
}

function dateLabels(startISO, count) {
  const labels = [];
  const start = new Date(`${isIsoDateText(startISO) ? startISO : todayLocalISO()}T00:00:00`);
  for (let index = 0; index < MAX_COLS; index += 1) {
    if (index < count) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      labels.push(`${date.getMonth() + 1}/${date.getDate()}`);
    } else {
      labels.push("");
    }
  }
  return labels;
}

function createDownload(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

window.PianoPracticeShared = {
  STORAGE_KEY,
  STORAGE_KEY_MEMO_LOG,
  RECENT_CANDIDATE_KEY,
  MIN_DAY_COUNT,
  MAX_COLS,
  MAX_CURVES,
  MAX_TABLE_ROWS_PER_PAGE,
  MAX_PRACTICE_ROWS_PER_CURVE,
  MEMO_LOG_LIMIT,
  RECENT_CANDIDATE_LIMIT,
  CANDIDATE_LIBRARY,
  candidateById,
  clearStorageErrors,
  consumeStorageErrors,
  todayLocalISO,
  isIsoDateText,
  clampDayCount,
  normalizeCurveSlots,
  normalizeCurveMemos,
  normalizePracticeRow,
  defaultPracticeSet,
  blankPracticeSet,
  defaultState,
  sanitizeCollapsedCurveIndices,
  migrateState,
  sanitizeState,
  ensurePracticesShape,
  loadState,
  saveState,
  formatCreatedDateLabel,
  formatDateJP,
  formatDateTimeJP,
  escapeHtml,
  curveLabel,
  sanitizeMemoLog,
  loadMemoLog,
  saveMemoLog,
  buildMemoLogEntryFromState,
  addMemoLogEntry,
  removeMemoLogEntry,
  sanitizeRecentCandidateIds,
  loadRecentCandidateIds,
  saveRecentCandidateIds,
  pushRecentCandidate,
  filteredCandidates,
  compactDateLabel,
  sanitizeFileLabelPart,
  backupFileName,
  buildBackupPayload,
  isStateLike,
  parseBackupPayload,
  dateLabels,
  createDownload,
};
})();
