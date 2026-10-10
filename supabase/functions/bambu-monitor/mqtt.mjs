const utf8 = new TextEncoder(),
  decode = new TextDecoder();
const join = (...chunks) => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
};
const word = (n) => new Uint8Array([n >> 8, n & 255]);
const text = (s) => {
  const b = utf8.encode(s);
  if (b.length > 65535) throw new Error("Chuỗi MQTT quá dài");
  return join(word(b.length), b);
};
export function packet(header, body) {
  let n = body.length;
  const size = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 128;
    size.push(b);
  } while (n);
  return join(new Uint8Array([header, ...size]), body);
}
export const connectPacket = (username, token) =>
  packet(
    0x10,
    join(
      text("MQTT"),
      new Uint8Array([4, 0xc2, 0, 30]),
      text("plate-web-" + crypto.randomUUID()),
      text(username),
      text(token),
    ),
  );
export function subscribePacket(ids) {
  return packet(
    0x82,
    join(
      word(1),
      ...ids.map((id) =>
        join(text("device/" + id + "/report"), new Uint8Array([0])),
      ),
    ),
  );
}
// This is a snapshot request, not a printer control command. No caller can set it.
export const snapshotPacket = (id) =>
  packet(
    0x30,
    join(
      text("device/" + id + "/request"),
      utf8.encode(
        JSON.stringify({ pushing: { sequence_id: "0", command: "pushall" } }),
      ),
    ),
  );
export class PacketDecoder {
  constructor() {
    this.buffer = new Uint8Array(0);
  }
  push(bytes) {
    if (this.buffer.length + bytes.length > 2200000)
      throw new Error("Báo cáo MQTT quá lớn");
    this.buffer = join(this.buffer, bytes);
    const messages = [];
    while (this.buffer.length >= 2) {
      let length = 0,
        multiplier = 1,
        p = 1,
        b;
      do {
        if (p >= this.buffer.length) return messages;
        b = this.buffer[p++];
        length += (b & 127) * multiplier;
        multiplier *= 128;
        if (p > 5 || (p === 5 && b & 128))
          throw new Error("Độ dài MQTT không hợp lệ");
      } while (b & 128);
      if (length > 2000000) throw new Error("Báo cáo MQTT quá lớn");
      if (this.buffer.length < p + length) break;
      messages.push({
        header: this.buffer[0],
        body: this.buffer.slice(p, p + length),
      });
      this.buffer = this.buffer.slice(p + length);
    }
    return messages;
  }
}
/** @param {{requestSnapshots?: string[], onReady?: () => Promise<void>}} options */
export async function monitorMqtt(
  connect,
  session,
  ids,
  onReport,
  signal,
  options = {},
) {
  const { requestSnapshots = [], onReady = async () => {} } = options;
  if (!ids.length) return;
  let conn,
    closed = false,
    writeChain = Promise.resolve(),
    ping;
  const stop = () => {
    closed = true;
    try {
      conn?.close();
    } catch {}
    clearInterval(ping);
  };
  signal.addEventListener("abort", stop, { once: true });
  const write = (bytes) => {
    writeChain = writeChain.then(async () => {
      let p = 0;
      while (p < bytes.length) {
        if (closed) throw new Error("Kết nối đã đóng");
        const n = await conn.write(bytes.subarray(p));
        if (n <= 0) throw new Error("Không gửi được bản tin MQTT");
        p += n;
      }
    });
    return writeChain;
  };
  try {
    const pending = connect({
      hostname:
        session.region === "China"
          ? "cn.mqtt.bambulab.com"
          : "us.mqtt.bambulab.com",
      port: 8883,
    });
    pending.then(
      (c) => {
        if (closed) c.close();
      },
      () => {},
    );
    conn = await Promise.race([
      pending,
      new Promise((_, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Chưa kết nối được Bambu Cloud")),
          15000,
        );
        pending.finally(() => clearTimeout(timer)).catch(() => {});
      }),
    ]);
    if (signal.aborted) {
      stop();
      return;
    }
    await write(connectPacket(session.username, session.token));
    const decoder = new PacketDecoder(),
      buf = new Uint8Array(65536);
    let accepted = false;
    const authTimer = setTimeout(stop, 18000);
    try {
      while (!closed) {
        const n = await conn.read(buf);
        if (n === null) throw new Error("Kết nối Bambu Cloud bị ngắt");
        for (const msg of decoder.push(buf.subarray(0, n))) {
          const type = msg.header >> 4;
          if (type === 2) {
            if (msg.body.length !== 2 || msg.body[1] !== 0)
              throw new Error(
                "Bambu Cloud từ chối phiên đăng nhập. Hãy kết nối lại tài khoản.",
              );
            await write(subscribePacket(ids));
          } else if (type === 9) {
            if (
              msg.body.length !== ids.length + 2 ||
              msg.body[0] !== 0 ||
              msg.body[1] !== 1 ||
              msg.body.slice(2).some((c) => c >= 128)
            )
              throw new Error("Bambu Cloud từ chối quyền đọc máy.");
            accepted = true;
            clearTimeout(authTimer);
            ping = setInterval(
              () => write(packet(0xc0, new Uint8Array(0))).catch(stop),
              20000,
            );
            for (const id of requestSnapshots.filter((id) => ids.includes(id)))
              await write(snapshotPacket(id));
            await onReady();
          } else if (type === 3 && accepted) {
            if (msg.body.length < 2)
              throw new Error("Báo cáo MQTT không hợp lệ");
            const len = msg.body[0] * 256 + msg.body[1];
            let p = 2 + len;
            if (p > msg.body.length) throw new Error("Topic MQTT không hợp lệ");
            const topic = decode.decode(msg.body.subarray(2, p)),
              parts = topic.split("/");
            const qos = (msg.header >> 1) & 3;
            if (qos === 1) {
              if (p + 2 > msg.body.length)
                throw new Error("MQTT thiếu packet ID");
              await write(packet(0x40, msg.body.slice(p, p + 2)));
              p += 2;
            } else if (qos > 1) throw new Error("QoS không được hỗ trợ");
            if (
              parts.length !== 3 ||
              parts[0] !== "device" ||
              parts[2] !== "report" ||
              !ids.includes(parts[1])
            )
              continue;
            try {
              const payload = JSON.parse(decode.decode(msg.body.subarray(p)));
              await onReport(parts[1], payload);
            } catch (error) {
              if (error instanceof SyntaxError) continue;
              throw error;
            }
          }
        }
      }
      if (!accepted && !signal.aborted)
        throw new Error("Bambu Cloud chưa xác nhận kết nối.");
    } finally {
      clearTimeout(authTimer);
    }
  } finally {
    stop();
    signal.removeEventListener("abort", stop);
  }
}
