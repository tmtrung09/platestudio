window.PhotoAlbumOwner = (() => {
  const albumUrl = 'https://anh-xuong.betweenus57btuxuong.chatgpt.site/';
  const canManage = () => Boolean(sb && currentUser?.email && cloudWorkspaceId() && activeWorkspace?.owner_user_id === currentUser.id);

  function open(reportIds = []) {
    if (!canManage() || document.querySelector('#photo-album-owner')) return;
    const workspace = cloudWorkspaceId();
    const user = currentUser.id;
    const opener = document.activeElement;
    const ids = [...new Set(reportIds)];
    const dialog = document.createElement('dialog');
    dialog.id = 'photo-album-owner';
    dialog.className = 'photo-album-owner';
    dialog.setAttribute('aria-labelledby', 'photo-album-owner-title');
    dialog.innerHTML = `<h2 id="photo-album-owner-title">Album ảnh</h2>
      <p data-status role="status"></p>
      <button class="btn btn-ghost" type="button" data-retry hidden>Thử lại</button>
      <div data-link hidden>
        <label for="photo-album-link">Link gửi người xem</label>
        <input class="inp" id="photo-album-link" readonly>
        <button class="btn btn-ac" type="button" data-copy>Sao chép link</button>
      </div>
      <div class="dlg-actions">
        ${ids.length ? `<button class="btn btn-ac" type="button" data-action="share">Chia sẻ ${ids.length} ảnh đã chọn</button>
          <button class="btn btn-ghost" type="button" data-action="unshare">Bỏ chia sẻ ảnh đã chọn</button>` : ''}
        <button class="btn btn-ghost" type="button" data-action="rotate">Tạo link</button>
        <button class="btn btn-ghost" type="button" data-action="revoke" hidden>Tắt link</button>
        <button class="btn btn-ghost" type="button" data-close autofocus>Đóng</button>
      </div>`;
    document.body.append(dialog);
    const status = dialog.querySelector('[data-status]');
    const rotate = dialog.querySelector('[data-action="rotate"]');
    const revoke = dialog.querySelector('[data-action="revoke"]');
    const actions = [...dialog.querySelectorAll('[data-action]')];
    const retry = dialog.querySelector('[data-retry]');
    const close = dialog.querySelector('[data-close]');
    const linkGroup = dialog.querySelector('[data-link]');
    const linkInput = dialog.querySelector('#photo-album-link');
    let active = false;
    let ready = false;
    let busy = false;

    async function run(action) {
      if (busy || !canManage() || cloudWorkspaceId() !== workspace || currentUser.id !== user) {
        if (!busy) dialog.close();
        return;
      }
      if (action === 'rotate' && active && !confirm('Đổi link sẽ làm link cũ hết hiệu lực. Tiếp tục?')) return;
      if (action === 'revoke' && !confirm('Tắt link để dừng quyền mở album qua link đang dùng?')) return;
      busy = true;
      retry.hidden = true;
      close.disabled = true;
      actions.forEach(button => { button.disabled = true; });
      status.textContent = 'Đang lưu…';
      if (action === 'status') status.textContent = 'Đang kiểm tra link…';
      try {
        let key;
        const args = { p_workspace_id: workspace, p_action: action };
        if (action === 'share' || action === 'unshare') args.p_report_ids = ids;
        if (action === 'rotate') {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          const hex = data => Array.from(data, byte => byte.toString(16).padStart(2, '0')).join('');
          key = hex(bytes);
          args.p_key_hash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))));
        }
        const { data, error } = await sb.rpc('manage_photo_album', args);
        if (error) throw error;
        if (!dialog.open || !canManage() || cloudWorkspaceId() !== workspace || currentUser.id !== user) {
          dialog.close();
          return;
        }
        ready = true;
        active = data.active;
        rotate.textContent = active ? 'Đổi link' : 'Tạo link';
        revoke.hidden = !active;
        if (key) {
          linkInput.value = `${albumUrl}#album=${key}`;
          linkGroup.hidden = false;
        }
        if (!active) {
          linkInput.value = '';
          linkGroup.hidden = true;
        }
        const messages = {
          status: active ? 'Link ảnh đang hoạt động.' : 'Chưa có link ảnh đang hoạt động.',
          rotate: 'Đã tạo link. Hãy sao chép trước khi đóng.',
          revoke: 'Đã tắt link ảnh.',
          share: data.affected ? `Đã thêm ${data.affected} ảnh vào album.${active ? '' : ' Tạo link để mở album.'}` : 'Không có ảnh mới được thêm. Ảnh cần được lưu lên cloud trước khi chia sẻ.',
          unshare: `Đã bỏ chia sẻ ${data.affected} ảnh.`,
        };
        status.textContent = messages[action];
      } catch {
        status.textContent = 'Chưa cập nhật được album. Vui lòng thử lại.';
        retry.hidden = ready;
      } finally {
        busy = false;
        close.disabled = false;
        actions.forEach(button => { button.disabled = !ready; });
      }
    }

    actions.forEach(button => button.addEventListener('click', () => run(button.dataset.action)));
    retry.addEventListener('click', () => run('status'));
    dialog.querySelector('[data-copy]').addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(linkInput.value);
        status.textContent = 'Đã sao chép link ảnh.';
      } catch {
        linkInput.select();
        status.textContent = 'Sao chép đường dẫn đang được bôi đen.';
      }
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', event => {
      if (busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      opener?.focus();
    });
    dialog.showModal();
    run('status');
  }

  return { canManage, open };
})();
