import unittest

from pennant import PennantLeague


class PennantTests(unittest.TestCase):
    def test_schedule_even_matchups(self):
        league = PennantLeague(rounds=1, seed=1)
        # 6チーム: 1日3試合 x (n-1)*2 = 10日程
        self.assertEqual(len(league.schedule), 10)
        self.assertTrue(all(len(day) == 3 for day in league.schedule))

    def test_day_progress_and_stats(self):
        league = PennantLeague(rounds=1, seed=2)
        results = league.advance_day()
        self.assertEqual(len(results), 3)
        self.assertEqual(league.day, 1)
        total_games = sum(t.games for t in league.teams.values())
        self.assertEqual(total_games, 6)

    def test_training_changes_attribute(self):
        league = PennantLeague(rounds=1, seed=3)
        team = league.teams[league.user_team]
        before = team.batting
        message = league.training("batting")
        self.assertIn("打撃特訓成功", message)
        self.assertGreaterEqual(team.batting, before + 1)

    def test_finish_season(self):
        league = PennantLeague(rounds=1, seed=4)
        while not league.is_finished():
            league.advance_day()
        self.assertTrue(league.is_finished())
        self.assertEqual(league.day, len(league.schedule))


if __name__ == "__main__":
    unittest.main()
