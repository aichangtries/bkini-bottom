/* B-kini Bottom — shared logic (used by the app AND the daily reminder script).
   Pure functions over a plain JSON "state" object. No network code here. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BK = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY = 86400000;

  // ---------- dates (all dates are 'YYYY-MM-DD' strings in the house time zone) ----------
  function today(tz) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  }
  function toN(s) { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / DAY); }
  function fromN(n) { return new Date(n * DAY).toISOString().slice(0, 10); }
  function addDays(s, n) { return fromN(toN(s) + n); }
  function diff(a, b) { return toN(a) - toN(b); } // a minus b, in days
  function uid() { return Math.random().toString(36).slice(2, 10); }

  function spanText(n) {
    n = Math.abs(n);
    if (n === 0) return 'today';
    if (n % 7 === 0) { const w = n / 7; return w + (w === 1 ? ' week' : ' weeks'); }
    return n + (n === 1 ? ' day' : ' days');
  }

  // ---------- lookups ----------
  function member(state, id) { return state.members.find(m => m.id === id) || null; }
  function memberName(state, id) { const m = member(state, id); return m ? m.name : 'Someone'; }
  function activeRotation(state, task) {
    return task.rotation.filter(id => { const m = member(state, id); return m && m.active !== false; });
  }
  function slotMember(state, task) {
    const r = task.rotation;
    if (!r.length) return null;
    // walk forward from ptr to the first active member
    for (let i = 0; i < r.length; i++) {
      const id = r[(task.ptr + i) % r.length];
      const m = member(state, id);
      if (m && m.active !== false) return id;
    }
    return null;
  }

  // Who has to do this task right now?
  // Order of precedence: a skip hand-off  >  someone who owes the slot owner a turn  >  the slot owner.
  function assignee(state, task) {
    if (task.override && member(state, task.override.memberId)) {
      return { memberId: task.override.memberId, onBehalfOf: task.override.onBehalfOf, iouId: task.override.iouId || null, reason: 'skip' };
    }
    const slot = slotMember(state, task);
    if (!slot) return { memberId: null, onBehalfOf: null, iouId: null, reason: 'none' };
    const rot = activeRotation(state, task);
    const iou = (state.ious || []).find(x => x.taskId === task.id && x.creditor === slot && rot.includes(x.debtor));
    if (iou) return { memberId: iou.debtor, onBehalfOf: null, iouId: iou.id, slot, reason: 'payback' };
    return { memberId: slot, onBehalfOf: null, iouId: null, slot, reason: 'turn' };
  }

  // Preview the next few people in line (ignores future paybacks, which are shown separately).
  function upcoming(state, task, count) {
    const out = [];
    const r = task.rotation;
    if (!r.length) return out;
    for (let i = 1; out.length < count && i <= r.length * 3; i++) {
      const id = r[(task.ptr + i) % r.length];
      const m = member(state, id);
      if (m && m.active !== false) out.push(id);
    }
    return out;
  }

  function nextInRotationAfter(state, task, afterId, excludeId) {
    const rot = activeRotation(state, task);
    if (rot.length < 2) return null;
    let idx = rot.indexOf(afterId);
    for (let i = 1; i <= rot.length; i++) {
      const id = rot[(idx + i + rot.length) % rot.length];
      if (id !== afterId && id !== excludeId) return id;
    }
    return null;
  }

  // ---------- time-based housekeeping ----------
  // For "same person for a fixed period" tasks, move the duty forward when periods end.
  function normalize(state, t) {
    let changed = false;
    for (const task of state.tasks) {
      if (task.turnMode === 'period' && task.periodStart && task.periodDays > 0 && task.rotation.length) {
        let guard = 0;
        while (diff(t, task.periodStart) >= task.periodDays && guard++ < 400) {
          task.ptr = (task.ptr + 1) % task.rotation.length;
          task.periodStart = addDays(task.periodStart, task.periodDays);
          task.override = null;
          changed = true;
        }
      }
    }
    return changed;
  }

  function dueDate(task) {
    if (task.status === 'needed') return task.neededSince;
    if (task.schedule !== 'repeat') return null;
    return task.nextDue || (task.lastDone ? addDays(task.lastDone, task.everyDays || 7) : task.created);
  }

  // Everything the UI needs to describe a task's situation.
  function info(state, task, t) {
    const due = dueDate(task);
    const daysUntil = due ? diff(due, t) : null;
    const since = task.lastDone ? diff(t, task.lastDone) : null;
    const sinceBase = diff(t, task.lastDone || task.created);
    let level = 'ok';
    if (task.paused) level = 'paused';
    else if (task.status === 'needed') level = 'needed';
    else if (daysUntil !== null && daysUntil < 0) level = 'overdue';
    else if (daysUntil === 0) level = 'due';
    else if (daysUntil !== null && daysUntil <= 1) level = 'soon';
    const alarmDays = task.status === 'needed' ? diff(t, task.neededSince) : (task.schedule === 'repeat' ? sinceBase : null);
    const alarm = !task.paused && task.alertAfterDays > 0 && alarmDays !== null && alarmDays >= task.alertAfterDays;
    const a = assignee(state, task);
    let line;
    if (task.paused) line = 'Paused';
    else if (task.status === 'needed') {
      const n = diff(t, task.neededSince);
      line = (task.kind === 'supply' ? 'Ran out ' : 'Flagged ') + (n === 0 ? 'today' : spanText(n) + ' ago');
    } else if (due) {
      if (daysUntil < 0) line = 'Overdue by ' + spanText(daysUntil);
      else if (daysUntil === 0) line = 'Due today';
      else if (daysUntil === 1) line = 'Due tomorrow';
      else line = 'Due in ' + spanText(daysUntil);
    } else {
      line = task.kind === 'supply' ? 'Stocked' : 'Only when needed';
    }
    return { due, daysUntil, since, sinceBase, alarmDays, level, alarm, assignee: a, line };
  }

  // ---------- actions (mutate state, return a list of notifications to send) ----------
  function log(state, e) {
    state.log = state.log || [];
    state.log.unshift(Object.assign({ id: uid(), ts: Date.now() }, e));
    if (state.log.length > 1500) state.log.length = 1500;
  }
  function consumeIou(state, id) { if (id) state.ious = (state.ious || []).filter(x => x.id !== id); }

  function complete(state, taskId, doerId, opts) {
    opts = opts || {};
    const task = state.tasks.find(x => x.id === taskId);
    const t = opts.date || today(state.house.tz);
    const a = assignee(state, task);
    const responsible = a.onBehalfOf || a.memberId;
    const notes = [];
    consumeIou(state, a.iouId);
    if (doerId === responsible) {
      log(state, { taskId, date: t, type: task.kind === 'supply' ? 'bought' : 'done', by: doerId, note: opts.note || '' });
    } else {
      const gift = !!opts.gift;
      log(state, { taskId, date: t, type: 'covered', by: doerId, forMember: responsible, gift, note: opts.note || '' });
      if (!gift && responsible) {
        state.ious = state.ious || [];
        state.ious.push({ id: uid(), taskId, debtor: responsible, creditor: doerId, date: t });
        notes.push({ to: responsible, title: task.emoji + ' ' + memberName(state, doerId) + ' covered for you',
          message: memberName(state, doerId) + ' did "' + task.name + '" on your turn. You\'ll take their next turn to even it out.', tags: 'handshake' });
      }
    }
    task.lastDone = t; task.lastDoneBy = doerId;
    if (task.schedule === 'repeat') task.nextDue = addDays(t, task.everyDays || 7);
    task.status = 'ok'; task.neededSince = null; task.neededBy = null;
    task.override = null;
    if (task.turnMode !== 'period' && task.rotation.length) task.ptr = (task.ptr + 1) % task.rotation.length;
    const nx = assignee(state, task);
    if (task.turnMode !== 'period' && nx.memberId && task.kind === 'chore') {
      const d = dueDate(task);
      notes.push({ to: nx.memberId, title: task.emoji + ' You\'re up next: ' + task.name,
        message: (nx.reason === 'payback' ? 'Paying back a covered turn. ' : '') + (d ? 'Due ' + d + '.' : 'Whenever it\'s needed.'), tags: 'ocean' });
    }
    if (task.turnMode !== 'period' && nx.memberId && task.kind === 'supply') {
      notes.push({ to: nx.memberId, title: task.emoji + ' Next time we run out of ' + task.name.replace(/^buy\s+/i, '') + ', it\'s on you',
        message: memberName(state, doerId) + ' just restocked it.', tags: 'shopping_cart' });
    }
    return notes;
  }

  function skip(state, taskId, byId, note) {
    const task = state.tasks.find(x => x.id === taskId);
    const t = today(state.house.tz);
    const a = assignee(state, task);
    const responsible = a.onBehalfOf || a.memberId;
    const next = nextInRotationAfter(state, task, a.memberId, responsible);
    if (!next) return { ok: false, notes: [] };
    task.override = { memberId: next, onBehalfOf: responsible, iouId: a.iouId };
    log(state, { taskId, date: t, type: 'skipped', by: byId, forMember: responsible, passedTo: next, note: note || '' });
    return { ok: true, notes: [{ to: next, title: task.emoji + ' ' + memberName(state, responsible) + ' passed you ' + task.name,
      message: (note ? '"' + note + '" — ' : '') + 'Can you take this one? They\'ll owe you a turn.', tags: 'wave' }] };
  }

  function markNeeded(state, taskId, byId) {
    const task = state.tasks.find(x => x.id === taskId);
    const t = today(state.house.tz);
    task.status = 'needed'; task.neededSince = t; task.neededBy = byId;
    log(state, { taskId, date: t, type: 'needed', by: byId });
    const a = assignee(state, task);
    if (!a.memberId) return [];
    const what = task.kind === 'supply'
      ? { title: task.emoji + ' We\'re out of ' + task.name.replace(/^buy\s+/i, '') + ' — your turn to buy', message: memberName(state, byId) + ' flagged it. Tap Bought in the app once you\'ve restocked.', tags: 'rotating_light' }
      : { title: task.emoji + ' ' + task.name + ' needs doing — your turn', message: 'Flagged by ' + memberName(state, byId) + '.', tags: 'rotating_light' };
    return [Object.assign({ to: a.memberId }, what)];
  }

  // ---------- daily reminders (run once a day by the GitHub Action) ----------
  function reminders(state, t) {
    const out = [];
    for (const task of state.tasks) {
      if (task.paused) continue;
      const i = info(state, task, t);
      const who = i.assignee.memberId;
      const name = who ? memberName(state, who) : 'nobody';
      const nag = Math.max(1, task.nagEveryDays || 2);

      if (task.status === 'needed') {
        const n = diff(t, task.neededSince);
        if (who && n > 0 && n % nag === 0)
          out.push({ to: who, title: task.emoji + ' Still waiting: ' + task.name, message: (task.kind === 'supply' ? 'We ran out ' : 'Flagged ') + spanText(n) + ' ago. It\'s your turn.', tags: 'hourglass' });
      } else if (task.schedule === 'repeat' && who && i.daysUntil !== null) {
        if (i.daysUntil === 1) out.push({ to: who, title: task.emoji + ' Tomorrow: ' + task.name, message: 'Heads up — your turn is due tomorrow.', tags: 'calendar' });
        else if (i.daysUntil === 0) out.push({ to: who, title: task.emoji + ' Today: ' + task.name, message: 'Your turn is due today. Tap Done in the app when finished.', tags: 'bell' });
        else if (i.daysUntil < 0 && (-i.daysUntil) % nag === 0) out.push({ to: who, title: task.emoji + ' Overdue: ' + task.name, message: 'Overdue by ' + spanText(i.daysUntil) + '.', tags: 'warning' });
      }

      if (task.turnMode === 'period' && who && task.periodStart === t) {
        out.push({ to: who, title: task.emoji + ' You\'re on ' + task.name + ' duty', message: 'From today until ' + addDays(t, task.periodDays - 1) + '.', tags: 'ocean' });
      }

      // House-wide alarm, e.g. "Bathroom hasn't been cleaned for 2 weeks"
      if (i.alarm) {
        const over = i.alarmDays - task.alertAfterDays;
        if (over % 7 === 0) {
          const msg = task.status === 'needed'
            ? (task.kind === 'supply' ? task.name.replace(/^buy\s+/i, '') + ' still not bought — we\'ve been out for ' : task.name + ' flagged and still not done after ') + spanText(i.alarmDays)
            : task.name + ' hasn\'t been done for ' + spanText(i.sinceBase);
          out.push({ to: 'all', title: task.emoji + ' ' + msg.charAt(0).toUpperCase() + msg.slice(1), message: 'It\'s ' + name + '\'s turn.', tags: 'loudspeaker' });
        }
      }
    }
    return out;
  }

  // ---------- notifications via ntfy.sh ----------
  function topic(houseCode, to) { return 'bkini-' + houseCode + '-' + to; }
  async function send(houseCode, n, clickUrl) {
    const body = { topic: topic(houseCode, n.to), title: n.title, message: n.message || '', tags: n.tags ? [n.tags] : [] };
    if (clickUrl) body.click = clickUrl;
    const r = await fetch('https://ntfy.sh/', { method: 'POST', body: JSON.stringify(body) });
    if (!r.ok) throw new Error('ntfy ' + r.status);
  }

  // ---------- starters ----------
  const STARTERS = [
    { name: 'Clean the bathroom', emoji: '🚽', kind: 'chore', schedule: 'repeat', everyDays: 7, turnMode: 'each', alertAfterDays: 14, nagEveryDays: 2 },
    { name: 'Sweep the floors', emoji: '🧹', kind: 'chore', schedule: 'repeat', everyDays: 2, turnMode: 'period', periodDays: 7, alertAfterDays: 5, nagEveryDays: 1 },
    { name: 'Take out the trash', emoji: '🗑️', kind: 'chore', schedule: 'asNeeded', everyDays: 2, turnMode: 'each', alertAfterDays: 3, nagEveryDays: 1 },
    { name: 'Buy trash bags', emoji: '🛍️', kind: 'supply', schedule: 'asNeeded', everyDays: 14, turnMode: 'each', alertAfterDays: 3, nagEveryDays: 1 },
    { name: 'Buy toilet paper', emoji: '🧻', kind: 'supply', schedule: 'asNeeded', everyDays: 14, turnMode: 'each', alertAfterDays: 2, nagEveryDays: 1 },
    { name: 'Buy dish soap', emoji: '🧴', kind: 'supply', schedule: 'asNeeded', everyDays: 30, turnMode: 'each', alertAfterDays: 4, nagEveryDays: 2 },
    { name: 'Buy drinking water', emoji: '💧', kind: 'supply', schedule: 'asNeeded', everyDays: 7, turnMode: 'each', alertAfterDays: 1, nagEveryDays: 1 }
  ];

  function newTask(state, partial) {
    const t = today(state.house.tz);
    return Object.assign({
      id: uid(), name: 'New task', emoji: '✨', kind: 'chore',
      rotation: state.members.map(m => m.id), ptr: 0,
      turnMode: 'each', periodDays: 7, periodStart: t,
      schedule: 'repeat', everyDays: 7, nextDue: t,
      alertAfterDays: 14, nagEveryDays: 2,
      status: 'ok', neededSince: null, neededBy: null,
      lastDone: null, lastDoneBy: null, override: null,
      created: t, paused: false, notes: ''
    }, partial || {});
  }

  return { today, addDays, diff, uid, spanText, member, memberName, activeRotation, slotMember, assignee, upcoming,
    normalize, dueDate, info, complete, skip, markNeeded, reminders, topic, send, STARTERS, newTask, log };
});
