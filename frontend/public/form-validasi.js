/* eslint-disable */
// @ts-nocheck
(function () {
  var NAMA = {
    name: 'Nama Lengkap',
    full_name: 'Nama Lengkap',
    email: 'Email',
    username: 'Username',
    password: 'Password',
    new_password: 'Password Baru',
    password_confirmation: 'Konfirmasi Password',
    phone: 'Nomor Telepon',
    position: 'Jabatan',
    institution_name: 'Nama Institusi',
    negara: 'Negara',
    country: 'Negara',
    account_type: 'Jenis Akun',
    title: 'Judul',
    description: 'Deskripsi',
    start_date: 'Tanggal Mulai',
    end_date: 'Tanggal Selesai',
    subject: 'Subjek',
    message: 'Pesan',
  };

  function getLabel(el) {
    if (el.id) {
      var lbl = document.querySelector('label[for="' + el.id + '"]');
      if (lbl) return lbl.textContent.replace(/\*/g, '').trim();
    }
    if (el.name && NAMA[el.name]) return NAMA[el.name];
    if (el.placeholder) return el.placeholder.replace(/^(masukkan|pilih|isi)\s+/i, '');
    return 'Kolom ini';
  }

  function getMsg(el) {
    var v = el.validity;
    var lbl = getLabel(el);
    if (v.valueMissing) {
      return el.tagName === 'SELECT'
        ? 'Mohon pilih ' + lbl + '.'
        : 'Mohon isi ' + lbl + '.';
    }
    if (v.typeMismatch) {
      if (el.type === 'email') return 'Format email tidak valid.\nContoh: nama@domain.com';
      if (el.type === 'url') return 'Format URL tidak valid.';
      return lbl + ' tidak valid.';
    }
    if (v.patternMismatch) return el.title || lbl + ' tidak sesuai format yang diminta.';
    if (v.tooShort) return lbl + ' minimal ' + el.minLength + ' karakter.';
    if (v.tooLong) return lbl + ' maksimal ' + el.maxLength + ' karakter.';
    if (v.rangeUnderflow) return lbl + ' harus lebih besar atau sama dengan ' + el.min + '.';
    if (v.rangeOverflow) return lbl + ' harus lebih kecil atau sama dengan ' + el.max + '.';
    if (v.badInput) return lbl + ' berisi nilai yang tidak valid.';
    return lbl + ' tidak valid.';
  }

  var overlay = null;
  var modal = null;
  var isOpen = false;

  function buildModal() {
    if (modal) return;

    var style = document.createElement('style');
    style.textContent = [
      '#_sk_ov{position:fixed;inset:0;background:rgba(15,23,42,0.5);z-index:2147483646;',
      'display:none;align-items:center;justify-content:center;padding:16px;',
      'backdrop-filter:blur(2px);}',
      '#_sk_ov.aktif{display:flex;}',
      '#_sk_md{background:#fff;border-radius:16px;padding:32px 28px 24px;',
      'max-width:340px;width:100%;box-shadow:0 24px 64px rgba(15,23,42,0.28);',
      'transform:scale(0.9);opacity:0;',
      'transition:transform 0.2s cubic-bezier(0.34,1.56,0.64,1),opacity 0.2s ease;}',
      '#_sk_ov.aktif #_sk_md{transform:scale(1);opacity:1;}',
      '#_sk_ok{width:100%;padding:11px;border:none;border-radius:10px;',
      'background:#f97316;color:#fff;font-size:14px;font-weight:600;',
      'cursor:pointer;margin-top:20px;',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif;}',
      '#_sk_ok:hover{background:#ea6c00;}',
    ].join('');
    document.head.appendChild(style);

    overlay = document.createElement('div');
    overlay.id = '_sk_ov';

    modal = document.createElement('div');
    modal.id = '_sk_md';
    modal.setAttribute('role', 'alertdialog');
    modal.setAttribute('aria-modal', 'true');

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isOpen) closeModal();
    });
  }

  function closeModal() {
    if (!overlay) return;
    overlay.classList.remove('aktif');
    isOpen = false;
  }

  function showModal(msg) {
    buildModal();

    var lines = msg.split('\n').map(function (l) {
      return '<span>' + l + '</span>';
    }).join('<br>');

    modal.innerHTML = [
      '<div style="display:flex;flex-direction:column;align-items:center;text-align:center">',

      '<div style="width:60px;height:60px;border-radius:50%;background:#fff7ed;',
      'display:flex;align-items:center;justify-content:center;margin-bottom:16px">',
      '<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24"',
      ' fill="none" stroke="#f97316" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>',
      '<line x1="12" y1="9" x2="12" y2="13"/>',
      '<line x1="12" y1="17" x2="12.01" y2="17"/>',
      '</svg></div>',

      '<p style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif">Kolom Belum Lengkap</p>',

      '<p style="margin:0;font-size:14px;color:#6b7280;line-height:1.6;',
      'font-family:-apple-system,BlinkMacSystemFont,sans-serif">' + lines + '</p>',

      '<button id="_sk_ok">OK</button>',
      '</div>',
    ].join('');

    modal.querySelector('#_sk_ok').addEventListener('click', closeModal);

    overlay.classList.add('aktif');
    isOpen = true;

    setTimeout(function () {
      var btn = modal.querySelector('#_sk_ok');
      if (btn) btn.focus();
    }, 50);
  }

  var firstInvalid = null;
  var batchTimer = null;

  document.addEventListener('invalid', function (e) {
    e.preventDefault();
    var el = e.target;
    if (!el || !el.validity) return;
    if (!firstInvalid) firstInvalid = el;
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(function () {
      if (firstInvalid) {
        showModal(getMsg(firstInvalid));
        firstInvalid = null;
      }
    }, 0);
  }, true);
}());
