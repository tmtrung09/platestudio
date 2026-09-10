/**
 * Regression check for the local KiotViet bridge range queue.
 * It uses an isolated temporary state directory and never opens Chrome,
 * downloads files, or touches workshop data.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const server = new URL('./kiotviet-sync-server.cjs', import.meta.url);
const stateDir = mkdtempSync(join(tmpdir(), 'plate-studio-kiot-qa-'));
const port = 42000 + Math.floor(Math.random() * 1000);
const child = spawn(process.execPath, [fileURLToPath(server)], {
  env: { ...process.env, PLATE_STUDIO_SYNC_PORT: String(port), LOCALAPPDATA: stateDir },
  stdio: 'ignore', windowsHide: true,
});
const base = `http://127.0.0.1:${port}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const extensionSource = readFileSync(new URL('./kiotviet-chrome-extension/content.js', import.meta.url), 'utf8');
async function request(path, options = {}) {
  const response = await fetch(base + path, { headers: { 'Content-Type': 'application/json' }, ...options });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || `${response.status}`);
  return payload;
}

try {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await request('/health'); break; } catch { if (attempt === 29) throw new Error('Bridge QA không khởi động.'); await sleep(100); }
  }
  const first = await request('/range/run', { method: 'POST', body: JSON.stringify({ days: ['2026-08-03', '2026-08-04'], report: 'sales-by-product' }) });
  assert.equal(first.range.total, 2, 'Hàng chờ phải giữ đúng số ngày thiếu');
  assert.equal(first.job.origin, 'range', 'Job bù phải được phân biệt với job Hôm qua');
  assert.equal(first.job.period, 'custom-day', 'Job bù không được rơi về Hôm qua/Năm nay');
  assert.equal(first.job.reportDay, '2026-08-03', 'Phải lấy ngày thiếu đầu tiên trước');

  const second = await request('/acknowledge', { method: 'POST', body: JSON.stringify({ id: first.job.id }) });
  assert.equal(second.job.origin, 'range', 'Nhập xong một ngày phải tự xếp ngày tiếp theo');
  assert.equal(second.job.reportDay, '2026-08-04', 'Không được bỏ qua ngày thiếu tiếp theo');

  const final = await request('/acknowledge', { method: 'POST', body: JSON.stringify({ id: second.job.id }) });
  assert.equal(final.range.status, 'idle', 'Xong hàng chờ phải không tạo thêm job');
  assert.match(extensionSource, /#reportsortOtherLbl/, 'Bù ngày phải mở bộ lọc Tùy chỉnh đã được ghi mẫu');
  assert.match(extensionSource, /#fromDate/, 'Bù ngày phải đặt lịch Từ ngày theo selector đã ghi mẫu');
  assert.match(extensionSource, /\.k-calendar/, 'Bù ngày phải nhận diện đủ hai lịch Kendo, kể cả lịch Đến ngày không có ID ổn định');
  assert.match(extensionSource, /\.k-nav-next/, 'Bù ngày tháng cũ phải tự chuyển lịch tiến/lùi theo tháng đích');
  assert.match(extensionSource, /td:not\(\.k-other-month\)/, 'Bù ngày phải chọn ô ngày đúng tháng, không nhầm ngày cùng số ở tháng kề');
  assert.doesNotMatch(extensionSource, /window\.jQuery\|\|window\.\$/, 'Content script không được phụ thuộc API Kendo nội bộ không truy cập được từ isolated world');
  assert.match(extensionSource, /Tạo báo cáo/, 'Bù ngày phải xác nhận tạo đúng báo cáo trước khi xuất file');
  assert.doesNotMatch(extensionSource, /if\(job\.period==='custom-day'\)throw/, 'Không được khóa job bù sau khi đã có mẫu thao tác');
  console.log(JSON.stringify({ summary: { passed: 15, failed: 0 }, range: 'sequential custom-day queue and calendar navigation' }, null, 2));
} finally {
  child.kill();
  rmSync(stateDir, { recursive: true, force: true });
}
