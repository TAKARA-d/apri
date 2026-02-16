# NASDAQ100 Intelligence Lab (React)

NASDAQ100の1年分指標トレンドを分析し、ニュースを日々吸収してモデル重みを更新しながら将来値を予測する、**React製の分析アプリ**です。

## できること

- 1年（252営業日）分の市場データをベースに分析
- 指標: 価格 / 日次リターン / RSI / MACD / VIX / Breadth / 金利 / 出来高トレンド
- 20営業日先の予測（期待騰落率・予想価格・信頼度・市場レジーム）
- ニュースセンチメント自動生成と影響度反映
- 日次オンライン学習（予測誤差で特徴量重みを更新）
- 特徴量重要度の可視化
- 保存/復元（localStorage）

## 技術

- UI: React 18（ESM import）
- ロジック: 純粋JavaScript (`engine.js`)
- スタイル: CSS
- テスト: Node.js test runner

## 起動

```bash
python3 -m http.server 8000
```

`http://localhost:8000` にアクセスしてください。

## テスト

```bash
node --test tests/test_engine.mjs
```

## 主要ファイル

- `index.html`: アプリエントリ
- `app.js`: React UI
- `engine.js`: 分析・予測・学習エンジン
- `styles.css`: ダッシュボードスタイル
- `tests/test_engine.mjs`: エンジン検証
