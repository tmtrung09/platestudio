import { createClient } from "npm:@supabase/supabase-js@2.117.0";
import {
  applyTelemetry,
  applyPresence,
  issueFor,
  matchTask,
} from "../../../printer-core.mjs";
import { monitorMqtt } from "./mqtt.mjs";
import catalog from "./hms-en.json" with { type: "json" };
import translations from "./hms-vi.json" with { type: "json" };
import attribution from "./catalog-attribution.json" with {type:"json"};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
const enc = new TextEncoder();
const key = async () =>
  crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest(
      "SHA-256",
      enc.encode(
        "plate-printer-session-v1:" + Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
      ),
    ),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
const base64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unbase64 = (s: string) =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function seal(session: unknown, workspace: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return {
    iv: base64(iv),
    cipher: base64(
      new Uint8Array(
        await crypto.subtle.encrypt(
          { name: "AES-GCM", iv, additionalData: enc.encode(workspace) },
          await key(),
          enc.encode(JSON.stringify(session)),
        ),
      ),
    ),
  };
}
async function unseal(data: any, workspace: string) {
  return JSON.parse(
    new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: unbase64(data.iv),
          additionalData: enc.encode(workspace),
        },
        await key(),
        unbase64(data.cipher),
      ),
    ),
  );
}
const base = (region: string) =>
  region === "China" ? "https://api.bambulab.cn" : "https://api.bambulab.com";
async function cloud(
  region: string,
  path: string,
  body?: unknown,
  token?: string,
  empty = false,
) {
  const response = await fetch(base(region) + path, {
    method: body ? "POST" : "GET",
    headers: {
      "User-Agent": "PlateStudio/1.0 (personal-printer-monitor)",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(
      response.status === 401 || response.status === 403
        ? "Bambu từ chối phiên/quyền truy cập. Hãy đăng nhập lại."
        : response.status === 429
          ? "Bambu giới hạn yêu cầu. Chờ một lúc rồi thử lại."
          : `Bambu trả HTTP ${response.status}.`,
    );
  const raw = await response.text();
  if (!raw && empty) return { accepted: true };
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      "Bambu trả dữ liệu khác dự kiến. Nếu đã nhận mã email, vẫn có thể nhập mã để xác nhận.",
    );
  }
  if (data.code !== undefined && !["0", "200", ""].includes(String(data.code)))
    throw new Error(
      "Bambu chưa chấp nhận yêu cầu. Kiểm tra mã email mới nhất hoặc thử lại sau.",
    );
  return data;
}
async function devices(session: any) {
  const data = await cloud(
    session.region,
    "/v1/iot-service/api/user/bind",
    undefined,
    session.token,
  );
  if (!Array.isArray(data.devices))
    throw new Error("Bambu chưa trả danh sách máy.");
  return data.devices
    .map((d: any) => ({
      id: String(d.dev_id || ""),
      name: String(d.name || "Máy in").slice(0, 120),
      model: String(
        d.dev_product_name ||
          ({ C12: "P1S", C11: "P1P", N2S: "A1", N1: "A1 mini" } as any)[
            d.dev_model_name
          ] ||
          d.dev_model_name ||
          "Bambu",
      ).replace("Bambu Lab ", ""),
      online: typeof d.online==='boolean'?d.online:null,
    }))
    .filter((d: any) => /^[\w-]{1,100}$/.test(d.id))
    .slice(0, 64);
}
const check = (result: any) => {
  if (result.error)
    throw new Error(
      "Chưa lưu được dữ liệu theo dõi. Giữ trạng thái cũ và thử lại.",
    );
  return result.data;
};
export async function handle(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    if (Number(req.headers.get("content-length") || 0) > 8192)
      return json({ error: "Yêu cầu quá lớn" }, 413);
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer "))
      return json({ error: "Cần đăng nhập Plate Studio" }, 401);
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData, error: userError } = await admin.auth.getUser(
      auth.slice(7),
    );
    if (userError || !userData.user)
      return json({ error: "Phiên Plate Studio đã hết hạn" }, 401);
    const body = await req.json(),
      workspace = String(body.workspaceId || "");
    if (!/^[a-f0-9-]{36}$/.test(workspace))
      return json({ error: "Thiếu workspace" }, 400);
    const ws = check(
      await admin
        .from("workspaces")
        .select("owner_user_id")
        .eq("id", workspace)
        .maybeSingle(),
    );
    const member = check(
      await admin
        .from("workspace_members")
        .select("permissions")
        .eq("workspace_id", workspace)
        .eq("user_id", userData.user.id)
        .maybeSingle(),
    );
    const owner = ws?.owner_user_id === userData.user.id;
    if (
      !owner &&
      (!member ||
        !["progress.view", "plates.plan"].some((p) =>
          member.permissions?.includes(p),
        ))
    )
      return json({ error: "Không có quyền xem máy của workspace này" }, 403);
    const action = String(body.action || "read");
    if(action==='about')return json({attribution});
    if (["email", "connect", "disconnect"].includes(action) && !owner)
      return json({ error: "Chỉ chủ xưởng kết nối tài khoản Bambu" }, 403);
    if (action === "email") {
      const email = String(body.email || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)
        return json({ error: "Email không hợp lệ" }, 400);
      if (
        !check(
          await admin.rpc("claim_printer_login_code", {
            p_workspace: workspace,
          }),
        )
      )
        return json({ error: "Chờ 60 giây trước khi gửi mã email mới." }, 429);
      await cloud(
        body.region === "China" ? "China" : "Global",
        "/v1/user-service/user/sendemail/code",
        { email, type: "codeLogin" },
        undefined,
        true,
      );
      return json({ ok: true });
    }
    if (action === "connect") {
      const email = String(body.email || "").trim(),
        code = String(body.code || "").trim(),
        region = body.region === "China" ? "China" : "Global";
      if (
        !email.includes("@") ||
        email.length > 254 ||
        !/^\d{4,12}$/.test(code)
      )
        return json({ error: "Kiểm tra email và mã xác nhận" }, 400);
      const login = await cloud(region, "/v1/user-service/user/login", {
        account: email,
        code,
      });
      if (typeof login.accessToken !== "string" || !login.accessToken)
        return json({ error: "Bambu chưa cấp phiên đăng nhập" }, 401);
      const preference = await cloud(
        region,
        "/v1/design-user-service/my/preference",
        undefined,
        login.accessToken,
      );
      if (!preference.uid)
        return json({ error: "Chưa đọc được định danh Bambu" }, 502);
      const session = {
        token: login.accessToken,
        username: "u_" + String(preference.uid),
        region,
      };
      const list = await devices(session);
      // Confirm the actual MQTT reading permission before replacing a working login.
      if (list.length) {
        const probe = new AbortController(),
          timer = setTimeout(() => probe.abort(), 25000);
        let ready = false;
        try {
          await monitorMqtt(
            (options: any) => Deno.connectTls(options),
            session,
            list.map((d: any) => d.id),
            async () => {},
            probe.signal,
            {
              onReady: async () => {
                ready = true;
                probe.abort();
              },
            },
          );
        } finally {
          clearTimeout(timer);
        }
        if (!ready)
          throw new Error(
            "Bambu Cloud chưa xác nhận quyền đọc máy. Liên kết cũ vẫn được giữ.",
          );
      }
      // Do not replace the working connection until authentication AND devices succeeded.
      check(
        await admin
          .from("printer_cloud_connections")
          .upsert({
            workspace_id: workspace,
            sealed_session: await seal(session, workspace),
            connected_by: userData.user.id,
            updated_at: new Date().toISOString(),
            lease_token: null,
            lease_until: null,
          }),
      );
      return json({ ok: true, devices: list });
    }
    if (action === "disconnect") {
      check(
        await admin
          .from("printer_cloud_connections")
          .delete()
          .eq("workspace_id", workspace),
      );
      return json({ ok: true });
    }
    if (action === "models") {
      if (!owner && !member?.permissions?.includes("plates.plan"))
        return json({ error: "Không có quyền ghép model cho mẻ" }, 403);
      const id = String(body.runId || ""),
        items = body.models;
      if (!id || !Array.isArray(items) || items.length > 100)
        return json({ error: "Danh sách model không hợp lệ" }, 400);
      const ids = [
        ...new Set(items.map((item: any) => String(item.modelId || ""))),
      ];
      const available = ids.length
        ? check(
            await admin
              .from("models")
              .select("id,data")
              .eq("workspace_id", workspace)
              .in("id", ids),
          )
        : [];
      const linked = [];
      for (const item of items) {
        const model = available.find(
            (row: any) => row.id === item.modelId,
          )?.data,
          variant = item.variantId
            ? model?.variants?.find((v: any) => v.id === item.variantId)
            : null;
        if (
          !model ||
          (item.variantId && !variant) ||
          !Number.isInteger(item.qty) ||
          item.qty < 1 ||
          item.qty > 99999
        )
          return json(
            { error: "Model/biến thể/số lượng không hợp lệ trong workspace" },
            400,
          );
        linked.push({
          modelId: item.modelId,
          modelName: model.name,
          variantId: variant?.id || null,
          variantName: variant?.name || "",
          qty: item.qty,
          image: model.images?.[0] || null,
        });
      }
      if (!body.revision || !Number.isFinite(Date.parse(body.revision)))
        return json({ error: "Cần tải lại mẻ trước khi lưu" }, 400);
      const saved = check(
        await admin
          .from("printer_monitor_runs")
          .update({
            linked_models: linked,
            links_revision: new Date().toISOString(),
          })
          .eq("workspace_id", workspace)
          .eq("id", id)
          .eq("links_revision", body.revision)
          .select("id"),
      );
      if (!saved.length)
        return json(
          {
            error:
              "Mẻ đã đổi trên thiết bị khác. Giữ lựa chọn, tải lại mẻ rồi lưu lại.",
          },
          409,
        );
      return json({ ok: true });
    }
    const connection = check(
      await admin
        .from("printer_cloud_connections")
        .select("sealed_session")
        .eq("workspace_id", workspace)
        .maybeSingle(),
    );
    if (action === "read") {
      if(body.runId){const run=check(await admin.from('printer_monitor_runs').select('id,data,linked_models,links_revision,updated_at').eq('workspace_id',workspace).eq('id',String(body.runId)).maybeSingle());return run?json({run}):json({error:'Mẻ chưa có trong workspace này'},404);}
      const state = check(
        await admin
          .from("printer_monitor_states")
          .select("data,updated_at")
          .eq("workspace_id", workspace)
          .maybeSingle(),
      );
      const cursor = Math.max(0, Number(body.cursor) || 0),
        events = check(
          await admin
            .from("printer_monitor_events")
            .select("seq,data")
            .eq("workspace_id", workspace)
            .gt("seq", cursor)
            .order("seq", { ascending: !body.initial })
            .limit(100),
        );
      const history = body.history===false?null:check(
        await admin
          .from("printer_monitor_runs")
          .select("id,data,linked_models,links_revision,updated_at")
          .eq("workspace_id", workspace)
          .order("updated_at", { ascending: false })
          .range(
            Math.max(0, Number(body.offset) || 0),
            Math.max(0, Number(body.offset) || 0) + 49,
          ),
      );
      return json({
        connected: !!connection,
        state: state?.data || { devices: {} },
        updatedAt: state?.updated_at || null,
        events,
        history,
        moreEvents: events.length === 100,
        moreHistory: history?history.length === 50:undefined,
      });
    }
    if (action !== "stream")
      return json({ error: "Thao tác không hợp lệ" }, 400);
    if (!connection) return json({ error: "Chưa kết nối Bambu Cloud" }, 409);
    const token = crypto.randomUUID();
    if (
      !check(
        await admin.rpc("claim_printer_monitor", {
          p_workspace: workspace,
          p_token: token,
        }),
      )
    )
      return json({ busy: true });
    let session, list: any[];
    try {
      session = await unseal(connection.sealed_session, workspace);
      list = await devices(session);
    } catch (error) {
      await admin
        .from("printer_cloud_connections")
        .update({ lease_until: null })
        .eq("workspace_id", workspace)
        .eq("lease_token", token);
      throw error;
    }
    const stored = check(
      await admin
        .from("printer_monitor_states")
        .select("data")
        .eq("workspace_id", workspace)
        .maybeSingle(),
    );
    let snapshot: any = stored?.data || { devices: {} };
    snapshot.devices ||= {};
    const abort = new AbortController();
    let closed = false;
    const stream = new ReadableStream({
      start(controller) {
        const send = (data: unknown) => {
          if (!closed)
            controller.enqueue(enc.encode(JSON.stringify(data) + "\n"));
        };
        const stop = () => {
          abort.abort();
        };
        req.signal.addEventListener("abort", stop, { once: true });
        const timeout = setTimeout(stop, 85000),
          heartbeat = setInterval(() => send({ kind: "heartbeat" }), 12000);
        const commit = async (events: any[], runs: any[]) => {
          check(
            await admin.rpc("commit_printer_monitor", {
              p_workspace: workspace,
              p_token: token,
              p_state: snapshot,
              p_events: events,
              p_runs: runs,
            }),
          );
        };
        const work = (async () => {
          try {
            const presenceEvents: any[] = [];
            for (const d of list) {
              const previous = snapshot.devices[d.id];
              if (previous) {
                const result = applyPresence(
                  previous,
                  d.online,
                  new Date().toISOString(),
                );
                snapshot.devices[d.id] = result.state;
                presenceEvents.push(...result.events);
              } else
                snapshot.devices[d.id] = {
                  ...d,
                  phase: "UNKNOWN",
                  issues: [],
                  serial: 0,
                };
            }
            snapshot.boundDevices = list;
            snapshot.connectionObservedAt = new Date().toISOString();
            await commit(presenceEvents, []);
            send({ kind: "connecting", devices: list });
            let tasks: any = null;
            try {
              tasks = await cloud(
                session.region,
                "/v1/user-service/my/tasks?limit=50",
                undefined,
                session.token,
              );
            } catch {
              /* A missing cover must never interrupt live telemetry. */
            }
            const enrich = (state: any) => {
              const task = matchTask(tasks, state);
              if (!task || !state.run) return;
              const cover = String(task.cover || "");
              if (/^https:\/\//.test(cover)) {
                try {
                  const url = new URL(cover);
                  if (!url.username && !url.password)
                    state.run.thumbnail = url.href;
                } catch {}
              }
              state.run.cloudTask = {
                id: String(task.id),
                deviceId: String(task.deviceId),
                source: "Bambu Cloud",
              };
            };
            const requests = list
              .filter(
                (d) =>
                  Date.now() -
                    Date.parse(
                      snapshot.devices[d.id]?.lastSnapshotRequest ||
                        "1970-01-01",
                    ) >
                  300000,
              )
              .map((d) => d.id);
            await monitorMqtt(
              (options: any) => Deno.connectTls(options),
              session,
              list.map((d) => d.id),
              async (id: string, payload: any) => {
                const d = list.find((d) => d.id === id);
                if (!d) return;
                const result = applyTelemetry(
                  snapshot.devices[id],
                  d,
                  payload,
                  new Date().toISOString(),
                  (kind: string, code: string, model: string) =>
                    issueFor(kind, code, model, catalog, translations),
                );
                if (result.state) {
                  enrich(result.state);
                  snapshot.devices[id] = result.state;
                  await commit(result.events, result.runs);
                  send({ kind: "update" });
                }
              },
              abort.signal,
              {
                requestSnapshots: requests,
                onReady: async () => {
                  for (const id of requests)
                    snapshot.devices[id].lastSnapshotRequest =
                      new Date().toISOString();
                  await commit([], []);
                  send({ kind: "connected" });
                },
              },
            );
          } catch (error) {
            if (!abort.signal.aborted)
              send({
                kind: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : "Chưa nhận được trạng thái máy",
              });
          } finally {
            clearInterval(heartbeat);
            clearTimeout(timeout);
            req.signal.removeEventListener("abort", stop);
            await admin
              .from("printer_cloud_connections")
              .update({ lease_until: null })
              .eq("workspace_id", workspace)
              .eq("lease_token", token);
            closed = true;
            try {
              controller.close();
            } catch {}
          }
        })();
        // Keep the relay alive only for this open browser request, within runtime limits.
        (globalThis as any).EdgeRuntime?.waitUntil(work);
      },
      cancel() {
        closed = true;
        abort.abort();
      },
    });
    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof Error ? error.message : "Không kết nối được máy in",
      },
      502,
    );
  }
}
