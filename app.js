import { PennantGame } from './sim.js';

const SAVE_KEY = 'apri-pennant-save-v2';
let game = new PennantGame(42, 6, '東京スターズ');

const el = {
  standings: document.getElementById('standings'),
  roster: document.getElementById('roster'),
  teamName: document.getElementById('teamName'),
  teamMeta: document.getElementById('teamMeta'),
  results: document.getElementById('todayResults'),
  prospects: document.getElementById('prospects'),
  logs: document.getElementById('logs'),
  status: document.getElementById('status'),
};

function avatarSvg(player) {
  const n = player.id + player.batting + player.pitching;
  const skin = ['#f3d2b6', '#f0c6a3', '#e2ad81'][n % 3];
  const hair = ['#111827', '#4b2e2e', '#6b7280', '#78350f'][n % 4];
  const eye = ['#1f2937', '#0f172a', '#1d4ed8'][n % 3];
  return `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'>
      <rect width='64' height='64' rx='32' fill='#0b1730'/>
      <ellipse cx='32' cy='30' rx='16' ry='18' fill='${skin}'/>
      <path d='M16 24c3-13 30-14 32 0v8H16z' fill='${hair}'/>
      <circle cx='26' cy='31' r='2' fill='${eye}'/><circle cx='38' cy='31' r='2' fill='${eye}'/>
      <path d='M26 39c4 3 8 3 12 0' stroke='#7c3f2a' stroke-width='2' fill='none'/>
      <rect x='18' y='46' width='28' height='12' rx='6' fill='#1d4ed8'/>
    </svg>
  `)}`;
}

function renderStandings() {
  const rows = game.standings();
  el.standings.innerHTML = `
    <tr><th>順位</th><th>球団</th><th>勝</th><th>敗</th><th>勝率</th><th>得失</th></tr>
    ${rows.map((t, i) => `<tr class='${t.name === game.userTeam ? 'user' : ''}'><td>${i + 1}</td><td>${t.name}</td><td>${t.wins}</td><td>${t.losses}</td><td>${t.pct().toFixed(3)}</td><td>${t.runsFor - t.runsAgainst}</td></tr>`).join('')}
  `;
}

function renderRoster() {
  const team = game.teamByName(game.userTeam);
  el.teamName.textContent = team.name;
  el.teamMeta.textContent = `予算: ${team.budget}万 / 士気: ${team.morale} / ファン: ${team.fans}万人 / Day ${game.day}/${game.schedule.length}`;
  el.roster.innerHTML = team.roster
    .sort((a, b) => b.overall() - a.overall())
    .map((p) => `
      <article class='card'>
        <img class='avatar' src='${avatarSvg(p)}' alt='${p.name}' />
        <strong>${p.name}</strong> (${p.role})<br />
        総合 ${p.overall()} / 打 ${p.batting} 投 ${p.pitching}<br />
        体力 ${p.stamina} / 調子 ${p.condition}
      </article>
    `)
    .join('');
}

function renderProspects() {
  if (!game.prospects.length) {
    el.prospects.innerHTML = '<li>候補はまだいません（5日ごと更新）</li>';
    return;
  }
  el.prospects.innerHTML = game.prospects
    .map((p, i) => `<li>${p.name} (${p.role}) 総合${p.overall()} 年俸${p.salary} <button data-sign='${i}'>獲得</button></li>`)
    .join('');
}

function renderLogs() {
  el.logs.innerHTML = game.logs
    .map((entry) => `<li><b>Day ${entry.day}</b>: ${entry.results.map((r) => `${r.away} ${r.a} - ${r.h} ${r.home}`).join(' / ')}</li>`)
    .join('') || '<li>まだ試合がありません。</li>';
}

function renderToday(results) {
  el.results.innerHTML = results.length
    ? results.map((r) => `<li>${r.away} ${r.a} - ${r.h} ${r.home}</li>`).join('')
    : '<li>結果なし</li>';
}

function refresh(results = []) {
  renderStandings();
  renderRoster();
  renderProspects();
  renderLogs();
  renderToday(results);
}

function stepDays(n) {
  let latest = [];
  for (let i = 0; i < n; i += 1) {
    if (game.isFinished()) break;
    latest = game.advanceDay();
  }
  if (game.isFinished()) {
    const champ = game.standings()[0];
    el.status.textContent = `シーズン終了！優勝: ${champ.name}`;
  }
  refresh(latest);
}

document.getElementById('nextDay').onclick = () => stepDays(1);
document.getElementById('nextWeek').onclick = () => stepDays(7);
document.getElementById('autoSeason').onclick = () => stepDays(9999);
document.getElementById('restBtn').onclick = () => {
  el.status.textContent = game.rest();
  refresh();
};
document.querySelectorAll('[data-train]').forEach((btn) => {
  btn.onclick = () => {
    el.status.textContent = game.train(btn.dataset.train);
    refresh();
  };
});
document.getElementById('saveBtn').onclick = () => {
  localStorage.setItem(SAVE_KEY, game.save());
  el.status.textContent = 'セーブしました。';
};
document.getElementById('loadBtn').onclick = () => {
  const saved = localStorage.getItem(SAVE_KEY);
  if (!saved) {
    el.status.textContent = 'セーブデータがありません。';
    return;
  }
  game = PennantGame.load(saved);
  el.status.textContent = 'ロードしました。';
  refresh();
};
document.getElementById('resetBtn').onclick = () => {
  game = new PennantGame(42, 6, '東京スターズ');
  el.status.textContent = '新シーズンを開始しました。';
  refresh();
};

el.prospects.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-sign]');
  if (!button) return;
  const idx = Number(button.dataset.sign);
  el.status.textContent = game.signProspect(idx);
  refresh();
});

refresh();
