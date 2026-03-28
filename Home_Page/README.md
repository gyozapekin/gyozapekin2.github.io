# 海鮮餃子 北京 移行用サイト

Jimdo 上の現行サイト `https://www.gyozapekin.com/` をベースに、GitHub Pages へ移行するための静的サイト初期版です。

## 現在の状態

- 主要ページを静的 HTML として再構築
- 現サイトの公開テキストをもとに導線を整理
- 画像資産の一括取得は Cloudflare による制限のため未完了

## 次にやること

- 画像・PDF・ブログ・ギャラリーの回収
- 営業時間など表記揺れの確認
- GitHub リポジトリ化と GitHub Pages 仮公開
- ドメイン切替前の最終レビュー

## GitHub Pages

リポジトリ直下の `.github/workflows/deploy-home-page.yml` で、`Home_Page` ディレクトリを GitHub Pages にデプロイする想定です。

## ローカル確認

`Home_Page` ディレクトリで次を実行すると、ローカルで確認できます。

```powershell
python -m http.server 8000
```

その後、`http://localhost:8000/` をブラウザで開いて確認します。
