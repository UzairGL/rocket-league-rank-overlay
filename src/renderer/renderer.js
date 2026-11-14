(() => {
  const $ = (id) => document.getElementById(id);
  const el = {
    board: $('board'),
    mmr: $('mmr'),
    rank: $('rank'),
    wins: $('wins'),
    losses: $('losses'),
    down: $('down'),
    up: $('up'),
    note: $('note'),
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Quatre segments, un par division.
  const fills = [0, 1, 2, 3].map(() => {
    const seg = document.createElement('div');
    seg.className = 'seg';
    const fill = document.createElement('i');
    seg.appendChild(fill);
    $('segs').appendChild(seg);
    return fill;
  });

  let prev = null;

  function countTo(node, from, to) {
    if (reduceMotion || from === to || !Number.isFinite(from)) {
      node.textContent = String(to);
      return;
    }
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / 600);
      node.textContent = String(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function flash(node, className) {
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
  }

  function floatDelta(delta) {
    const chip = document.createElement('div');
    chip.className = `delta ${delta > 0 ? 'win' : 'loss'}`;
    chip.textContent = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
    el.board.appendChild(chip);
    setTimeout(() => chip.remove(), 1100);
  }

  function renderEmpty(view) {
    el.mmr.textContent = '—';
    el.rank.textContent = view && view.reason === 'no-log' ? 'Journal introuvable' : 'Lance une file classée';
    el.wins.textContent = '0';
    el.losses.textContent = '0';
    el.down.textContent = '';
    el.up.textContent = '';
    el.note.textContent = '';
    fills.forEach((f) => { f.style.width = '0%'; });
    prev = null;
  }

  // Les valeurs approximatives (seuil jamais observé) sont précédées de « ≈ ».
  function approx(v, isEdge, known) {
    return isEdge && !known ? '≈ ' : '';
  }

  function shortNext(v) {
    return v.next.label.startsWith(`${v.tierName} · `) ? `Div ${v.next.label.split(' · ').pop()}` : v.next.label;
  }

  function render(view) {
    if (!view || view.empty) return renderEmpty(view);

    const label = view.division ? `${view.tierName} · ${view.division}` : view.tierName;
    const lastDiv = view.division === 'IV';
    const firstDiv = view.division === 'I';

    el.rank.textContent = label;
    el.wins.textContent = String(view.session.w);
    el.losses.textContent = String(view.session.l);
    countTo(el.mmr, prev ? prev.mmr : view.mmr, view.mmr);

    el.down.textContent = view.toDown != null ? `${approx(view, firstDiv, view.edgeKnown.demo)}−${view.toDown}` : '';
    el.up.textContent =
      view.toUp != null && view.next ? `${approx(view, lastDiv, view.edgeKnown.promo)}+${view.toUp} pour ${shortNext(view)}` : '';

    if (view.pendingGames > 0) el.note.textContent = `${view.pendingGames} match en attente`;
    else if (view.zone === 'maintien') el.note.textContent = 'maintien de tier';
    else if (view.zone === 'promotion') el.note.textContent = 'montée en attente';
    else el.note.textContent = '';

    fills.forEach((f, i) => {
      const frac = view.segments ? view.segments[i] : 0;
      f.style.width = `${Math.round(frac * 100)}%`;
    });

    if (prev && prev.playlist === view.playlist) {
      if (view.mmr !== prev.mmr) floatDelta(view.mmr - prev.mmr);
      if (prev.tier !== view.tier || prev.division !== view.division) flash(el.rank, 'bump');
    }
    prev = view;
  }

  // Glisser la fenêtre à la main : le clic droit reste libre pour le menu.
  let dragStart = null;
  el.board.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragStart = { x: e.screenX, y: e.screenY };
    window.overlay.drag('start', 0, 0);
  });
  window.addEventListener('mousemove', (e) => {
    if (dragStart) window.overlay.drag('move', e.screenX - dragStart.x, e.screenY - dragStart.y);
  });
  window.addEventListener('mouseup', () => {
    if (!dragStart) return;
    dragStart = null;
    window.overlay.drag('end', 0, 0);
  });
  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    window.overlay.openMenu();
  });

  window.overlay.getView().then(render);
  window.overlay.onView(render);
})();
