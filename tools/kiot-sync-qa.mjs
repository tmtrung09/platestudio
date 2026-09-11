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
  const workerSource = readFileSync(new URL('./kiotviet-chrome-extension/service-worker.js', import.meta.url), 'utf8');
  assert.match(workerSource, /#fromDate/, 'Bù ngày phải đặt lịch Từ ngày theo selector đã ghi mẫu');
  assert.match(extensionSource, /plate-studio-set-kiot-date-range/, 'Content script phải yêu cầu main world đặt cả Từ ngày và Đến ngày');
  assert.match(extensionSource, /plate-studio-create-kiot-date-report/, 'Bù ngày phải kích hoạt Tạo báo cáo qua main world');
  assert.match(extensionSource, /__plateStudioKiotRangeSessionId/, 'Các ngày trong cùng lượt bù phải dùng marker phiên làm việc chung');
  assert.match(extensionSource, /if\(!continueRange\)/, 'Ngày tiếp theo chỉ được bỏ qua phần chọn chế độ/nhóm hàng khi cùng lượt bù');
  assert.match(extensionSource, /pendingApplication/, 'Nhóm hàng phải chấp nhận cả KiotViet tự áp dụng lẫn nút Áp dụng');
  assert.match(workerSource, /world:'MAIN'/, 'Kendo phải được gọi trong main world, không phải isolated content script');
  assert.match(workerSource, /kendoCalendar/, 'Bù ngày phải dùng widget lịch thật của KiotViet');
  assert.match(workerSource, /filterbyDateRange\(\)/, 'Nút Tạo báo cáo phải gọi đúng handler Angular của KiotViet');
  assert.match(workerSource, /normal\(node\.textContent\)==='tao bao cao'/, 'Nút Tạo báo cáo phải có fallback theo nhãn khi KiotViet đổi ng-click');
  assert.match(workerSource, /job\?\.origin==='range'&&job\?\.period==='custom-day'&&job\?\.rangeId/, 'Job bù ngày tiếp theo không được reload lại tab Báo cáo');
  assert.match(workerSource, /await new Promise\(resolve=>setTimeout\(resolve,260\)\)/, 'Sau khi chọn Từ ngày phải chờ KiotViet render lại lịch Đến ngày');
  assert.match(workerSource, /const refreshed=calendarEntries\(\)/, 'Phải truy vấn lại lịch Đến ngày sau khi lịch hai cột đổi trạng thái');
  assert.match(workerSource, /selectedFrom!==requestedDay\|\|selectedTo!==requestedDay/, 'Phải đọc lại hai ngày trước khi cho phép tạo báo cáo');
  assert.match(extensionSource, /Tạo báo cáo/, 'Bù ngày phải xác nhận tạo đúng báo cáo trước khi xuất file');
  assert.match(extensionSource, /không xác nhận khoảng/i, 'Nếu khoảng báo cáo sai thì phải chặn xuất file');
  assert.doesNotMatch(extensionSource, /if\(job\.period==='custom-day'\)throw/, 'Không được khóa job bù sau khi đã có mẫu thao tác');
  console.log(JSON.stringify({ summary: { passed: 21, failed: 0 }, range: 'sequential custom-day queue with session reuse and date verification' }, null, 2));
} finally {
  child.kill();
  rmSync(stateDir, { recursive: true, force: true });
}
