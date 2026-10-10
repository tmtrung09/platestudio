/* On-demand browser monitor. Bambu credentials never enter this module. */
(() => {
  "use strict";
  const phaseText = {
    RUNNING: "Đang in",
    PREPARE: "Chuẩn bị",
    PAUSE: "Tạm dừng",
    FINISH: "Hoàn thành",
    FAILED: "Thất bại",
    IDLE: "Sẵn sàng",
    UNKNOWN: "Chờ dữ liệu",
  };
  let scope = "",
    generation = 0,
    abort = null,
    streaming = false,
    polling = false,
    connected = false,
    cursor = 0,
    primed = false,
    lastPoll = 0;
  let snapshot = { devices: {} },
    events = [],
    historyRows = [],
    moreHistory = false,
    historyOffset = 0,
    query = "",
    view = "live",
    message = "",
    aliases = {},
    ignored = {},
    readIds = {},
    pinned = false,
    modal = null;
  const icon = (name) => appIcon(name),
    e = (value) => esc(String(value ?? ""));
  const context = () => ({
    workspace: cloudWorkspaceId(),
    user: currentUser?.id || "",
    allowed:
      !!currentUser &&
      !!sb &&
      (canAccess("progress.view") || canAccess("plates.plan")) &&
      !STAFF_REPORT_MODE &&
      !STAFF_RECEIVING_MODE,
  });
  const key = () => `ps_printers_v1_${scope}`;
  const save = () => {
    try {
      localStorage.setItem(
        key(),
        JSON.stringify({ aliases, ignored, readIds, snapshot, events, cursor }),
      );
    } catch {
      /* Server history is not removed on a full local cache. */
    }
  };
  const norm = (s) => searchFold(String(s || ""));
  const warningKey = (device, issue) =>
    JSON.stringify([device, issue.code, issue.episode]);
  const isIgnored = (device, issue) =>
    issue.severity === "warning" && !!ignored[warningKey(device, issue)];
  const date = (s) =>
    s ? new Date(s).toLocaleString("vi-VN") : "Chưa xác định";
  const time = (ms) => {
    if (!Number.isFinite(ms)) return "—";
    const mins = Math.floor(ms / 60000);
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };
  const thumb = (url) =>
    `<span class="pm-thumb" aria-hidden="true">${icon("model")}${url ? `<img src="${e(url)}" alt="" loading="lazy" onerror="this.hidden=true">` : ""}</span>`;
  const stale = (d) =>
    !connected || !d.lastReport || Date.now() - Date.parse(d.lastReport) > 120000;
  function setText(node, value) {
    if (node && node.textContent !== value) node.textContent = value;
  }
  function image(node, url) {
    if(node.dataset.imageUrl===String(url||''))return;
    node.dataset.imageUrl=String(url||'');
    const img = node.querySelector("img");
    if (url && /^https:\/\//.test(url)) {
      if (!img || img.dataset.src !== url) {
        node.innerHTML = "";
        const el = document.createElement("img");
        el.dataset.src = url;
        el.src = url;
        el.alt = "";
        el.loading = "lazy";
        el.referrerPolicy = "no-referrer";
        el.onerror = () => {
          el.remove();
          node.append(document.createTextNode("Chưa có ảnh"));
        };
        node.append(el);
      }
    } else if (img || !node.textContent) node.textContent = "Chưa có ảnh";
  }
  function modelImage(model) {
    return /^(?:A1|A1 mini|P1S|P1P|P2S|H2S|X1 Carbon|X1C)$/.test(model)
      ? `https://cdn.jsdelivr.net/gh/bambulab/BambuStudio@47a13eeb1d9af65ef2371e361c856e21d4f6ca72/resources/profiles/BBL/${encodeURIComponent("Bambu Lab " + (model === "X1C" ? "X1 Carbon" : model) + "_cover.png")}`
      : null;
  }
  async function api(body, signal) {
    const ctx = context();
    if (!ctx.allowed || !ctx.workspace)
      throw new Error("Cần đăng nhập vào workspace có quyền xem máy.");
    const session = await sb.auth.getSession();
    if (!session.data?.session?.access_token)
      throw new Error("Phiên đăng nhập đã hết hạn.");
    const response = await fetch(SUPABASE_URL + "/functions/v1/bambu-monitor", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: "Bearer " + session.data.session.access_token,
      },
      body: JSON.stringify({ ...body, workspaceId: ctx.workspace }),
      priority:'low',
      signal:
        signal ||
        AbortSignal.timeout(body.action === "connect" ? 100000 : 30000),
    });
    return response;
  }
  async function request(body) {
    const response = await api(body),
      data = await response.json();
    if (!response.ok || data.error){const error=new Error(data.error || "Chưa nhận được dữ liệu máy in.");error.status=response.status;throw error;}
    return data;
  }
  function receive(data, { initial = false } = {}) {
    connected = !!data.connected;
    snapshot = data.state || snapshot;
    const known = new Map(events.map((event) => [event.id, event]));
    const rows = [...(data.events || [])].sort((a, b) => a.seq - b.seq);
    for (const row of rows) {
      const event = {
        ...row.data,
        id: "printer:" + row.data.id,
        printerId: row.data.deviceId,
        permissions: ["progress.view", "plates.plan"],
        readBy: readIds["printer:" + row.data.id]
          ? [notificationUserKey()]
          : [],
      };
      known.set(event.id, event);
      cursor = Math.max(cursor, Number(row.seq));
      if (primed && !initial && !isIgnored(event.printerId, event)) {
        if (navigator.locks)
          void navigator.locks.request("ps-printer-notify:" + scope, () =>
            announceSystemEvent(event),
          );
        else announceSystemEvent(event);
      }
    }
    events = [...known.values()]
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, 200);
    if (initial || !primed) {
      const seen = seenNotificationIds();
      events.forEach((event) => seen.add(event.id));
      saveSeenNotificationIds(seen);
      primed = true;
    }
    const all = new Map(historyRows.map((row) => [row.id, row]));
    (data.history || []).forEach((row) => all.set(row.id, row));
    historyRows = [...all.values()].sort(
      (a, b) =>
        Date.parse(b.data.firstObservedAt) - Date.parse(a.data.firstObservedAt),
    );
    if(Array.isArray(data.history))moreHistory = !!data.moreHistory;
    save();
    ensureSystemNotificationButton();
    render();
    renderPin();
  }
  async function poll({ initial = false, force = false } = {}) {
    const cameraPending=typeof batchCameraHasPending==='function'&&batchCameraHasPending();
    if(!initial&&cameraPending&&Date.now()-lastPoll<15000)return;
    if (
      polling ||
      !scope ||
      (!force && Date.now() - lastPoll < (connected ? 5000 : 60000))
    )
      return;
    const gen = generation;
    polling = true;
    lastPoll = Date.now();
    try {
      let data = await request({
        action: "read",
        cursor: initial ? 0 : cursor,
        initial,
        history:initial||(curPage==='printer-monitor'&&view==='history'),
      });
      if (gen !== generation) return;
      receive(data, { initial });
      while (!initial && data.moreEvents) {
        data = await request({ action: "read", cursor,history:false });
        if (gen !== generation) return;
        receive(data);
      }
      if (!streaming && connected) startStream(gen);
      if (!connected) {
        message = "Chưa kết nối Bambu Cloud";
        render();
      }
    } catch (error) {
      if (gen === generation) {
        message = error.message;
        render();
      }
    } finally {
      if (gen === generation) polling = false;
    }
  }
  async function startStream(gen) {
    if (streaming || !connected || !navigator.onLine) return;
    streaming = true;
    abort = new AbortController();
    const signal = abort.signal;
    try {
      const response = await api({ action: "stream" }, signal);
      if (gen !== generation) return;
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Chưa mở được luồng trạng thái");
      }
      if (!response.headers.get("content-type")?.includes("ndjson")) {
        const data = await response.json();
        message = data.busy
          ? "Đang theo dõi từ phiên web khác"
          : "Chờ trạng thái máy";
        return;
      }
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let tail = "";
      while (!signal.aborted) {
        const part = await reader.read();
        if (part.done) break;
        tail += decoder.decode(part.value, { stream: true });
        if (tail.length > 1000000)
          throw new Error("Luồng trạng thái không hợp lệ");
        let pos;
        while ((pos = tail.indexOf("\n")) >= 0) {
          const line = tail.slice(0, pos);
          tail = tail.slice(pos + 1);
          if (!line) continue;
          const data = JSON.parse(line);
          if (gen !== generation) return;
          if (data.kind === "error") throw new Error(data.error);
          if (data.kind === "connected") message = "Đã kết nối luồng máy";
          if (data.kind === "connecting") message = "Đang kết nối Bambu Cloud…";
          if (data.kind === "update") void poll({ force: true });
          render();
        }
      }
    } catch (error) {
      if (!signal.aborted && gen === generation) {
        message = error.message;
        render();
      }
    } finally {
      if (gen === generation) {
        streaming = false;
        abort = null;
        setTimeout(() => {
          if (gen === generation && connected) startStream(gen);
        }, 5000);
      }
    }
  }
  function reset(next) {
    generation++;
    abort?.abort();
    abort = null;
    streaming = false;
    polling = false;
    scope = next;
    connected = false;
    cursor = 0;
    primed = false;
    lastPoll = 0;
    snapshot = { devices: {} };
    events = [];
    historyRows = [];
    historyOffset = 0;
    moreHistory = false;
    aliases = {};
    ignored = {};
    readIds = {};
    message = "Đang kiểm tra kết nối…";
    document
      .querySelectorAll('.system-notification-popup[data-event-id^="printer:"]')
      .forEach(closeSystemNotificationPopup);
    if (next) {
      try {
        const saved = JSON.parse(localStorage.getItem(key()) || "{}");
        aliases = saved.aliases || {};
        ignored = saved.ignored || {};
        readIds = saved.readIds || {};
        snapshot = saved.snapshot || snapshot;
        events = saved.events || [];
        cursor = saved.cursor || 0;
      } catch {}
    }
    render();
    renderPin();
    if (next) void poll({ initial: true, force: true });
  }
  function tick() {
    const ctx = context(),
      next = ctx.allowed && ctx.workspace ? ctx.workspace + ":" + ctx.user : "";
    if (next !== scope) reset(next);
    else if (next) void poll();
    renderPin();
    if (curPage === "printer-monitor") render();
  }
  function ignore(device, issue) {
    if (issue.severity !== "warning") return;
    ignored[warningKey(device, issue)] = true;
    for (const event of events)
      if (
        event.printerId === device &&
        event.code === issue.code &&
        event.episode === issue.episode
      ) {
        readIds[event.id] = true;
        event.readBy = [notificationUserKey()];
      }
    save();
    render();
    renderPin();
    ensureSystemNotificationButton();
    toast("Đã bỏ qua cảnh báo trên web.");
  }
  function restore(device, issue) {
    delete ignored[warningKey(device, issue)];
    save();
    render();
    renderPin();
  }
  function issuesHTML(device, issues) {
    return (issues || [])
      .map(
        (issue) =>
          `<div class="pm-issue pm-${e(issue.severity)}${isIgnored(device, issue) ? " pm-ignored" : ""}"><span>${icon(issue.severity === "info" ? "bell" : "warning")}<b>${issue.severity === "error" ? "Lỗi" : issue.severity === "warning" ? "Cảnh báo" : "Thông tin"}</b> · ${e(issue.code)}${isIgnored(device, issue) ? "<small>Đã bỏ qua</small>" : ""}</span><p>${e(issue.text || issue.detail)}</p>${issue.original ? `<details><summary>Nội dung gốc</summary><p>${e(issue.original)}</p></details>` : ""}${issue.severity === "warning" ? `<button type="button" class="btn btn-ghost btn-sm" data-pm-action="${isIgnored(device, issue) ? "restore" : "ignore"}" data-device="${e(device)}" data-code="${e(issue.code)}">${isIgnored(device, issue) ? "Hiện lại" : "Bỏ qua cảnh báo"}</button>` : ""}</div>`,
      )
      .join("");
  }
  function shell(host) {
    if (host.querySelector(".pm-toolbar")) return;
    host.innerHTML = `<section class="pm-workspace"><div class="pm-toolbar"><label class="page-smart-search"><span aria-hidden="true">${icon("search")}</span><input type="search" aria-label="Tìm máy hoặc mẻ in" placeholder="Tìm máy hoặc mẻ in…" autocomplete="off"></label><div class="pm-tabs"><button class="btn btn-ghost" data-pm-action="live">Hiện tại</button><button class="btn btn-ghost" data-pm-action="history">Lịch sử mẻ</button></div><button class="btn btn-ghost" data-pm-action="pin">Ghim gọn</button><button class="btn btn-ghost" data-pm-action="connect">Kết nối</button><button class="btn btn-ghost" data-pm-action="retry" aria-label="Thử lại kết nối máy">${icon("refresh")}</button></div><p class="pm-connection" role="status"></p><div class="pm-count"></div><div class="pm-live"></div><div class="pm-history"></div><button class="btn btn-ghost pm-more" data-pm-action="more" hidden>Xem thêm mẻ</button><p class="pm-footnote">Chỉ đọc trạng thái khi web mở. Mẻ in xong không tự cộng tồn hoặc xác nhận QC.</p></section>`;
    host.querySelector("input").value = query;
    host.querySelector("input").oninput = (event) => {
      query = event.target.value;
      render();
    };
    host.addEventListener("click", (event) => {
      const button = event.target.closest("[data-pm-action]");
      if (!button) return;
      const action = button.dataset.pmAction,
        device = snapshot.devices[button.dataset.device];
      if (action === "live" || action === "history") {
        view = action;
        render();
      } else if (action === "connect") openConnection();
      else if (action === "retry") {
        lastPoll = 0;
        void poll({ force: true });
      } else if (action === "pin") {
        pinned = !pinned;
        renderPin();
        button.setAttribute("aria-pressed", String(pinned));
      } else if (action === "rename") rename(device);
      else if (action === "ignore" || action === "restore") {
        const issue = device?.issues?.find(
          (i) => i.code === button.dataset.code,
        );
        if (issue) (action === "ignore" ? ignore : restore)(device.id, issue);
      } else if (action === "models") openModels(button.dataset.run);
      else if (action === "more") void loadMore();
    });
  }
  function render() {
    const host = document.getElementById("printer-monitor-page");
    if (!host || curPage !== "printer-monitor") return;
    shell(host);
    const ctx = context();
    host.querySelector('[data-pm-action="connect"]').hidden =
      !isWorkspaceOwner();
    setText(
      host.querySelector(".pm-connection"),
      !ctx.allowed
        ? "Đăng nhập để xem máy của xưởng."
        : message || "Đang theo dõi khi web mở.",
    );
    for (const action of ["live", "history"])
      host
        .querySelector(`[data-pm-action="${action}"]`)
        .setAttribute("aria-pressed", String(view === action));
    host.querySelector(".pm-live").hidden = view !== "live";
    host.querySelector(".pm-history").hidden = view !== "history";
    const devices = Object.values(snapshot.devices).filter(
      (d) =>
        !snapshot.boundDevices ||
        snapshot.boundDevices.some((b) => b.id === d.id),
    );
    const shown = devices.filter((d) =>
      norm(
        [
          aliases[d.id],
          d.name,
          d.model,
          d.fileName,
          ...(d.issues || []).map((i) => i.text),
        ].join(" "),
      ).includes(norm(query)),
    );
    setText(
      host.querySelector(".pm-count"),
      view === "live"
        ? `${shown.length}/${devices.length} máy`
        : `${historyRows.filter((row) => norm([row.data.machineName, row.data.fileName, ...(row.linked_models || []).map((m) => m.modelName)].join(" ")).includes(norm(query))).length} mẻ đã tải`,
    );
    const list = host.querySelector(".pm-live"),
      ids = new Set(shown.map((d) => d.id));
    [...list.children].forEach((node) => {
      if (!ids.has(node.dataset.device)) node.remove();
    });
    for (const [index, d] of shown.entries()) {
      let card = [...list.children].find(
        (node) => node.dataset.device === d.id,
      );
      if (!card) {
        card = document.createElement("article");
        card.className = "pm-machine";
        card.dataset.device = d.id;
        card.innerHTML = `<div class="pm-media"><div class="pm-machine-image"></div><div class="pm-job-image"></div></div><div class="pm-main"><header><b class="pm-name"></b><span class="pm-model"></span><button type="button" class="btn btn-ghost btn-sm" data-pm-action="rename" data-device="${e(d.id)}" aria-label="Đổi biệt danh máy">${icon("edit")}</button></header><div class="pm-status"></div><div class="pm-file"></div><div class="pm-progress" role="progressbar" aria-label="Tiến độ in" aria-valuemin="0" aria-valuemax="100"><i></i></div><div class="pm-metrics"></div><small class="pm-seen"></small><details class="pm-issues"><summary></summary><div></div></details></div>`;
        list.append(card);
      }
      setText(card.querySelector(".pm-name"), aliases[d.id] || d.name);
      setText(card.querySelector(".pm-model"), d.model);
      const activeErrors = (d.issues || []).filter(
          (i) => i.severity === "error",
        ),
        activeWarnings = (d.issues || []).filter(
          (i) => i.severity === "warning" && !isIgnored(d.id, i),
        );
      card.classList.toggle("pm-has-error", !!activeErrors.length);
      card.classList.toggle("pm-stale", stale(d) || !d.online);
      setText(
        card.querySelector(".pm-status"),
        `${phaseText[d.phase] || "Chờ dữ liệu"}${d.online===false ? " · Máy ngoại tuyến" : stale(d) ? " · Dữ liệu cũ" : ""}${activeErrors.length ? " · Có lỗi" : activeWarnings.length ? " · Có cảnh báo" : ""}`,
      );
      setText(card.querySelector(".pm-file"), d.fileName || "Chưa có tên mẻ");
      const bar = card.querySelector(".pm-progress");
      bar.setAttribute("aria-valuenow", String(d.percent || 0));
      bar.querySelector("i").style.width = (d.percent || 0) + "%";
      setText(
        card.querySelector(".pm-metrics"),
        `${d.percent ?? "—"}% · Layer ${d.layer ?? "—"}/${d.totalLayers ?? "—"} · Còn ${d.remainingMinutes === undefined ? "—" : time(d.remainingMinutes * 60000)} · Đầu ${d.nozzle ?? "—"}° / Bàn ${d.bed ?? "—"}°`,
      );
      setText(card.querySelector(".pm-seen"), "Báo cáo: " + date(d.lastReport));
      image(card.querySelector(".pm-machine-image"), modelImage(d.model));
      image(card.querySelector(".pm-job-image"), d.run?.thumbnail);
      const issueBox = card.querySelector(".pm-issues");
      issueBox.hidden = !(d.issues || []).length;
      setText(
        issueBox.querySelector("summary"),
        `${activeErrors.length} lỗi · ${activeWarnings.length} cảnh báo${(d.issues || []).some((i) => isIgnored(d.id, i)) ? " · Có cảnh báo đã bỏ qua" : ""}`,
      );
      const html = issuesHTML(d.id, d.issues);
      if (issueBox.lastElementChild.innerHTML !== html)
        issueBox.lastElementChild.innerHTML = html;
      if (list.children[index] !== card)
        list.insertBefore(card, list.children[index] || null);
    }
    if (!shown.length) {
      list.innerHTML =
        '<p class="empty">' +
        (devices.length
          ? "Không tìm thấy máy phù hợp."
          : "Chưa có dữ liệu máy. Chủ xưởng chọn Kết nối để đăng nhập Bambu.") +
        "</p>";
    }
    renderHistory(host);
    host.querySelector(".pm-more").hidden = view !== "history" || !moreHistory;
  }
  function renderHistory(host) {
    const list = host.querySelector(".pm-history");
    if (view !== "history") return;
    const shown = historyRows.filter((row) =>
        norm(
          [
            row.data.machineName,
            row.data.fileName,
            ...(row.linked_models || []).map((m) => m.modelName),
          ].join(" "),
        ).includes(norm(query)),
      ),
      ids = new Set(shown.map((row) => row.id));
    [...list.children].forEach((node) => {
      if (!ids.has(node.dataset.run)) node.remove();
    });
    for (const [index, row] of shown.entries()) {
      const run = row.data;
      let card = [...list.children].find((node) => node.dataset.run === row.id);
      if (!card) {
        card = document.createElement("article");
        card.className = "pm-run";
        card.dataset.run = row.id;
        card.innerHTML =
          '<div class="pm-job-image"></div><div class="pm-run-copy"></div>';
        list.append(card);
      }
      image(card.firstElementChild, run.thumbnail);
      const html = `<b>${e(run.fileName || "Mẻ chưa có tên")}</b><p>${e(aliases[run.deviceId] || run.machineName)} · ${e(run.machineModel)} · ${e({ running: "Đang theo dõi", finished: "Hoàn thành", failed: "Thất bại", stopped: "Dừng", unknown: "Chưa rõ kết quả" }[run.result] || "Chưa rõ kết quả")}</p><dl><div><dt>Bắt đầu ghi nhận</dt><dd>${e(date(run.startedObservedAt || run.firstObservedAt))}${!run.startedObservedAt ? " (giữa mẻ)" : ""}</dd></div><div><dt>Kết thúc ghi nhận</dt><dd>${e(date(run.endedObservedAt))}</dd></div><div><dt>Thời gian in đã theo dõi</dt><dd>${e(time(run.printingMs))}${run.gap ? " · Có khoảng trống dữ liệu" : ""}</dd></div><div><dt>Tạm dừng đã theo dõi</dt><dd>${e(time(run.pausedMs))}</dd></div></dl><div class="pm-model-links">${(row.linked_models || []).map((m) => `<span>${thumb(m.image)}${e(m.modelName)}${m.variantName ? " · " + e(m.variantName) : ""} × ${e(m.qty)}</span>`).join("") || "<small>Chưa ghép model — không tự đoán từ tên file.</small>"}</div>${canAccess("plates.plan") ? `<button type="button" class="btn btn-ghost" data-pm-action="models" data-run="${e(row.id)}">Ghép model</button>` : ""}`;
      if (
        card.lastElementChild.innerHTML !== html &&
        !card.contains(document.activeElement)
      )
        card.lastElementChild.innerHTML = html;
      if (list.children[index] !== card)
        list.insertBefore(card, list.children[index] || null);
    }
    if (!shown.length)
      list.innerHTML =
        '<p class="empty">Chưa có mẻ phù hợp đã được ghi nhận.</p>';
  }
  async function loadMore() {
    const gen = generation;
    historyOffset += 50;
    try {
      const data = await request({
        action: "read",
        cursor,
        offset: historyOffset,
      });
      if (gen === generation) receive(data);
    } catch (error) {
      historyOffset -= 50;
      toast(error.message);
    }
  }
  function rename(device) {
    if (!device) return;
    const ov = document.getElementById("dlg-mv");
    if (ov.style.display === "flex") return;
    ov.innerHTML = `<div class="dlg pm-rename"><div class="dlg-title">Biệt danh máy</div><label class="field"><span>${e(device.model)}</span><input maxlength="120" aria-label="Biệt danh máy" value="${e(aliases[device.id] || device.name)}"></label><div class="dlg-actions"><button class="btn btn-ghost" data-cancel>Huỷ</button><button class="btn btn-ac" data-save>Lưu trên thiết bị</button></div></div>`;
    ov.style.display = "flex";
    const initial = ov.querySelector("input").value;
    modal = {
      node: ov.firstElementChild,
      dirty: () => ov.querySelector("input")?.value !== initial,
    };
    ov.onclick = () => closeDialog("dlg-mv");
    ov.querySelector(".dlg").onclick = (event) => event.stopPropagation();
    ov.querySelector("[data-cancel]").onclick = () => closeDialog("dlg-mv");
    ov.querySelector("[data-save]").onclick = () => {
      const value = ov.querySelector("input").value.trim();
      if (!value) {
        toast("Nhập biệt danh máy.");
        return;
      }
      aliases[device.id] = value;
      save();
      modal = null;
      closeDialog("dlg-mv");
      render();
      renderPin();
    };
    ov.querySelector("input").focus();
  }
  function openConnection() {
    if (!isWorkspaceOwner()) {
      toast("Chỉ chủ xưởng kết nối tài khoản Bambu.");
      return;
    }
    const ov = document.getElementById("dlg-mv");
    if (ov.style.display === "flex") return;
    ov.innerHTML = `<div class="dlg pm-connect"><div class="dlg-title">Kết nối Bambu Cloud</div><p>Dùng email đã liên kết tài khoản Bambu. Không cần chạy app Windows.</p><label class="field"><span>Khu vực</span><select aria-label="Khu vực Bambu"><option value="Global">Global</option><option value="China">China</option></select></label><label class="field"><span>Email Bambu</span><input type="email" autocomplete="email" aria-label="Email Bambu"></label><button class="btn btn-ghost" data-email>Gửi mã email</button><label class="field"><span>Mã email</span><input inputmode="numeric" autocomplete="one-time-code" aria-label="Mã email" maxlength="12"></label><p class="pm-auth-status" role="status"></p><p>Chỉ đọc trạng thái. Điều khiển máy chưa được Bambu xác thực.</p><div class="dlg-actions"><button class="btn btn-ghost" data-cancel>Đóng</button>${connected ? '<button class="btn btn-ghost" data-disconnect>Ngắt liên kết</button>' : ""}<button class="btn btn-ac" data-login>Kết nối</button></div></div>`;
    ov.style.display = "flex";
    ov.querySelector(".dlg").onclick = (event) => event.stopPropagation();
    ov.querySelector("[data-cancel]").onclick = () => closeDialog("dlg-mv");
    const status = ov.querySelector(".pm-auth-status");
    const dialog=ov.firstElementChild;ov.onclick=()=>closeDialog('dlg-mv');
    let busy=false,emailRetryAt=0;
    modal={node:dialog,busy:()=>busy};
    const controls=()=>{
      dialog.querySelectorAll('[data-login],[data-disconnect]').forEach(el=>el.disabled=busy);
      const send=dialog.querySelector('[data-email]');if(send)send.disabled=busy||Date.now()<emailRetryAt;
    };
    const run = async (action, button) => {
      if (busy || button.disabled) return;
      const gen = generation;
      busy=true;controls();
      status.textContent = action==='email'?'Đang gửi yêu cầu mã email…':action==='connect'?'Đang xác nhận mã và kết nối Bambu…':'Đang ngắt liên kết…';
      try {
        const region = ov.querySelector("select").value,
          email = ov.querySelector('[type="email"]').value.trim(),
          code = ov
            .querySelector('[autocomplete="one-time-code"]')
            .value.trim();
        await request({ action, region, email, code });
        if (gen !== generation)
          throw new Error("Workspace đã đổi. Mở lại kết nối.");
        if (action === "email") {
          status.textContent = "Đã gửi yêu cầu. Nhập mã email mới nhất.";
          emailRetryAt=Date.now()+60000;
          setTimeout(controls,60000);
          if(ov.firstElementChild===dialog)ov.querySelector('[autocomplete="one-time-code"]').focus();
          return;
        }
        if(ov.firstElementChild===dialog)ov.querySelector('[autocomplete="one-time-code"]').value = "";
        if (action === "disconnect") {
          connected = false;
          abort?.abort();
          message = "Đã ngắt liên kết. Lịch sử vẫn được giữ.";
        } else {
          connected = true;
          message = "Đã liên kết, đang chờ báo cáo máy…";
        }
        if(ov.firstElementChild===dialog){modal=null;closeDialog("dlg-mv");}
        void poll({ initial: !primed, force: true });
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy=false;
        if(ov.firstElementChild===dialog)controls();
      }
    };
    ov.querySelector("[data-email]").onclick = (event) =>
      void run("email", event.currentTarget);
    ov.querySelector("[data-login]").onclick = (event) =>
      void run("connect", event.currentTarget);
    ov.querySelector("[data-disconnect]")?.addEventListener(
      "click",
      (event) => {
        if (confirm("Ngắt liên kết Bambu? Lịch sử đã lưu không bị xoá."))
          void run("disconnect", event.currentTarget);
      },
    );
    ov.querySelector('[type="email"]').focus();
  }
  function renderPin() {
    let panel = document.getElementById("pm-pinned");
    if (!pinned || !scope) {
      panel?.remove();
      return;
    }
    if (!panel) {
      panel = document.createElement("aside");
      panel.id = "pm-pinned";
      panel.setAttribute("aria-label", "Bảng máy ghim gọn");
      document.body.append(panel);
      panel.onclick = (event) => {
        if (event.target.closest("button")) {
          pinned = false;
          renderPin();
        } else goPage("printer-monitor");
      };
    }
    const html = `<header><b>Máy in</b><button class="btn btn-ghost" aria-label="Bỏ ghim bảng máy">${icon("close")}</button></header>${Object.values(
      snapshot.devices,
    )
      .map(
        (d) =>
          `<div>${e(aliases[d.id] || d.name)} <strong>${e(d.percent ?? "—")}%</strong><small>${e(phaseText[d.phase] || "Chờ dữ liệu")}${stale(d) ? " · Dữ liệu cũ" : ""}</small></div>`,
      )
      .join("")}`;
    if (panel.innerHTML !== html && !panel.contains(document.activeElement))
      panel.innerHTML = html;
  }
  function openModels(id) {
    const row = historyRows.find((r) => r.id === id);
    if (!row || !canAccess("plates.plan")) return;
    const ov = document.getElementById("dlg-mv");
    if (ov.style.display === "flex") return;
    let draft = structuredClone(row.linked_models || []),
      limit = 30;
    ov.innerHTML = `<div class="dlg pm-picker"><div class="dlg-title">Model trong mẻ</div><p>${e(row.data.fileName || "Mẻ in")} · ${e(row.data.machineName)}</p><label class="page-smart-search">${icon("search")}<input type="search" aria-label="Tìm model để ghép" placeholder="Tìm model, part, biến thể…"></label><div class="pm-picker-count"></div><div class="pm-picked"></div><div class="pm-options"></div><button class="btn btn-ghost" data-more>Xem thêm</button><p class="pm-save-status" role="status"></p><div class="dlg-actions"><button class="btn btn-ghost" data-cancel>Huỷ</button><button class="btn btn-ac" data-save>Lưu ghép model</button></div></div>`;
    ov.style.display = "flex";
    ov.querySelector(".dlg").onclick = (event) => event.stopPropagation();
    const original = JSON.stringify(draft);
    const reload=document.createElement('button');reload.type='button';reload.className='btn btn-ghost';reload.hidden=true;reload.textContent='Đối chiếu bản mới';ov.querySelector('.pm-save-status').after(reload);
    reload.onclick=async()=>{reload.disabled=true;const gen=generation,status=ov.querySelector('.pm-save-status');try{const data=await request({action:'read',runId:id});if(gen!==generation||ov.firstElementChild!==modal?.node)return;row.links_revision=data.run.links_revision;status.textContent='Bản cloud: '+((data.run.linked_models||[]).map(m=>`${m.modelName}${m.variantName?' · '+m.variantName:''} × ${m.qty}`).join('; ')||'Chưa ghép model')+'. Lựa chọn của em vẫn giữ; nhấn Lưu để thay bằng lựa chọn này.';reload.hidden=true;}catch(error){status.textContent=error.message;}finally{reload.disabled=false;}};
    let saving = false;
    modal = {
      node: ov.firstElementChild,
      dirty: () => JSON.stringify(draft) !== original,
      busy: () => saving,
    };
    const refreshPicked = () => {
      const node = ov.querySelector(".pm-picked"),
        ids = new Set(
          draft.map((item) =>
            JSON.stringify([item.modelId, item.variantId || ""]),
          ),
        );
      [...node.children].forEach((child) => {
        if (!ids.has(child.dataset.key)) child.remove();
      });
      draft.forEach((item, index) => {
        const id = JSON.stringify([item.modelId, item.variantId || ""]);
        let child = [...node.children].find(
          (child) => child.dataset.key === id,
        );
        if (!child) {
          child = document.createElement("div");
          child.className = "pm-picked-row";
          child.dataset.key = id;
          child.innerHTML = `${thumb(item.image)}<span>${e(item.modelName)}${item.variantName ? " · " + e(item.variantName) : ""}</span><button class="btn btn-ghost" data-minus aria-label="Giảm số lượng">−</button><input type="number" min="1" max="99999" aria-label="Số lượng ${e(item.modelName)}"><button class="btn btn-ghost" data-plus aria-label="Tăng số lượng">+</button><button class="btn btn-ghost" data-remove aria-label="Bỏ model khỏi mẻ">${icon("close")}</button>`;
          node.append(child);
        }
        for (const type of ["minus", "plus", "remove"])
          child.querySelector("[data-" + type + "]").dataset[type] = index;
        const input = child.querySelector("input");
        input.dataset.qty = index;
        if (input !== document.activeElement) input.value = item.qty;
        if (node.children[index] !== child)
          node.insertBefore(child, node.children[index] || null);
      });
    };
    const options = () => {
      const q = norm(ov.querySelector('[type="search"]').value),
        hits = models.filter((model) =>
          norm(
            [
              model.name,
              ...(model.parts || []).map((p) => p.name),
              ...(model.variants || []).map((v) => v.name),
              ...(model.cats || []),
            ].join(" "),
          ).includes(q),
        );
      setText(ov.querySelector(".pm-picker-count"), `${hits.length} model`);
      ov.querySelector("[data-more]").hidden = hits.length <= limit;
      ov.querySelector(".pm-options").innerHTML =
        hits
          .slice(0, limit)
          .map(
            (model) =>
              `<div class="pm-model-option">${thumb(model.images?.[0])}<div><b>${e(model.name)}</b><div>${[{ id: "", name: "Model gốc" }, ...(model.variants || [])].map((v) => `<button type="button" class="btn btn-ghost" data-add="${e(model.id)}" data-variant="${e(v.id)}">${e(v.name)}</button>`).join("")}</div></div></div>`,
          )
          .join("") || "<p>Không tìm thấy model.</p>";
    };
    ov.querySelector('[type="search"]').oninput = () => {
      limit = 30;
      options();
    };
    ov.querySelector("[data-more]").onclick = () => {
      limit += 30;
      options();
    };
    ov.querySelector(".pm-options").onclick = (event) => {
      const button = event.target.closest("[data-add]");
      if (!button) return;
      const m = models.find((m) => m.id === button.dataset.add),
        v = m?.variants?.find((v) => v.id === button.dataset.variant);
      if (!m) return;
      const existing = draft.find(
        (r) => r.modelId === m.id && (r.variantId || "") === (v?.id || ""),
      );
      if (existing) existing.qty = Math.min(99999, existing.qty + 1);
      else
        draft.push({
          modelId: m.id,
          modelName: m.name,
          variantId: v?.id || null,
          variantName: v?.name || "",
          qty: 1,
          image: m.images?.[0],
        });
      refreshPicked();
    };
    ov.querySelector(".pm-picked").onclick = (event) => {
      const b = event.target.closest("button");
      if (!b) return;
      const index = Number(
        b.dataset.remove ?? b.dataset.minus ?? b.dataset.plus,
      );
      if (b.dataset.remove !== undefined) draft.splice(index, 1);
      else
        draft[index].qty = Math.min(
          99999,
          Math.max(
            1,
            draft[index].qty + (b.dataset.plus !== undefined ? 1 : -1),
          ),
        );
      refreshPicked();
    };
    ov.querySelector(".pm-picked").oninput = (event) => {
      if (event.target.dataset.qty !== undefined)
        draft[Number(event.target.dataset.qty)].qty = Number(
          event.target.value,
        );
    };
    const cancel = () => closeDialog("dlg-mv");
    ov.querySelector("[data-cancel]").onclick = cancel;
    ov.onclick = cancel;
    ov.querySelector("[data-save]").onclick = async (event) => {
      const b = event.currentTarget;
      b.disabled = true;
      saving = true;
      const gen = generation,
        status = ov.querySelector(".pm-save-status");
      status.textContent = "Đang lưu…";
      try {
        await request({
          action: "models",
          runId: id,
          revision: row.links_revision,
          models: draft.map(({ modelId, variantId, qty }) => ({
            modelId,
            variantId,
            qty,
          })),
        });
        if (gen !== generation) throw new Error("Workspace đã đổi.");
        status.textContent = "Đã lưu trên cloud.";
        modal = null;
        closeDialog("dlg-mv");
        void poll({ force: true });
      } catch (error) {
        status.textContent = error.message;
        b.disabled = false;
        if(error.status===409)reload.hidden=false;
      } finally {
        saving = false;
      }
    };
    refreshPicked();
    options();
    ov.querySelector('[type="search"]').focus();
  }
  window.PlatePrinterMonitor = {
    render,
    allowClose: (id) => {
      const ov = document.getElementById(id);
      if (id !== "dlg-mv" || !modal || ov?.firstElementChild !== modal.node)
        return true;
      if (modal.busy?.()) {
        toast("Đang xử lý, chờ phản hồi trước khi đóng.");
        return false;
      }
      if (modal.dirty?.() && !confirm("Bỏ thay đổi chưa lưu?")) return false;
      modal = null;
      return true;
    },
    events: () => {
      const ctx = context();
      return ctx.allowed && scope === ctx.workspace + ":" + ctx.user
        ? events
        : [];
    },
    markRead: (event) => {
      readIds[event.id] = true;
      event.readBy = [notificationUserKey()];
      save();
    },
    ignored: (event) => isIgnored(event.printerId, event),
    ignoreEvent: (event) => ignore(event.printerId, event),
    receive,
  };
  document.addEventListener(
    "keydown",
    (event) => {
      const dlg = document.querySelector(
        '#dlg-mv[style*="flex"]>.pm-picker,#dlg-mv[style*="flex"]>.pm-connect,#dlg-mv[style*="flex"]>.pm-rename',
      );
      if (!dlg || document.body.classList.contains("notifications-open"))
        return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeDialog("dlg-mv");
      } else if (event.key === "Tab") {
        const controls = [
            ...dlg.querySelectorAll("button:not(:disabled),input,select"),
          ].filter((el) => el.getClientRects().length),
          first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    },
    true,
  );
  window.addEventListener("storage", (event) => {
    if (event.key === key()) {
      try {
        const prefs = JSON.parse(event.newValue || "{}");
        aliases = prefs.aliases || aliases;
        ignored = prefs.ignored || ignored;
        readIds = prefs.readIds || readIds;
        events.forEach((event) => {
          event.readBy = readIds[event.id] ? [notificationUserKey()] : [];
        });
        render();
        renderPin();
      } catch {}
    }
  });
  setInterval(tick, 1000);
  window.addEventListener("online", () => {
    lastPoll = 0;
    tick();
  });
  window.addEventListener("offline", () => {
    abort?.abort();
    message = "Mất mạng — giữ dữ liệu đã nhận.";
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      lastPoll = 0;
      tick();
    }
  });
  window.addEventListener("pagehide", () => abort?.abort());
})();
