from __future__ import annotations

from dataclasses import dataclass
import random
from typing import Dict, List, Tuple


@dataclass
class Team:
    name: str
    batting: int
    pitching: int
    wins: int = 0
    losses: int = 0
    draws: int = 0
    runs_scored: int = 0
    runs_allowed: int = 0
    fatigue: int = 0

    @property
    def games(self) -> int:
        return self.wins + self.losses + self.draws

    @property
    def win_pct(self) -> float:
        decisions = self.wins + self.losses
        if decisions == 0:
            return 0.0
        return self.wins / decisions


class PennantLeague:
    def __init__(self, user_team: str = "東京スターズ", rounds: int = 10, seed: int = 42):
        self.rng = random.Random(seed)
        self.day = 0
        self.rounds = rounds
        self.teams: Dict[str, Team] = {
            "東京スターズ": Team("東京スターズ", batting=72, pitching=68),
            "大阪タイタンズ": Team("大阪タイタンズ", batting=69, pitching=71),
            "名古屋ドラゴンズ": Team("名古屋ドラゴンズ", batting=66, pitching=74),
            "横浜マリナーズ": Team("横浜マリナーズ", batting=75, pitching=63),
            "福岡ホークス": Team("福岡ホークス", batting=70, pitching=70),
            "札幌ベアーズ": Team("札幌ベアーズ", batting=64, pitching=76),
        }
        if user_team not in self.teams:
            raise ValueError(f"Unknown team: {user_team}")
        self.user_team = user_team
        self.schedule: List[List[Tuple[str, str]]] = self._build_schedule()

    def _build_schedule(self) -> List[List[Tuple[str, str]]]:
        names = list(self.teams.keys())
        n = len(names)
        if n % 2:
            raise ValueError("Number of teams must be even")

        rotation = names[:]
        first_leg: List[List[Tuple[str, str]]] = []

        for _ in range(n - 1):
            pairs = []
            for i in range(n // 2):
                home = rotation[i]
                away = rotation[n - 1 - i]
                if i % 2 == 0:
                    pairs.append((home, away))
                else:
                    pairs.append((away, home))
            first_leg.append(pairs)
            rotation = [rotation[0]] + [rotation[-1]] + rotation[1:-1]

        second_leg = [[(b, a) for (a, b) in day] for day in first_leg]
        full_cycle = first_leg + second_leg
        return full_cycle * self.rounds

    def _expected_runs(self, offense: Team, defense: Team) -> float:
        attack = offense.batting - offense.fatigue * 0.8
        block = defense.pitching - defense.fatigue * 0.6
        base = 3.4 + (attack - block) * 0.06
        return max(1.2, min(8.5, base))

    def _sample_runs(self, exp_runs: float) -> int:
        value = self.rng.gauss(exp_runs, 1.6)
        if value < 0:
            return 0
        return int(round(value))

    def play_game(self, home_name: str, away_name: str) -> Tuple[int, int]:
        home = self.teams[home_name]
        away = self.teams[away_name]

        home_advantage = 0.35
        h_exp = self._expected_runs(home, away) + home_advantage
        a_exp = self._expected_runs(away, home)

        h_runs = self._sample_runs(h_exp)
        a_runs = self._sample_runs(a_exp)

        if h_runs == a_runs:
            # 引き分けを減らすため簡易延長
            h_runs += self.rng.randint(0, 2)
            a_runs += self.rng.randint(0, 2)

        home.runs_scored += h_runs
        home.runs_allowed += a_runs
        away.runs_scored += a_runs
        away.runs_allowed += h_runs

        home.fatigue = min(10, home.fatigue + 1)
        away.fatigue = min(10, away.fatigue + 1)

        if h_runs > a_runs:
            home.wins += 1
            away.losses += 1
        elif a_runs > h_runs:
            away.wins += 1
            home.losses += 1
        else:
            home.draws += 1
            away.draws += 1

        return h_runs, a_runs

    def advance_day(self) -> List[str]:
        if self.day >= len(self.schedule):
            return []
        results = []
        for home, away in self.schedule[self.day]:
            h, a = self.play_game(home, away)
            results.append(f"{away} {a} - {h} {home}")
        self.day += 1
        return results

    def training(self, focus: str) -> str:
        team = self.teams[self.user_team]
        if focus == "batting":
            gain = self.rng.randint(1, 3)
            team.batting = min(99, team.batting + gain)
            team.fatigue = min(10, team.fatigue + 2)
            return f"打撃特訓成功！ 打撃 +{gain}"
        if focus == "pitching":
            gain = self.rng.randint(1, 3)
            team.pitching = min(99, team.pitching + gain)
            team.fatigue = min(10, team.fatigue + 2)
            return f"投手特訓成功！ 投手 +{gain}"
        raise ValueError("focus must be batting or pitching")

    def rest(self) -> str:
        team = self.teams[self.user_team]
        recover = self.rng.randint(2, 4)
        before = team.fatigue
        team.fatigue = max(0, team.fatigue - recover)
        return f"休養した。疲労 {before} -> {team.fatigue}"

    def standings(self) -> List[Team]:
        return sorted(
            self.teams.values(),
            key=lambda t: (t.win_pct, t.wins - t.losses, t.runs_scored - t.runs_allowed),
            reverse=True,
        )

    def standings_text(self) -> str:
        rows = self.standings()
        top = rows[0]
        lines = ["順位  球団                勝  敗  分  勝率   差"]
        for i, t in enumerate(rows, start=1):
            gap = "-" if t is top else f"{(top.wins - top.losses) - (t.wins - t.losses):+.1f}"
            lines.append(
                f"{i:>2}位  {t.name:<16} {t.wins:>2} {t.losses:>2} {t.draws:>2} {t.win_pct:>.3f} {gap:>5}"
            )
        return "\n".join(lines)

    def roster_text(self, team_name: str | None = None) -> str:
        team = self.teams[team_name or self.user_team]
        return (
            f"[{team.name}] 打撃:{team.batting} 投手:{team.pitching} "
            f"疲労:{team.fatigue} 得点:{team.runs_scored} 失点:{team.runs_allowed}"
        )

    def is_finished(self) -> bool:
        return self.day >= len(self.schedule)


def run_cli() -> None:
    league = PennantLeague()
    print("=== パワプロ風 ペナントモード（簡易）===")
    print(f"あなたの球団: {league.user_team}")

    while True:
        print("\n[n]次の日程 [a]最後まで自動 [s]順位 [r]ロスター [t]特訓 [e]休養 [q]終了")
        cmd = input("> ").strip().lower()

        if cmd == "n":
            if league.is_finished():
                print("シーズンは終了しています。")
                continue
            print(f"\n--- Day {league.day + 1}/{len(league.schedule)} ---")
            for line in league.advance_day():
                print(line)
        elif cmd == "a":
            while not league.is_finished():
                league.advance_day()
            print("シーズンを最後まで進めました。")
        elif cmd == "s":
            print("\n" + league.standings_text())
        elif cmd == "r":
            print(league.roster_text())
        elif cmd == "t":
            choice = input("特訓タイプを選択 [b]打撃 [p]投手: ").strip().lower()
            if choice == "b":
                print(league.training("batting"))
            elif choice == "p":
                print(league.training("pitching"))
            else:
                print("キャンセル")
        elif cmd == "e":
            print(league.rest())
        elif cmd == "q":
            break
        else:
            print("不明なコマンドです。")

        if league.is_finished():
            print("\n=== シーズン終了 ===")
            table = league.standings()
            print(f"優勝: {table[0].name} ({table[0].wins}勝{table[0].losses}敗)")
            print(league.standings_text())
            break


if __name__ == "__main__":
    run_cli()
