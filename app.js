(function () {
  'use strict';

  var API = 'https://script.google.com/macros/s/AKfycby9s1bltrveC6osNaUzBPVYRt3ZjANjL3OErNJ3kSsofGpy-d2rjIMn0dz-BNyoHGsF/exec';
  var SPEC = window.DEPO;
  var Q = SPEC.q;
  var OTHER = '__other';
  var DRAFT = 'depoPA2_draft', DONE = 'depoPA2_done';
  var FLOWS = ['full', 'short'];

  var S = { code: '', page: 0, t0: 0, ans: {}, oth: {} };
  var $ = function (id) { return document.getElementById(id); };
  var screens = { full: [], short: [] };
  var busy = false;

  function store(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function load(k) { try { return JSON.parse(sessionStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function drop(k) { try { sessionStorage.removeItem(k); } catch (e) {} }
  function save() { if (S.code) store(DRAFT, S); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Keeps "Đề-Pô" on one line so the hyphen never splits the brand name.
  function rich(tag, cls, text) {
    var e = el(tag, cls);
    text.split('Đề-Pô').forEach(function (part, i) {
      if (i) e.appendChild(el('span', 'nb', 'Đề-Pô'));
      e.appendChild(document.createTextNode(part));
    });
    return e;
  }

  function flow() { return SPEC.shortSegs.indexOf(S.ans.seg) >= 0 ? 'short' : 'full'; }
  function pages() { return SPEC.flows[flow()]; }
  function boxes(key) { return document.querySelectorAll('.qb[data-key="' + key + '"]'); }
  function active(key) { var c = Q[key].if; return !c || S.ans[c.k] === c.v; }
  function rowsFor(q, fl) {
    var only = q.rowsBy && q.rowsBy[fl];
    return only ? q.rows.filter(function (r) { return only.indexOf(r[0]) >= 0; }) : q.rows;
  }
  function gridAns(key) { var g = S.ans[key]; return g && typeof g === 'object' ? g : {}; }

  function picked(key) {
    var v = S.ans[key];
    if (Q[key].type === 'many') return v || [];
    return v == null || v === '' ? [] : [v];
  }

  // A row of numbered buttons with the two end labels under it; used by the 1–5 questions and grid rows.
  function rateRow(key, row, labels, na) {
    var wrap = el('div', 'rate' + (na ? ' has-na' : ''));
    wrap.setAttribute('role', 'radiogroup');
    var vals = [1, 2, 3, 4, 5];
    if (na) vals.push(na);
    vals.forEach(function (v) {
      var b = el('button', 'rb' + (v === na ? ' na' : ''), String(v));
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('data-v', String(v));
      b.setAttribute('aria-label', v === na ? na : v + ' – ' + labels[v - 1]);
      b.addEventListener('click', function () {
        if (row) { var g = gridAns(key); g[row] = v; S.ans[key] = g; }
        else S.ans[key] = v;
        afterPick(key);
      });
      wrap.appendChild(b);
    });
    var ends = el('div', 'ends' + (na ? ' has-na' : ''));
    ends.appendChild(el('span', '', labels[0]));
    ends.appendChild(el('span', '', labels[4]));
    var box = el('div', 'rwrap');
    if (row) box.setAttribute('data-row', row);
    box.appendChild(wrap);
    box.appendChild(ends);
    return box;
  }

  function buildQuestion(fl, key) {
    var q = Q[key];
    var box = el('div', 'card qb');
    box.setAttribute('data-key', key);
    var name = fl + '-' + key;
    box.appendChild(el('span', 'qn'));
    var title = rich('p', 'q', ((q.tBy && q.tBy[fl]) || q.t) + ' ');
    title.appendChild(q.type === 'text' && !q.req ? el('span', 'opt-tag', '(Không bắt buộc)') : el('span', 'req', '*'));
    box.appendChild(title);
    if (q.h) box.appendChild(rich('p', 'hint', q.h));
    box.appendChild(el('p', 'err'));

    if (q.type === 'text') {
      var t = el('textarea');
      t.maxLength = 300;
      t.placeholder = q.ph || 'Bạn có thể bỏ qua nếu chưa nghĩ ra';
      if (q.req) t.rows = 2;
      t.setAttribute('data-text', key);
      t.addEventListener('input', function () { S.ans[key] = t.value; syncText(key, t); clearErr(key); save(); });
      box.appendChild(t);
      return box;
    }

    if (q.type === 'rate') {
      box.appendChild(rateRow(key, null, q.labels));
      box.appendChild(el('p', 'chosen'));
      return box;
    }

    if (q.type === 'grid') {
      rowsFor(q, fl).forEach(function (r, i) {
        var g = el('div', 'grow');
        g.setAttribute('data-row', r[0]);
        g.appendChild(rich('p', 'grt', (i + 1) + '. ' + r[1]));
        g.appendChild(rateRow(key, r[0], q.labels, q.na));
        box.appendChild(g);
      });
      return box;
    }

    if (q.type === 'scale') {
      var legend = el('div', 'legend');
      [['0', q.lo], ['10', q.hi]].forEach(function (p) {
        var row = el('div', 'lg-row');
        row.appendChild(el('span', 'lg-n', p[0]));
        row.appendChild(el('span', '', '= ' + p[1]));
        legend.appendChild(row);
      });
      box.appendChild(legend);
      var grid = el('div', 'scale');
      grid.setAttribute('role', 'radiogroup');
      for (var n = 0; n <= 10; n++) {
        (function (n) {
          var b = el('button', 'sc', String(n));
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.setAttribute('data-v', String(n));
          b.setAttribute('aria-label', n + ' trên 10');
          b.addEventListener('click', function () { S.ans[key] = n; afterPick(key); });
          grid.appendChild(b);
        })(n);
      }
      box.appendChild(grid);
      return box;
    }

    var wrap = el('div', 'opts');
    var list = q.o.slice();
    if (q.other) list.push(OTHER);
    list.forEach(function (v) {
      var lab = el('label', 'o' + (q.type === 'many' ? ' cb' : ''));
      var inp = el('input');
      inp.type = q.type === 'many' ? 'checkbox' : 'radio';
      inp.name = name;
      inp.value = v;
      lab.appendChild(inp);
      lab.appendChild(el('span', 'mk'));
      lab.appendChild(el('span', 'ot', v === OTHER ? 'Khác (bạn ghi rõ)' : v));
      inp.addEventListener('change', function () { onPick(key, v, inp.checked); });
      wrap.appendChild(lab);
    });
    box.appendChild(wrap);

    if (q.other) {
      var oi = el('input', 'other');
      oi.type = 'text';
      oi.maxLength = 150;
      oi.placeholder = 'Bạn ghi rõ ở đây';
      oi.hidden = true;
      oi.setAttribute('data-other', key);
      oi.addEventListener('input', function () { S.oth[key] = oi.value; syncText(key, oi, true); clearErr(key); save(); });
      box.appendChild(oi);
    }
    if (q.type === 'many') {
      var fn = el('p', 'full-note', 'Đã chọn đủ ' + q.max + '. Muốn đổi, bạn bỏ chọn một ô trước.');
      fn.hidden = true;
      box.appendChild(fn);
    }
    return box;
  }

  function onPick(key, v, on) {
    var q = Q[key];
    if (q.type === 'many') {
      var cur = picked(key).filter(function (x) { return x !== v; });
      if (on) {
        if (q.excl && v === q.excl) cur = [];
        else if (q.excl) cur = cur.filter(function (x) { return x !== q.excl; });
        if (cur.length < q.max) cur.push(v);
      }
      S.ans[key] = cur;
    } else {
      S.ans[key] = v;
    }
    afterPick(key);
    if (v === OTHER && on) {
      var vis = Array.prototype.filter.call(document.querySelectorAll('input[data-other="' + key + '"]'), function (i) { return i.offsetParent; });
      if (vis[0] && !vis[0].value) vis[0].focus();
    }
  }

  function afterPick(key) {
    syncQuestion(key);
    clearErr(key, true);
    if (key === 'seg') updateChrome();
    applyConditions();
    save();
  }

  // Shows or hides follow-up questions and renumbers "Câu n/N" for each flow.
  function applyConditions() {
    Object.keys(Q).forEach(function (k) {
      if (!Q[k].if) return;
      var on = active(k);
      boxes(k).forEach(function (b) { b.hidden = !on; });
    });
    FLOWS.forEach(function (f) {
      var keys = [];
      SPEC.flows[f].forEach(function (p) { p.qs.forEach(function (k) { if (active(k)) keys.push(k); }); });
      screens[f].forEach(function (sec) {
        sec.querySelectorAll('.qb').forEach(function (b) {
          var i = keys.indexOf(b.getAttribute('data-key'));
          if (i >= 0) b.querySelector('.qn').textContent = 'Câu ' + (i + 1) + '/' + keys.length;
        });
      });
    });
  }

  function syncText(key, src, other) {
    var sel = other ? 'input[data-other="' + key + '"]' : '[data-text="' + key + '"]';
    document.querySelectorAll(sel).forEach(function (t) { if (t !== src) t.value = other ? (S.oth[key] || '') : (S.ans[key] || ''); });
  }

  function markButtons(scope, sel, val) {
    scope.querySelectorAll(sel).forEach(function (b) {
      var on = val != null && String(val) === b.getAttribute('data-v');
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }

  function syncQuestion(key) {
    var q = Q[key], cur = picked(key);
    boxes(key).forEach(function (box) {
      if (q.type === 'scale') { markButtons(box, '.sc', S.ans[key]); return; }
      if (q.type === 'rate') {
        markButtons(box, '.rb', S.ans[key]);
        var v = S.ans[key];
        box.querySelector('.chosen').textContent = v ? 'Bạn chọn: ' + v + ' – ' + q.labels[v - 1] : '';
        return;
      }
      if (q.type === 'grid') {
        var g = gridAns(key);
        box.querySelectorAll('.grow').forEach(function (r) { markButtons(r, '.rb', g[r.getAttribute('data-row')]); });
        return;
      }
      if (q.type === 'text') { var t = box.querySelector('[data-text]'); if (t) t.value = S.ans[key] || ''; return; }
      var full = q.type === 'many' && cur.length >= q.max;
      box.querySelectorAll('label.o').forEach(function (lab) {
        var inp = lab.querySelector('input');
        var on = cur.indexOf(inp.value) >= 0;
        inp.checked = on;
        lab.classList.toggle('on', on);
        inp.disabled = full && !on;
        lab.classList.toggle('off', full && !on);
      });
      var fnote = box.querySelector('.full-note');
      if (fnote) fnote.hidden = !full;
      var oi = box.querySelector('input.other');
      if (oi) { oi.hidden = cur.indexOf(OTHER) < 0; oi.value = S.oth[key] || ''; }
    });
  }

  // For grids, a pick only clears the error once every row is answered.
  function clearErr(key, soft) {
    boxes(key).forEach(function (b) {
      if (Q[key].type === 'grid') {
        var g = gridAns(key);
        b.querySelectorAll('.grow.bad').forEach(function (r) { if (g[r.getAttribute('data-row')] != null) r.classList.remove('bad'); });
        if (soft && b.querySelector('.grow.bad')) return;
      }
      b.classList.remove('bad');
      b.querySelector('.err').textContent = '';
    });
  }

  function visibleBox(key) {
    var arr = Array.prototype.filter.call(boxes(key), function (b) { return b.offsetParent; });
    return arr[0];
  }

  function validatePage(i) {
    var first = null;
    pages()[i - 1].qs.forEach(function (key) {
      var q = Q[key];
      if (!active(key)) return;
      if (q.type === 'text' && !q.req) return;
      clearErr(key);
      var box = visibleBox(key);
      var msg = '';
      if (q.type === 'text') { if ((S.ans[key] || '').trim().length < 2) msg = 'Bạn vui lòng viết vài chữ, một câu ngắn là đủ.'; }
      else if (q.type === 'scale') { if (S.ans[key] == null || S.ans[key] === '') msg = 'Bạn vui lòng chạm vào một số từ 0 đến 10.'; }
      else if (q.type === 'rate') { if (!S.ans[key]) msg = 'Bạn vui lòng chạm vào một số từ 1 đến 5.'; }
      else if (q.type === 'grid') {
        var g = gridAns(key), miss = 0;
        box.querySelectorAll('.grow').forEach(function (r) {
          var bad = g[r.getAttribute('data-row')] == null;
          r.classList.toggle('bad', bad);
          if (bad) miss += 1;
        });
        if (miss) msg = 'Còn ' + miss + ' dòng chưa chấm (viền đỏ). Chưa trải nghiệm thì chọn “' + q.na + '”.';
      }
      else if (!picked(key).length) msg = q.type === 'many' ? 'Bạn vui lòng chọn ít nhất một phương án.' : 'Bạn vui lòng chọn một phương án.';
      else if (picked(key).indexOf(OTHER) >= 0 && !(S.oth[key] || '').trim()) msg = 'Bạn vui lòng ghi rõ ở ô “Khác”.';
      if (msg) {
        box.classList.add('bad');
        box.querySelector('.err').textContent = msg;
        first = first || box;
      }
    });
    if (first) window.scrollTo({ top: first.getBoundingClientRect().top + window.scrollY - 96, behavior: 'smooth' });
    return !first;
  }

  function isLast() { return S.page === pages().length; }

  function updateChrome() {
    if (!$('done').hidden) return;
    $('back').hidden = S.page === 0;
    $('next').textContent = S.page === 0 ? 'Bắt đầu' : (isLast() ? 'Gửi khảo sát' : 'Tiếp tục');
    var pr = $('progress');
    pr.hidden = S.page === 0;
    if (S.page > 0) {
      var total = pages().length;
      $('ptitle').textContent = pages()[S.page - 1].sec;
      $('pstep').textContent = S.page + '/' + total;
      $('pfill').style.width = Math.round(S.page / total * 100) + '%';
    }
  }

  function show(i) {
    S.page = i;
    $('s0').hidden = i !== 0;
    FLOWS.forEach(function (f) {
      screens[f].forEach(function (s, k) { s.hidden = !(i > 0 && f === flow() && k === i - 1); });
    });
    $('done').hidden = true;
    updateChrome();
    window.scrollTo(0, 0);
    save();
  }

  function buildPages() {
    var main = $('app'), done = $('done');
    FLOWS.forEach(function (f) {
      SPEC.flows[f].forEach(function (p) {
        var sec = el('section', 'screen');
        sec.hidden = true;
        p.qs.forEach(function (k) { sec.appendChild(buildQuestion(f, k)); });
        main.insertBefore(sec, done);
        screens[f].push(sec);
      });
    });
    Object.keys(Q).forEach(syncQuestion);
    applyConditions();
  }

  function netMsg(msg) { var n = $('netErr'); n.textContent = msg; n.hidden = !msg; }
  function codeErr(msg) { $('codeErr').textContent = msg; }

  function getJSON(url, opts) {
    return fetch(url, opts).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); });
  }

  function startWithCode() {
    var d = ($('code').value || '').replace(/\D/g, '');
    if (!d || +d === 0) { codeErr('Bạn nhập 3 chữ số nhân viên đọc cho bạn, ví dụ 007.'); $('code').focus(); return; }
    var code = 'DP' + ('00' + d).slice(-3);
    $('code').blur();
    setBusy(true, 'Đang kiểm tra mã…');
    getJSON(API + '?check=' + encodeURIComponent(code)).then(function (r) {
      if (!r.ok && r.err === 'closed') { codeErr('Khảo sát đã kết thúc. Cảm ơn bạn!'); return; }
      if (!r.ok) { codeErr('Mã ' + code + ' chưa đúng. Bạn hỏi lại nhân viên giúp nhé.'); return; }
      if (r.used) { codeErr('Mã ' + code + ' đã được dùng. Bạn hỏi nhân viên mã khác giúp nhé.'); return; }
      codeErr('');
      if (S.code !== code) { S.code = code; S.t0 = Date.now(); }
      show(1);
    }).catch(function () {
      codeErr('Chưa kết nối được. Bạn kiểm tra mạng (có thể dùng wifi quán) rồi bấm lại.');
    }).then(function () { setBusy(false); });
  }

  function payload() {
    var fl = flow();
    var p = { code: S.code, dur: (Date.now() - S.t0) / 1000, hp: $('hp').value };
    pages().forEach(function (pg) {
      pg.qs.forEach(function (k) {
        if (!active(k)) return;
        var q = Q[k], v = S.ans[k];
        var fix = function (x) { return x === OTHER ? 'Khác: ' + (S.oth[k] || '').trim() : x; };
        if (q.type === 'text') p[k] = (v || '').trim();
        else if (q.type === 'scale' || q.type === 'rate') p[k] = v;
        else if (q.type === 'grid') {
          var g = gridAns(k), o = {};
          rowsFor(q, fl).forEach(function (r) { o[r[0]] = g[r[0]]; });
          p[k] = o;
        }
        else if (q.type === 'many') p[k] = (v || []).map(fix);
        else p[k] = v ? fix(v) : '';
      });
    });
    return p;
  }

  function submit() {
    setBusy(true, 'Đang gửi…');
    netMsg('');
    getJSON(API, { method: 'POST', body: JSON.stringify(payload()) }).then(function (r) {
      if (r.ok) { finish(r); return; }
      if (r.err === 'used') netMsg('Mã ' + S.code + ' đã được dùng. Bạn báo nhân viên giúp nhé.');
      else if (r.err === 'closed') netMsg('Khảo sát đã kết thúc. Cảm ơn bạn!');
      else if (r.err === 'busy') netMsg('Hệ thống đang bận, bạn bấm “Gửi khảo sát” lại giúp nhé.');
      else netMsg('Còn câu chưa trả lời. Bạn bấm “Quay lại” để kiểm tra giúp nhé.');
    }).catch(function () {
      netMsg('Chưa gửi được. Bạn kiểm tra mạng rồi bấm “Gửi khảo sát” lại. Câu trả lời vẫn được giữ nguyên.');
    }).then(function () { setBusy(false); });
  }

  function finish(r) {
    var d = { code: r.code, time: r.time, gift: r.gift };
    store(DONE, d);
    drop(DRAFT);
    showDone(d);
  }

  function showDone(d) {
    $('s0').hidden = true;
    FLOWS.forEach(function (f) { screens[f].forEach(function (s) { s.hidden = true; }); });
    $('progress').hidden = true;
    $('bar').hidden = true;
    netMsg('');
    $('doneCode').textContent = d.code;
    $('doneTime').textContent = 'Gửi lúc ' + d.time;
    $('doneGift').textContent = d.gift;
    $('done').hidden = false;
    window.scrollTo(0, 0);
  }

  function setBusy(on, label) {
    busy = on;
    $('next').disabled = on;
    $('back').disabled = on;
    if (on) $('next').textContent = label; else updateChrome();
  }

  $('next').addEventListener('click', function () {
    if (busy) return;
    if (S.page === 0) { startWithCode(); return; }
    if (!validatePage(S.page)) return;
    if (isLast()) { submit(); return; }
    show(S.page + 1);
  });

  $('back').addEventListener('click', function () {
    if (busy || S.page === 0) return;
    netMsg('');
    show(S.page - 1);
  });

  $('code').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 3);
    codeErr('');
  });
  $('code').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('next').click(); });

  var done = load(DONE);
  var draft = load(DRAFT);
  if (draft && draft.code) {
    S = draft;
    $('code').value = draft.code.slice(2);
  }
  buildPages();
  if (done) showDone(done);
  else show(Math.min(S.page || 0, pages().length));
})();
