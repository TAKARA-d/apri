export const TEAM_DEFS = [
  { name: '東京スターズ', short: 'TOK', color: '#3b82f6' },
  { name: '大阪タイタンズ', short: 'OSA', color: '#ef4444' },
  { name: '名古屋ドラゴンズ', short: 'NGY', color: '#8b5cf6' },
  { name: '横浜マリナーズ', short: 'YKH', color: '#14b8a6' },
  { name: '福岡ホークス', short: 'FKO', color: '#f59e0b' },
  { name: '札幌ベアーズ', short: 'SPP', color: '#22c55e' },
];

const LAST_NAMES = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田'];
const FIRST_NAMES = ['蓮', '蒼', '颯太', '陽斗', '大和', '凛', '悠真', '翔', '海斗', '翼', '奏', '匠'];

export function createRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function randInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export class Player {
  constructor(id, name, role, batting, pitching, stamina, charisma) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.batting = batting;
    this.pitching = pitching;
    this.stamina = stamina;
    this.charisma = charisma;
    this.condition = 100;
    this.age = 18 + (id % 14);
    this.salary = 180 + batting + pitching;
  }

  overall() {
    return Math.round((this.batting + this.pitching + this.stamina + this.charisma) / 4);
  }
}

export class Team {
  constructor(def, rng) {
    this.name = def.name;
    this.short = def.short;
    this.color = def.color;
    this.wins = 0;
    this.losses = 0;
    this.draws = 0;
    this.runsFor = 0;
    this.runsAgainst = 0;
    this.morale = 50;
    this.budget = 12000;
    this.fans = 120;
    this.roster = this.generateRoster(rng);
  }

  generateRoster(rng) {
    const players = [];
    for (let i = 0; i < 18; i += 1) {
      const role = i < 9 ? '野手' : i < 15 ? '投手' : '二刀流';
      const base = 52 + randInt(rng, 0, 24);
      const p = new Player(
        i,
        `${LAST_NAMES[randInt(rng, 0, LAST_NAMES.length - 1)]} ${FIRST_NAMES[randInt(rng, 0, FIRST_NAMES.length - 1)]}`,
        role,
        clamp(base + randInt(rng, -8, 12), 35, 92),
        clamp(base + randInt(rng, -8, 12), 35, 92),
        clamp(45 + randInt(rng, 0, 45), 40, 95),
        clamp(40 + randInt(rng, 0, 50), 35, 95),
      );
      players.push(p);
    }
    return players;
  }

  get lineup() {
    return [...this.roster].sort((a, b) => b.batting - a.batting).slice(0, 9);
  }

  get rotation() {
    return [...this.roster].sort((a, b) => b.pitching - a.pitching).slice(0, 5);
  }

  strength() {
    const bat = this.lineup.reduce((s, p) => s + p.batting * (p.condition / 100), 0) / this.lineup.length;
    const pit = this.rotation.reduce((s, p) => s + p.pitching * (p.condition / 100), 0) / this.rotation.length;
    return { bat, pit };
  }

  pct() {
    const d = this.wins + this.losses;
    return d ? this.wins / d : 0;
  }
}

export class PennantGame {
  constructor(seed = 42, rounds = 12, userTeam = '東京スターズ') {
    this.rng = createRng(seed);
    this.teams = TEAM_DEFS.map((d) => new Team(d, this.rng));
    this.userTeam = userTeam;
    this.day = 0;
    this.rounds = rounds;
    this.schedule = this.buildSchedule(rounds);
    this.logs = [];
    this.prospects = [];
  }

  teamByName(name) {
    return this.teams.find((t) => t.name === name);
  }

  buildSchedule(rounds) {
    const names = this.teams.map((t) => t.name);
    const rot = [...names];
    const days = [];

    for (let r = 0; r < names.length - 1; r += 1) {
      const pairs = [];
      for (let i = 0; i < names.length / 2; i += 1) {
        const a = rot[i];
        const b = rot[rot.length - 1 - i];
        pairs.push(i % 2 === 0 ? [a, b] : [b, a]);
      }
      days.push(pairs);
      rot.splice(1, 0, rot.pop());
    }

    const rev = days.map((d) => d.map(([h, a]) => [a, h]));
    return [...days, ...rev].flatMap((leg) => Array.from({ length: rounds }, () => leg));
  }

  expectedRuns(off, def, homeBoost = 0) {
    const offPow = off.bat + off.morale * 0.12;
    const defPow = def.pit + def.morale * 0.08;
    const base = 3.2 + (offPow - defPow) * 0.055 + homeBoost;
    return clamp(base, 0.8, 10.5);
  }

  sampleRuns(exp) {
    let total = 0;
    for (let inning = 0; inning < 9; inning += 1) {
      const lambda = exp / 9;
      const noise = (this.rng() - 0.5) * 0.9;
      total += Math.max(0, Math.round(lambda + noise));
    }
    return total;
  }

  playOne(home, away) {
    const hs = home.strength();
    const as = away.strength();
    const hRuns = this.sampleRuns(this.expectedRuns({ ...hs, morale: home.morale }, { ...as, morale: away.morale }, 0.35));
    const aRuns = this.sampleRuns(this.expectedRuns({ ...as, morale: away.morale }, { ...hs, morale: home.morale }, 0));

    let finalH = hRuns;
    let finalA = aRuns;
    if (finalH === finalA) {
      finalH += randInt(this.rng, 0, 2);
      finalA += randInt(this.rng, 0, 2);
    }

    home.runsFor += finalH;
    home.runsAgainst += finalA;
    away.runsFor += finalA;
    away.runsAgainst += finalH;

    if (finalH > finalA) {
      home.wins += 1;
      away.losses += 1;
      home.morale = clamp(home.morale + 2, 10, 99);
      away.morale = clamp(away.morale - 2, 10, 99);
    } else if (finalA > finalH) {
      away.wins += 1;
      home.losses += 1;
      away.morale = clamp(away.morale + 2, 10, 99);
      home.morale = clamp(home.morale - 2, 10, 99);
    } else {
      home.draws += 1;
      away.draws += 1;
    }

    [...home.roster, ...away.roster].forEach((p) => {
      p.condition = clamp(p.condition - randInt(this.rng, 0, 4), 40, 100);
    });

    return { home: home.name, away: away.name, h: finalH, a: finalA };
  }

  advanceDay() {
    if (this.day >= this.schedule.length) return [];
    const games = this.schedule[this.day];
    const results = games.map(([homeName, awayName]) => {
      const home = this.teamByName(homeName);
      const away = this.teamByName(awayName);
      return this.playOne(home, away);
    });
    this.day += 1;
    this.logs.unshift({ day: this.day, results });
    this.logs = this.logs.slice(0, 18);

    if (this.day % 5 === 0) this.generateProspects();
    return results;
  }

  generateProspects() {
    this.prospects = Array.from({ length: 3 }, (_, i) => {
      const base = 58 + randInt(this.rng, 0, 20);
      return new Player(
        1000 + this.day * 10 + i,
        `${LAST_NAMES[randInt(this.rng, 0, LAST_NAMES.length - 1)]} ${FIRST_NAMES[randInt(this.rng, 0, FIRST_NAMES.length - 1)]}`,
        randInt(this.rng, 0, 100) > 50 ? '野手' : '投手',
        clamp(base + randInt(this.rng, -5, 10), 45, 95),
        clamp(base + randInt(this.rng, -5, 10), 45, 95),
        clamp(60 + randInt(this.rng, -15, 25), 45, 98),
        clamp(55 + randInt(this.rng, -10, 22), 40, 95),
      );
    });
  }

  signProspect(index) {
    const team = this.teamByName(this.userTeam);
    const p = this.prospects[index];
    if (!p) return '選手が見つかりません。';
    if (team.budget < p.salary) return '予算が不足しています。';

    team.budget -= p.salary;
    team.roster.sort((a, b) => a.overall() - b.overall());
    team.roster[0] = p;
    this.prospects.splice(index, 1);
    return `${p.name} を獲得しました！`;
  }

  train(type) {
    const team = this.teamByName(this.userTeam);
    const pick = team.roster[randInt(this.rng, 0, team.roster.length - 1)];
    const gain = randInt(this.rng, 1, 4);
    if (type === 'batting') pick.batting = clamp(pick.batting + gain, 35, 99);
    if (type === 'pitching') pick.pitching = clamp(pick.pitching + gain, 35, 99);
    if (type === 'stamina') pick.stamina = clamp(pick.stamina + gain, 35, 99);
    pick.condition = clamp(pick.condition - 4, 35, 100);
    return `${pick.name} の${type}が +${gain}`;
  }

  rest() {
    const team = this.teamByName(this.userTeam);
    team.roster.forEach((p) => {
      p.condition = clamp(p.condition + randInt(this.rng, 3, 8), 40, 100);
    });
    team.morale = clamp(team.morale + 1, 10, 99);
    return 'チームを休養させ、コンディションが回復しました。';
  }

  standings() {
    return [...this.teams].sort((a, b) => {
      const d = b.pct() - a.pct();
      if (Math.abs(d) > 1e-9) return d;
      return (b.runsFor - b.runsAgainst) - (a.runsFor - a.runsAgainst);
    });
  }

  isFinished() {
    return this.day >= this.schedule.length;
  }

  save() {
    return JSON.stringify(this);
  }

  static load(json) {
    const raw = JSON.parse(json);
    const g = new PennantGame(1, raw.rounds, raw.userTeam);
    Object.assign(g, raw);
    g.teams = raw.teams.map((t) => {
      const nt = Object.assign(new Team({ name: t.name, short: t.short, color: t.color }, createRng(1)), t);
      nt.roster = t.roster.map((p) => Object.assign(new Player(p.id, p.name, p.role, p.batting, p.pitching, p.stamina, p.charisma), p));
      return nt;
    });
    g.prospects = raw.prospects.map((p) => Object.assign(new Player(p.id, p.name, p.role, p.batting, p.pitching, p.stamina, p.charisma), p));
    g.rng = createRng(123456 + g.day);
    return g;
  }
}
