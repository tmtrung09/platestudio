/* Pure Bambu telemetry reducer. Missing fields are deltas, never zeros. */
export const normalizeState = (s) =>
  ({ PRINTING: "RUNNING", PAUSED: "PAUSE", SUCCESS: "FINISH", READY: "IDLE" })[
    String(s).toUpperCase()
  ] || String(s || "UNKNOWN").toUpperCase();
export const statusText = (s) =>
  ({
    RUNNING: "Đang in",
    PAUSE: "Tạm dừng",
    FINISH: "Hoàn thành",
    FAILED: "Thất bại",
    PREPARE: "Chuẩn bị",
    IDLE: "Sẵn sàng",
    SLICING: "Đang xử lý",
    UNKNOWN: "Chờ dữ liệu",
  })[s] || "Chờ dữ liệu";
export const severityFor = (kind, code) =>
  kind === "hms" && code.length === 16
    ? { 3: "warning", 4: "info" }[parseInt(code.slice(8), 16) >>> 16] || "error"
    : "error";
const hex = (n) =>
  (Number(n) >>> 0).toString(16).toUpperCase().padStart(8, "0");
export function issueFor(kind, code, model, catalog = {}, translations = {}) {
  const candidates =
    catalog[kind === "hms" ? "device_hms" : "device_error"]?.[code] ||
    catalog[kind === "hms" ? "device_hms" : "device_error"]?.[
      code.toLowerCase()
    ] ||
    {};
  const original =
    Object.keys(candidates).find((text) => candidates[text].includes(model)) ||
    Object.keys(candidates).find((text) => !candidates[text].length) ||
    "";
  return {
    code,
    severity: severityFor(kind, code),
    text:
      translations[original] ||
      `Thông báo máy ${code}. Chưa có mô tả cho dòng máy này.`,
    original,
  };
}
export function applyTelemetry(
  previous,
  device,
  payload,
  at,
  resolve = issueFor,
) {
  const data = payload?.print;
  if (!data || typeof data !== "object" || Array.isArray(data))
    return { state: previous || null, events: [], runs: [] };
  const old = previous || {},
    state = {
      ...old,
      id: device.id,
      name: device.name,
      model: device.model,
      online: true,
      issues: [...(old.issues || [])],
    };
  const before = old.phase || "UNKNOWN",
    phase = Object.hasOwn(data, "gcode_state")
      ? normalizeState(data.gcode_state)
      : before;
  const validId=value=>value&&String(value)!=='0'?String(value):'';
  let cloudTaskId=Object.hasOwn(data,'task_id')?validId(data.task_id):validId(old.cloudTaskId);
  let subtaskId=Object.hasOwn(data,'subtask_id')?validId(data.subtask_id):validId(old.subtaskId);
  const parentChanged=!!(cloudTaskId&&validId(old.cloudTaskId)&&cloudTaskId!==old.cloudTaskId);
  const identityChanged=parentChanged||!!(subtaskId&&validId(old.subtaskId)&&subtaskId!==old.subtaskId);
  if(parentChanged&&!Object.hasOwn(data,'subtask_id'))subtaskId='';
  const task = subtaskId||cloudTaskId||validId(old.taskId);
  const active = ["RUNNING", "PREPARE", "PAUSE"].includes(phase),
    oldActive = ["RUNNING", "PREPARE", "PAUSE"].includes(before);
  const continuous =
    old.online !== false &&
    old.lastReport &&
    Date.parse(at) - Date.parse(old.lastReport) <= 120000;
  const newJob =
    identityChanged ||
    (active && !oldActive && !!old.hasState);
  const runs = [],
    events = [];
  let serial = old.serial || 0;
  const emit = (kind, title, detail, issue = null) => {
    serial++;
    events.push({
      id: device.id + ":" + serial,
      type: "printer_" + kind,
      title: device.name + " · " + title,
      detail,
      deviceId: device.id,
      jobKey: state.run?.id || null,
      severity: issue?.severity || (kind === "failed" ? "error" : "info"),
      code: issue?.code || null,
      episode: issue?.episode || null,
      createdAt: at,
    });
  };
  if (newJob) {
    if (state.run && !state.run.endedObservedAt) {
      state.run = {
        ...state.run,
        result: "unknown",
        gap: true,
        lastObservedAt: old.lastReport,
      };
      runs.push(state.run);
    }
    delete state.run;
    for (const key of [
      "percent",
      "layer",
      "totalLayers",
      "remainingMinutes",
      "fileName",
      "taskId",
      "cloudTaskId",
      "subtaskId",
    ])
      delete state[key];
  }
  state.taskId = task;
  state.phase = phase;
  state.cloudTaskId=cloudTaskId;state.subtaskId=subtaskId;
  if (Object.hasOwn(data, "gcode_state")) state.hasState = true;
  for (const [src, dst, max] of [
    ["mc_percent", "percent", 100],
    ["layer_num", "layer", 10000000],
    ["total_layer_num", "totalLayers", 10000000],
    ["mc_remaining_time", "remainingMinutes", 10000000],
    ["nozzle_temper", "nozzle", 500],
    ["bed_temper", "bed", 200],
    ["spd_lvl", "speed", 4],
    ["stg_cur", "stage", 10000],
  ]) {
    if (
      Object.hasOwn(data, src) &&
      data[src] !== null &&
      data[src] !== "" &&
      Number.isFinite(Number(data[src]))
    )
      state[dst] = Math.max(0, Math.min(max, Number(data[src])));
  }
  if (Object.hasOwn(data, "subtask_name"))
    state.fileName = String(data.subtask_name || "").slice(0, 500);
  else if (!state.fileName && data.gcode_file)
    state.fileName = String(data.gcode_file).slice(0, 500);
  if (active && !state.run) {
    const id = device.id + ":" + (task || "observed") + ":" + at;
    state.run = {
      id,
      deviceId: device.id,
      machineName: device.name,
      machineModel: device.model,
      taskId: task,
      fileName: state.fileName || "",
      firstObservedAt: at,
      startedObservedAt: newJob && continuous ? at : null,
      endedObservedAt: null,
      result: "running",
      gap: !newJob || !continuous,
      printingMs: 0,
      pausedMs: 0,
      models: [],
      lastObservedAt: at,
    };
  }
  if (old.online === false)
    emit("reconnected", "Đã kết nối lại", "Đã nhận báo cáo từ Bambu Cloud.");
  const oldIssues = old.issues || [];
  let issues = state.issues;
  if (Array.isArray(data.hms))
    issues = issues
      .filter((i) => i.kind !== "hms")
      .concat(
        data.hms
          .filter((i) => Number(i.code) !== 0)
          .map((i) => ({
            ...resolve("hms", hex(i.attr) + hex(i.code), device.model),
            kind: "hms",
          })),
      );
  if (Object.hasOwn(data, "print_error"))
    issues = issues
      .filter((i) => i.kind !== "print")
      .concat(
        Number(data.print_error)
          ? [
              {
                ...resolve("print", hex(data.print_error), device.model),
                kind: "print",
              },
            ]
          : [],
      );
  state.issues = [...new Map(issues.map((i) => [i.code, i])).values()].map(
    (issue) => {
      const prev = oldIssues.find(
        (i) => i.code === issue.code && i.severity === issue.severity,
      );
      const enriched = { ...issue, episode: prev?.episode || at };
      if (!prev)
        emit(
          issue.severity,
          { warning: "Cảnh báo", error: "Lỗi", info: "Thông tin" }[
            issue.severity
          ],
          issue.text,
          enriched,
        );
      return enriched;
    },
  );
  if (state.run) {
    const run = { ...state.run },
      elapsed = newJob
        ? 0
        : Math.max(0, Date.parse(at) - Date.parse(old.lastReport || at));
    if (elapsed > 120000) run.gap = true;
    else if (!run.endedObservedAt) {
      if (before === "RUNNING" || before === "PREPARE")
        run.printingMs += elapsed;
      if (before === "PAUSE") run.pausedMs += elapsed;
    }
    run.fileName = state.fileName || run.fileName;
    run.taskId = task;
    run.lastObservedAt = at;
    if (["FINISH", "FAILED"].includes(phase) && before !== phase) {
      run.endedObservedAt = at;
      run.result = phase === "FINISH" ? "finished" : "failed";
    } else if (phase === "IDLE" && oldActive) {
      run.endedObservedAt = at;
      run.result = "stopped";
    }
    state.run = run;
    runs.push(run);
  }
  // First observation and telemetry replay are not a fabricated start event.
  if (
    old.hasState &&
    continuous &&
    (phase !== before || (newJob && phase === "RUNNING"))
  ) {
    const kind =
      phase === "RUNNING"
        ? before === "PAUSE"
          ? "resumed"
          : "started"
        : {
            PAUSE: "paused",
            FINISH: "finished",
            FAILED: "failed",
            IDLE: oldActive ? "stopped" : null,
          }[phase];
    if (kind)
      emit(
        kind,
        {
          started: "Bắt đầu in",
          resumed: "Tiếp tục in",
          paused: "Tạm dừng",
          finished: "In xong",
          failed: "In thất bại",
          stopped: "Dừng in",
        }[kind],
        state.fileName || statusText(phase),
      );
  }
  state.serial = serial;
  state.lastReport = at;
  return { state, events, runs };
}
export function applyPresence(previous, online, at) {
  if(typeof online!=='boolean')return {state:previous||null,events:[]};
  if (!previous) return { state: null, events: [] };
  const state = { ...previous, online };
  const events = [];
  if (previous.online !== online) {
    state.serial = (state.serial || 0) + 1;
    events.push({
      id: state.id + ":" + state.serial,
      type: "printer_" + (online ? "reconnected" : "offline"),
      title: state.name + " · " + (online ? "Đã kết nối lại" : "Mất kết nối"),
      detail: online
        ? "Đã nhận lại trạng thái kết nối từ Bambu Cloud."
        : "Giữ số liệu cũ cho đến khi có cập nhật mới.",
      deviceId: state.id,
      severity: "info",
      createdAt: at,
    });
  }
  return { state, events };
}
export const warningKey = (deviceId, issue) =>
  JSON.stringify([deviceId, issue.code, issue.episode]);
export const canIgnore = (issue) => issue?.severity === "warning";
export function matchTask(tasks, state) {
  const ids = [state.cloudTaskId, state.subtaskId, state.taskId].filter(
    (id) => id && id !== "0",
  );
  const hits = tasks?.hits;
  if (!Array.isArray(hits) || !ids.length) return null;
  const matches = hits.filter(
    (task) =>
      String(task.deviceId) === state.id && ids.includes(String(task.id)),
  );
  return matches.length === 1 ? matches[0] : null;
}
