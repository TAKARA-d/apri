# NASDAQ100 Intelligence Lab（本番志向版）

ゲーム的な挙動を廃止し、**実ニュース（日本語）+ 実市場データ**を取り込んで予測分析するReactアプリです。

## 何が変わったか

- 実ネットニュース取得（日本語RSS）
  - NHK 経済
  - NHK 国際
  - Reuters JP ビジネス
- 実市場データ取得
  - NASDAQ100 日次履歴（stooq）
- 指標分析
  - 日次リターン / モメンタム / RSI(14) / MACD / 20日ボラティリティ
- 予測モデル
  - 線形モデルを学習し、翌営業日と20営業日先を予測
  - Train/Test で MAE と方向一致率を表示
  - ニュースセンチメント（日本語辞書）を特徴量に統合
- UI
  - Reactダッシュボード
  - 価格ラインチャート、リターンバー、係数テーブル、ニュースパネル
  - 30分ごとの自動更新 + 手動更新

## 起動

```bash
node server.mjs
```

`http://localhost:8000`

## テスト

```bash
node --test tests/test_engine.mjs
```

## 構成

- `server.mjs` API + 静的配信
- `app.js` React UI
- `engine.js` 指標計算・学習・予測
- `styles.css` UIデザイン
- `tests/test_engine.mjs` 分析ロジックテスト
