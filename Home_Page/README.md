# 海鮮餃子 北京 移行用サイト

Jimdo 上の現行サイトをベースに、GitHub Pages へ移行するための静的サイトです。

## 現在の状態

- 現サイトに寄せた配色、ヘッダー、背景、写真、ギャラリー画像を反映
- `Home_Page` ディレクトリを GitHub Pages へ配備する構成
- 旧URL互換として `shipping.html` と `gyoza.html` は新URLへリダイレクト

## 主要ページ

- `index.html`
- `order.html`
- `menu.html`
- `about.html`
- `howto.html`
- `blog.html`
- `gallery.html`
- `contact.html`
- `shift.html`

## GitHub Pages

リポジトリ直下の `.github/workflows/deploy-home-page.yml` で、`Home_Page` ディレクトリを GitHub Pages にデプロイします。
リポジトリ設定の `Settings > Pages` で `Source: GitHub Actions` が必要です。

## ローカル確認

```powershell
python -m http.server 8000
```

その後、`http://localhost:8000/` をブラウザで開いて確認します。
