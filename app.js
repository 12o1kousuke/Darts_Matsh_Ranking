'use strict';

const STORAGE_KEY = 'match-ranking-v1';
const DEFAULT_SETTINGS = { win: 2, loss: 1, bonus: false, bonusPt: 1, maxPerPair: 3 };

const $ = sel => document.querySelector(sel);

// ---------- Data ----------
// db = { members: [{id, name, deleted?}], matches: [{id, month, a, b, winner, lg, at}], settings: {win, loss, bonus, bonusPt, maxPerPair} }
// lg = loser's game count in a best-of-3 (0 → 2-0, 1 → 2-1)
let db = load();
const state = { view: 'ranking', month: currentMonth(), regA: '', regB: '' };

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* fall through to empty db */ }
  return normalize({});
}
function normalize(d) {
  return {
    members: Array.isArray(d.members) ? d.members : [],
    // Matches recorded before scores existed are treated as 2-1
    matches: Array.isArray(d.matches) ? d.matches.map(m => ({ lg: 1, ...m })) : [],
    settings: { ...DEFAULT_SETTINGS, ...(d.settings || {}) },
  };
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function currentMonth() { return fmtMonth(new Date()); }
function fmtMonth(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
function shiftMonth(m, delta) {
  const [y, mo] = m.split('-').map(Number);
  return fmtMonth(new Date(y, mo - 1 + delta, 1));
}
function monthLabel(m) { const [y, mo] = m.split('-'); return `${y}年${Number(mo)}月`; }

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function memberName(id) { const m = db.members.find(x => x.id === id); return m ? m.name : '(不明)'; }
function activeMembers() { return db.members.filter(m => !m.deleted); }
function monthMatches(month) { return db.matches.filter(m => m.month === month); }
function isPair(m, a, b) { return (m.a === a && m.b === b) || (m.a === b && m.b === a); }
function pairCount(month, a, b) { return monthMatches(month).filter(m => isPair(m, a, b)).length; }

// Members shown for a month: active members, plus deleted members who played that month
function monthMembers(month) {
  const played = new Set();
  monthMatches(month).forEach(m => { played.add(m.a); played.add(m.b); });
  return db.members.filter(m => !m.deleted || played.has(m.id));
}

function standings(month) {
  const { win, loss, bonus, bonusPt } = db.settings;
  const rows = monthMembers(month).map(m => ({ id: m.id, name: m.name, w: 0, l: 0, sweeps: 0, gf: 0, ga: 0 }));
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  monthMatches(month).forEach(m => {
    const loser = m.winner === m.a ? m.b : m.a;
    const w = byId[m.winner], l = byId[loser];
    if (w) { w.w++; w.gf += 2; w.ga += m.lg; if (m.lg === 0) w.sweeps++; }
    if (l) { l.l++; l.gf += m.lg; l.ga += 2; }
  });
  rows.forEach(r => {
    r.games = r.w + r.l;
    r.pt = r.w * win + r.l * loss + (bonus ? r.sweeps * bonusPt : 0);
    r.diff = r.gf - r.ga;
    r.rate = r.games ? r.w / r.games : 0;
  });
  // Order: points → wins → game difference → name
  rows.sort((x, y) => y.pt - x.pt || y.w - x.w || y.diff - x.diff || x.name.localeCompare(y.name, 'ja'));
  rows.forEach((r, i) => {
    const p = rows[i - 1];
    r.rank = p && p.pt === r.pt && p.w === r.w && p.diff === r.diff ? p.rank : i + 1;
  });
  return rows;
}

function fmtPt(n) { return Number.isInteger(n) ? String(n) : n.toFixed(1); }
function fmtDiff(n) { return n > 0 ? `+${n}` : String(n); }
function score(m) { return `2-${m.lg}`; }
function pointRule() {
  const { win, loss, bonus, bonusPt } = db.settings;
  return `勝ち ${fmtPt(win)}pt / 負け ${fmtPt(loss)}pt` + (bonus ? ` / 2-0勝利ボーナス +${fmtPt(bonusPt)}pt` : '');
}

// ---------- Rendering ----------
function render() {
  $('#monthLabel').textContent = monthLabel(state.month);
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${state.view}`));
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  ({ ranking: renderRanking, table: renderTable, register: renderRegister, members: renderMembers, settings: renderSettings })[state.view]();
}

function emptyHtml(msg) {
  return `<div class="card empty">${msg}<br><br><button class="btn sub" data-action="goto" data-view="members" style="max-width:240px;margin:0 auto">メンバー登録へ</button></div>`;
}

function renderRanking() {
  const el = $('#view-ranking');
  const rows = standings(state.month);
  if (!rows.length) { el.innerHTML = emptyHtml('メンバーが登録されていません'); return; }
  const medal = r => (r.games && r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank);
  el.innerHTML = `
    <div class="card">
      <table class="rank">
        <thead><tr><th>順位</th><th class="name">名前</th><th>pt</th><th>勝</th><th>敗</th><th>本差</th><th>勝率</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td class="rk">${medal(r)}</td>
              <td class="name">${esc(r.name)}</td>
              <td class="pt">${fmtPt(r.pt)}</td>
              <td>${r.w}</td>
              <td>${r.l}</td>
              <td>${r.games ? fmtDiff(r.diff) : '-'}</td>
              <td>${r.games ? (r.rate * 100).toFixed(0) + '%' : '-'}</td>
            </tr>`).join('')}
        </tbody>
      </table>
      <p class="note">${pointRule()}<br>同pt時は 勝数 → 本差（取った本数 − 取られた本数）の順</p>
    </div>`;
}

function renderTable() {
  const el = $('#view-table');
  const ms = monthMembers(state.month);
  if (!ms.length) { el.innerHTML = emptyHtml('メンバーが登録されていません'); return; }
  const matches = monthMatches(state.month).slice().sort((x, y) => x.at - y.at);
  const st = Object.fromEntries(standings(state.month).map(r => [r.id, r]));

  const cell = (row, col) => {
    if (row.id === col.id) return '<td class="self"></td>';
    const res = matches.filter(m => isPair(m, row.id, col.id));
    // Score shown from the row member's perspective, e.g. ○2-0 / ●1-2
    const marks = res.map(m => (m.winner === row.id
      ? `<span class="w">○2-${m.lg}</span>`
      : `<span class="l">●${m.lg}-2</span>`)).join('');
    const full = res.length >= db.settings.maxPerPair;
    return `<td class="cell ${full ? 'full' : ''}" data-action="cell" data-a="${row.id}" data-b="${col.id}">
      <span class="marks">${marks || '&nbsp;'}</span><span class="cnt">${res.length}/${db.settings.maxPerPair}</span></td>`;
  };

  el.innerHTML = `
    <div class="card">
      <div class="rr-wrap">
        <table class="rr">
          <thead><tr>
            <th></th>
            ${ms.map(m => `<th class="vname">${esc(m.name)}</th>`).join('')}
            <th>勝</th><th>敗</th><th>pt</th><th>順位</th>
          </tr></thead>
          <tbody>
            ${ms.map(row => `<tr>
              <th>${esc(row.name)}</th>
              ${ms.map(col => cell(row, col)).join('')}
              <td class="sum">${st[row.id].w}</td>
              <td class="sum">${st[row.id].l}</td>
              <td class="sum pt">${fmtPt(st[row.id].pt)}</td>
              <td class="sum">${st[row.id].rank}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="note">${pointRule()}<br>行のメンバーから見た結果（<span style="color:var(--win)">○</span>勝ち / <span style="color:var(--lose)">●</span>負け）。マスをタップすると対戦登録できます。</p>
    </div>`;
}

function renderRegister() {
  const el = $('#view-register');
  const act = activeMembers();
  if (act.length < 2) { el.innerHTML = emptyHtml('対戦登録には2名以上のメンバーが必要です'); return; }
  if (!act.some(m => m.id === state.regA)) state.regA = '';
  if (!act.some(m => m.id === state.regB) || state.regB === state.regA) state.regB = '';

  const { regA: a, regB: b } = state;
  const optsA = act.map(m => `<option value="${m.id}" ${m.id === a ? 'selected' : ''}>${esc(m.name)}</option>`).join('');
  const optsB = act.filter(m => m.id !== a).map(m => {
    const n = a ? pairCount(state.month, a, m.id) : 0;
    return `<option value="${m.id}" ${m.id === b ? 'selected' : ''}>${esc(m.name)}${a ? `（${n}/${db.settings.maxPerPair}）` : ''}</option>`;
  }).join('');

  let action = '';
  if (a && b) {
    const n = pairCount(state.month, a, b);
    action = `<p class="count">${monthLabel(state.month)}の対戦数 <b>${n}</b> / ${db.settings.maxPerPair}</p>` + (n >= db.settings.maxPerPair
      ? `<p class="limit">今月の上限（${db.settings.maxPerPair}回）に達しています</p>`
      : `<div class="win-btns">${[a, b].map(id => `
           <div class="win-col">
             <div class="win-name">${esc(memberName(id))} の勝ち</div>
             <button class="btn" data-action="win" data-winner="${id}" data-lg="0">2 - 0</button>
             <button class="btn sub" data-action="win" data-winner="${id}" data-lg="1">2 - 1</button>
           </div>`).join('')}
         </div>`);
  }

  const list = monthMatches(state.month).slice().sort((x, y) => y.at - x.at);
  const d = t => { const x = new Date(t); return `${x.getMonth() + 1}/${x.getDate()} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
  const item = m => {
    const loser = m.winner === m.a ? m.b : m.a;
    return `<li>
      <div class="grow"><span class="res-w">○ ${esc(memberName(m.winner))}</span> <b>${score(m)}</b> <span class="res-l">● ${esc(memberName(loser))}</span>
        <div class="meta">${d(m.at)}</div></div>
      <button class="icon-btn del" data-action="del-match" data-id="${m.id}">削除</button>
    </li>`;
  };

  el.innerHTML = `
    <div class="card">
      <h2>対戦結果を登録（${monthLabel(state.month)}）</h2>
      <div class="row">
        <label class="field">プレイヤー1<select id="regA"><option value="">選択</option>${optsA}</select></label>
        <span class="vs">vs</span>
        <label class="field">プレイヤー2<select id="regB" ${a ? '' : 'disabled'}><option value="">選択</option>${optsB}</select></label>
      </div>
      ${action}
    </div>
    <div class="card">
      <h2>${monthLabel(state.month)}の対戦履歴（${list.length}件）</h2>
      ${list.length ? `<ul class="list">${list.map(item).join('')}</ul>` : '<p class="note">まだ対戦がありません</p>'}
    </div>`;
}

function renderMembers() {
  const el = $('#view-members');
  const act = activeMembers();
  const gone = db.members.filter(m => m.deleted);
  el.innerHTML = `
    <div class="card">
      <h2>メンバーを追加</h2>
      <form id="addMember" class="row">
        <label class="field" style="margin:0"><input id="newName" placeholder="名前" maxlength="20" autocomplete="off"></label>
        <button class="btn" style="flex:0 0 80px">追加</button>
      </form>
    </div>
    <div class="card">
      <h2>メンバー一覧（${act.length}名）</h2>
      ${act.length ? `<ul class="list">${act.map(m => `
        <li><span class="grow">${esc(m.name)}</span>
          <button class="icon-btn" data-action="rename" data-id="${m.id}">名前変更</button>
          <button class="icon-btn del" data-action="del-member" data-id="${m.id}">削除</button></li>`).join('')}</ul>`
        : '<p class="note">メンバーがいません</p>'}
    </div>
    ${gone.length ? `<div class="card">
      <h2>削除済みメンバー</h2>
      <ul class="list">${gone.map(m => `
        <li><span class="grow">${esc(m.name)}</span>
          <button class="icon-btn" data-action="restore" data-id="${m.id}">復元</button></li>`).join('')}</ul>
      <p class="note">削除済みメンバーも過去月の記録には表示されます</p>
    </div>` : ''}`;
}

function shareCardHtml() {
  if (!window.FIREBASE_CONFIG) return '';
  if (!remote) return `<div class="card"><h2>共有</h2><p class="note">共有データに接続中…</p></div>`;
  return `
    <div class="card">
      <h2>共有</h2>
      <p class="note" style="margin:0 0 10px">このリンクを開いた人は、同じランキングを見たり登録したりできます。リンクを知っている人は誰でも編集できるので、共有する相手に注意してください。</p>
      <button class="btn" data-action="share">共有リンクを送る</button>
      <button class="btn sub" data-action="copy-link">リンクをコピー</button>
      <form id="joinForm" style="margin-top:14px">
        <label class="field">別のルームに参加（共有リンクを貼り付け）<input id="joinRoom" placeholder="https://…#room=…" autocomplete="off"></label>
        <button class="btn sub">参加</button>
      </form>
      <button class="btn sub" data-action="new-room" style="margin-top:8px">新しいルームを作成</button>
    </div>`;
}

function renderSettings() {
  const el = $('#view-settings');
  el.innerHTML = `
    ${shareCardHtml()}
    <div class="card">
      <h2>ポイント設定</h2>
      <form id="pointForm">
        <div class="row">
          <label class="field">勝ちポイント<input id="winPt" type="number" inputmode="decimal" step="0.5" min="0" value="${db.settings.win}"></label>
          <label class="field">負けポイント<input id="lossPt" type="number" inputmode="decimal" step="0.5" min="0" value="${db.settings.loss}"></label>
        </div>
        <label class="toggle"><input id="bonusOn" type="checkbox" ${db.settings.bonus ? 'checked' : ''}> 2-0勝利ボーナス</label>
        <label class="field">ボーナスポイント（2-0で勝った時に加算）<input id="bonusPt" type="number" inputmode="decimal" step="0.5" min="0" value="${db.settings.bonusPt}"></label>
        <button class="btn">保存</button>
      </form>
      <p class="note">変更は全ての月のランキングに反映されます</p>
    </div>
    <div class="card">
      <h2>対戦数の上限</h2>
      <form id="limitForm">
        <label class="field">同じ相手と1か月に登録できる試合数<input id="maxPerPair" type="number" inputmode="numeric" step="1" min="1" value="${db.settings.maxPerPair}"></label>
        <button class="btn">保存</button>
      </form>
      <p class="note">上限を下げても、登録済みの試合は消えません（新しい登録ができなくなるだけです）</p>
    </div>
    <div class="card">
      <h2>データ管理</h2>
      <button class="btn sub" data-action="export">バックアップを保存（JSON）</button>
      <button class="btn sub" data-action="import">バックアップから復元</button>
      <button class="btn danger" data-action="reset">全データを削除</button>
      <input id="importFile" type="file" accept="application/json,.json" hidden>
      <p class="note">${remote ? 'データはクラウドに保存され、同じルームの全員で共有されます。' : 'データはこの端末のブラウザ内に保存されます。機種変更前にはバックアップしてください。'}</p>
    </div>`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1800);
}

// ---------- Shared room (Firebase Firestore) ----------
// Enabled when firebase-config.js provides a config. All data of a room lives in one document
// rooms/{roomId}; every change is a transaction so simultaneous edits from several phones never overwrite each other.
const FIREBASE_VERSION = '12.3.0';
const ROOM_KEY = 'match-ranking-room';
let remote = null;
let pendingRender = false;

function randomRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, x => (x % 36).toString(36)).join('') + Date.now().toString(36);
}
function roomFromHash() { const m = location.hash.match(/room=([a-z0-9]{16,})/); return m ? m[1] : ''; }
function roomUrl(id) { return `${location.origin}${location.pathname}#room=${id}`; }

async function connectRoom(roomId, seed) {
  const cfg = window.FIREBASE_CONFIG;
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const firestore = fs.getFirestore(remote?.app || initializeApp(cfg));
  remote?.unsubscribe();
  const ref = fs.doc(firestore, 'rooms', roomId);

  const transact = fn => fs.runTransaction(firestore, async tx => {
    const snap = await tx.get(ref);
    const d = normalize(snap.exists() ? snap.data() : {});
    if (fn(d) === false) return false;
    tx.set(ref, JSON.parse(JSON.stringify(d)));
    return true;
  });
  // Create the room with the current local data if it doesn't exist yet
  if (seed) await transact(d => { if (d.members.length || d.matches.length) return false; Object.assign(d, seed); });

  const unsubscribe = fs.onSnapshot(ref, snap => {
    db = normalize(snap.exists() ? snap.data() : {});
    save();
    const el = document.activeElement;
    // Don't wipe what the user is typing; re-render once they leave the field
    if (el && el.matches('input:not([type=checkbox]):not([type=file])')) pendingRender = true;
    else render();
  }, err => { console.error(err); toast('共有データに接続できません'); });

  remote = { app: firestore.app, roomId, transact, unsubscribe };
  localStorage.setItem(ROOM_KEY, roomId);
  history.replaceState(null, '', `#room=${roomId}`);
  render();
}

async function initRemote() {
  if (!window.FIREBASE_CONFIG) return;
  const roomId = roomFromHash() || localStorage.getItem(ROOM_KEY);
  try {
    if (roomId) await connectRoom(roomId);
    else await connectRoom(randomRoomId(), normalize(db));
  } catch (e) { console.error(e); toast('共有データに接続できません'); }
}

document.addEventListener('focusout', () => { if (pendingRender) { pendingRender = false; setTimeout(render, 0); } });
window.addEventListener('hashchange', () => {
  const id = roomFromHash();
  if (remote && id && id !== remote.roomId) connectRoom(id).catch(() => toast('ルームに参加できませんでした'));
});

// Apply a change: fn mutates the given data and may return false to cancel.
// In shared mode fn runs against the latest server data; the screen updates via onSnapshot.
async function update(fn, okMsg) {
  if (!remote) {
    if (fn(db) === false) return false;
    save(); render();
  } else {
    try {
      if (await remote.transact(fn) === false) return false;
    } catch (e) {
      console.error(e); toast('保存できませんでした（通信状態を確認してください）'); return false;
    }
  }
  if (okMsg) toast(okMsg);
  return true;
}

// ---------- Actions ----------
function hasName(d, name, exceptId) { return d.members.some(m => m.id !== exceptId && !m.deleted && m.name === name); }

function addMember(name) {
  name = name.trim();
  if (!name) return;
  update(d => {
    if (hasName(d, name)) { toast('同じ名前のメンバーがいます'); return false; }
    d.members.push({ id: uid(), name });
  }, `${name} を追加しました`);
}

function registerWin(winner, lg) {
  const { regA: a, regB: b, month } = state;
  if (!a || !b || a === b) return;
  update(d => {
    const n = d.matches.filter(m => m.month === month && isPair(m, a, b)).length;
    if (n >= d.settings.maxPerPair) { toast('今月の上限に達しています'); return false; }
    d.matches.push({ id: uid(), month, a, b, winner, lg, at: Date.now() });
  }, `${memberName(winner)} の 2-${lg} 勝ちを登録しました`);
}

document.addEventListener('click', e => {
  const t = e.target.closest('[data-action], nav button');
  if (!t) return;
  if (t.matches('nav button')) { state.view = t.dataset.view; render(); window.scrollTo(0, 0); return; }

  const id = t.dataset.id;
  switch (t.dataset.action) {
    case 'goto': state.view = t.dataset.view; render(); break;
    case 'cell':
      if (activeMembers().some(m => m.id === t.dataset.a) && activeMembers().some(m => m.id === t.dataset.b)) {
        state.regA = t.dataset.a; state.regB = t.dataset.b;
      }
      state.view = 'register'; render(); window.scrollTo(0, 0);
      break;
    case 'win': registerWin(t.dataset.winner, Number(t.dataset.lg)); break;
    case 'del-match': {
      const m = db.matches.find(x => x.id === id);
      if (m && confirm(`${memberName(m.a)} vs ${memberName(m.b)} の記録を削除しますか？`)) {
        update(d => { d.matches = d.matches.filter(x => x.id !== id); }, '削除しました');
      }
      break;
    }
    case 'rename': {
      const m = db.members.find(x => x.id === id);
      const name = m && prompt('新しい名前', m.name)?.trim();
      if (name) {
        update(d => {
          if (hasName(d, name, id)) { toast('同じ名前のメンバーがいます'); return false; }
          const x = d.members.find(y => y.id === id);
          if (!x) return false;
          x.name = name;
        });
      }
      break;
    }
    case 'del-member': {
      const m = db.members.find(x => x.id === id);
      if (m && confirm(`${m.name} を削除しますか？\n（過去の対戦記録は残ります）`)) {
        update(d => {
          const x = d.members.find(y => y.id === id);
          if (!x) return false;
          if (d.matches.some(y => y.a === id || y.b === id)) x.deleted = true;
          else d.members = d.members.filter(y => y.id !== id);
        });
      }
      break;
    }
    case 'restore': {
      const m = db.members.find(x => x.id === id);
      if (!m) break;
      update(d => {
        if (hasName(d, m.name, id)) { toast('同じ名前のメンバーがいます'); return false; }
        const x = d.members.find(y => y.id === id);
        if (!x) return false;
        delete x.deleted;
      });
      break;
    }
    case 'share': {
      const url = roomUrl(remote.roomId);
      if (navigator.share) navigator.share({ title: '対戦ランキング', url }).catch(() => {});
      else navigator.clipboard.writeText(url).then(() => toast('リンクをコピーしました'));
      break;
    }
    case 'copy-link':
      navigator.clipboard.writeText(roomUrl(remote.roomId)).then(() => toast('リンクをコピーしました'));
      break;
    case 'new-room':
      if (confirm('新しいルームを作成しますか？\n今のルームから抜けます（今のルームのデータは残ります）。')) {
        connectRoom(randomRoomId()).then(() => toast('新しいルームを作成しました')).catch(() => toast('作成できませんでした'));
      }
      break;
    case 'export': {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `match-ranking-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      break;
    }
    case 'import': $('#importFile').click(); break;
    case 'reset':
      if (confirm(`全てのメンバー・対戦記録・設定を削除します。${remote ? '\n共有している全員のデータが消えます。' : ''}元に戻せません。よろしいですか？`)) {
        update(d => { Object.assign(d, normalize({})); }, '全データを削除しました');
      }
      break;
  }
});

document.addEventListener('change', e => {
  if (e.target.id === 'regA') { state.regA = e.target.value; render(); }
  else if (e.target.id === 'regB') { state.regB = e.target.value; render(); }
  else if (e.target.id === 'importFile') {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then(txt => {
      const src = JSON.parse(txt);
      if (!Array.isArray(src.members) || !Array.isArray(src.matches)) throw new Error('invalid');
      if (!confirm('現在のデータを上書きして復元しますか？')) return;
      update(d => { Object.assign(d, normalize(src)); }, '復元しました');
    }).catch(() => toast('ファイルを読み込めませんでした'));
    e.target.value = '';
  }
});

document.addEventListener('submit', e => {
  e.preventDefault();
  if (e.target.id === 'addMember') addMember($('#newName').value);
  else if (e.target.id === 'pointForm') {
    const win = parseFloat($('#winPt').value), loss = parseFloat($('#lossPt').value), bonusPt = parseFloat($('#bonusPt').value);
    if (!(win >= 0) || !(loss >= 0) || !(bonusPt >= 0)) { toast('0以上の数値を入力してください'); return; }
    const bonus = $('#bonusOn').checked;
    update(d => { Object.assign(d.settings, { win, loss, bonus, bonusPt }); }, '保存しました');
  } else if (e.target.id === 'limitForm') {
    const n = Number($('#maxPerPair').value);
    if (!Number.isInteger(n) || n < 1) { toast('1以上の整数を入力してください'); return; }
    update(d => { d.settings.maxPerPair = n; }, '保存しました');
  } else if (e.target.id === 'joinForm') {
    const v = $('#joinRoom').value.trim();
    const id = (v.match(/room=([a-z0-9]{16,})/) || v.match(/^([a-z0-9]{16,})$/) || [])[1];
    if (!id) { toast('共有リンクを貼り付けてください'); return; }
    connectRoom(id).then(() => toast('ルームに参加しました')).catch(() => toast('参加できませんでした'));
  }
});

$('#prevMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); render(); });
$('#nextMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); render(); });

render();
initRemote();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js');
}
