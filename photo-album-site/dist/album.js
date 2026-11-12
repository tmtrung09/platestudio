const endpoint = 'https://mapmfngikmumvghapqcu.supabase.co/functions/v1/photo-album';
const key = new URLSearchParams(location.hash.slice(1)).get('album');
const pick = document.querySelector('#pick');
const files = document.querySelector('#files');
const notice = document.querySelector('#notice');
const retry = document.querySelector('#retry');
const photos = document.querySelector('#photos');
const more = document.querySelector('#more');
const viewer = document.querySelector('#viewer');
const preview = document.querySelector('#preview');
const types = new Set(files.accept.split(','));
const maxBytes = 12 * 1024 * 1024;
let cursor = null;
let retryAction;
let previewRequest;
let selectedPhoto;
let active = true;

function status(message, action) {
  notice.textContent = message;
  retryAction = action;
  retry.hidden = !action;
}

function disableAlbum() {
  active = false;
  photoObserver.disconnect();
  photos.replaceChildren();
  if (viewer.open) viewer.close();
  pick.hidden = true;
  more.hidden = true;
  status('Link ảnh không hợp lệ hoặc đã bị tắt.');
}

async function request(query = '', { body, signal } = {}) {
  const response = await fetch(`${endpoint}${query}`, {
    method: body ? 'POST' : 'GET', body, headers: { 'x-album-key': key },
    signal: signal || AbortSignal.timeout(body ? 120_000 : 20_000),
    cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
  });
  if (response.status === 401) disableAlbum();
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'Kết nối bị gián đoạn.');
  return response;
}

function renderImage(container, blob, alt) {
  const image = document.createElement('img');
  const src = URL.createObjectURL(blob);
  image.alt = alt;
  image.addEventListener('load', () => URL.revokeObjectURL(src), { once: true });
  image.addEventListener('error', () => {
    URL.revokeObjectURL(src);
    container.textContent = 'Không tải được ảnh.';
  }, { once: true });
  image.src = src;
  container.replaceChildren(image);
}

const photoObserver = new IntersectionObserver(entries => {
  for (const { target, isIntersecting } of entries) {
    if (!isIntersecting) continue;
    photoObserver.unobserve(target);
    request(`?id=${target.dataset.photo}`).then(response => response.blob()).then(blob => {
      if (target.isConnected) renderImage(target, blob, '');
    }).catch(() => {
      if (target.isConnected) target.firstElementChild.textContent = 'Không tải được ảnh';
    });
  }
}, { rootMargin: '100px' });

function addPhoto(id, number) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'photo';
  button.dataset.photo = id;
  button.setAttribute('aria-label', `Xem ảnh ${number}`);
  const placeholder = document.createElement('span');
  placeholder.textContent = 'Đang tải ảnh…';
  button.append(placeholder);
  button.addEventListener('click', () => viewPhoto(button));
  photos.append(button);
  photoObserver.observe(button);
}

async function viewPhoto(button) {
  const controller = new AbortController();
  previewRequest = controller;
  selectedPhoto = button;
  preview.textContent = 'Đang tải ảnh…';
  viewer.showModal();
  try {
    const response = await request(`?id=${button.dataset.photo}&full=1`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    });
    const blob = await response.blob();
    if (!controller.signal.aborted) renderImage(preview, blob, 'Ảnh trong album');
  } catch {
    if (!controller.signal.aborted && active) preview.textContent = 'Không tải được ảnh. Đóng ảnh và thử lại.';
  }
}

async function loadPhotos(append = false, message = '') {
  more.disabled = true;
  status(message || 'Đang tải ảnh…');
  try {
    const response = await request(append && cursor ? `?before=${cursor}` : '');
    const result = await response.json();
    if (!active) return;
    if (!append) {
      photoObserver.disconnect();
      photos.replaceChildren();
    }
    const firstNumber = photos.childElementCount + 1;
    result.images.forEach((id, index) => addPhoto(id, firstNumber + index));
    cursor = result.next;
    more.hidden = !cursor;
    pick.hidden = false;
    status(message || (photos.childElementCount ? '' : 'Chưa có ảnh trong album.'));
  } catch {
    if (active) status('Chưa tải được album.', () => loadPhotos(append, message));
  } finally {
    more.disabled = false;
  }
}

async function upload(chosen) {
  const accepted = chosen.filter(file => file.size && file.size <= maxBytes && types.has(file.type));
  const excluded = chosen.length - accepted.length;
  if (!accepted.length) {
    status('Chọn ảnh JPG, PNG, WebP hoặc GIF tối đa 12 MB mỗi ảnh.');
    return;
  }
  pick.disabled = true;
  more.disabled = true;
  const failed = [];
  for (const [index, file] of accepted.entries()) {
    if (!active) break;
    status(`Đang tải ảnh ${index + 1}/${accepted.length}…`);
    try {
      await request('', { body: file });
    } catch {
      failed.push(file);
    }
  }
  pick.disabled = false;
  if (!active) return;
  const message = `Đã nhận ${accepted.length - failed.length}/${accepted.length} ảnh.` +
    (excluded ? ` ${excluded} tệp sai định dạng hoặc vượt 12 MB.` : '') +
    (failed.length ? ` ${failed.length} ảnh tải thất bại.` : '');
  if (failed.length === accepted.length) {
    more.disabled = false;
    status(message, () => upload(failed));
    return;
  }
  await loadPhotos(false, message);
  if (active && failed.length) status(message, () => upload(failed));
}

pick.addEventListener('click', () => files.click());
files.addEventListener('change', () => {
  const chosen = [...files.files];
  files.value = '';
  if (chosen.length) upload(chosen);
});
retry.addEventListener('click', () => retryAction?.());
more.addEventListener('click', () => loadPhotos(true));
viewer.addEventListener('close', () => {
  previewRequest?.abort();
  preview.replaceChildren();
  selectedPhoto?.focus();
});
window.addEventListener('hashchange', () => location.reload());

if (key && /^[a-f0-9]{64}$/.test(key)) loadPhotos();
else disableAlbum();
