# ChatGPT Conversation Index (Chrome Extension)

ChatGPT の会話画面（chat.openai.com / chatgpt.com）に **「会話インデックス」サイドバー**を追加する Chrome 拡張です。  
右側に各メッセージの **先頭文（頭）だけを 1 行**で一覧表示し、クリックで該当メッセージへジャンプできます。  
**Markdown / JSON / HTML** へのエクスポートにも対応（HTML は同レイアウト＋右パネル付き。HTML 内から MD/JSON に再出力可）。

---

## 対応サイト

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

---

## インストール

### ZIP から読み込み（開発者モード）
1. Chrome アドレスバーに `chrome://extensions` を入力して開く  
2. 右上 **「デベロッパーモード」** を ON  
3. **「パッケージ化されていない拡張機能を読み込む」** をクリックし、本リポジトリのフォルダ（`manifest.json` が直下にある）を選択  
   - 構成例：  
     ```
     /extension-root
       ├─ manifest.json
       ├─ content.js
       ├─ styles.css
       └─ icon128.png
     ```
4. 読み込み後、ChatGPT の会話ページを開きます

> 更新時は `manifest.json` の `version` を上げ、`chrome://extensions` で **再読み込み** してください。

---

## 使い方

- **表示/非表示**：画面右下の丸いボタン（FAB）
- **フィルタ**：検索ボックス, **User/AI** のチェック切替
- **更新**：サイドバー右上の **更新** ボタン（通常は DOM 変化を自動追従）
- **エクスポート**：サイドバー下部の **Markdown / JSON / HTML** ボタン  
  - **HTML** エクスポートは本拡張と同じ UI のビューワを生成します  
  - 生成した **HTML** を開いた状態で、右パネルから **MD/JSON** に再出力可能です
- 設定画面から自動エクスポートの設定ができます
  - 手動設定を忘れそうという人のためのものです
  - 保存トリガを全てonにすると大量に出力されるので注意

---

## エクスポート形式

### JSON スキーマ（概要）
```json
{
  "meta": {
    "url": "https://chatgpt.com/c/xxxx",
    "title": "会話タイトル",
    "exported_at": "2025-09-13T10:44:55.574Z",
    "timezone": "Asia/Tokyo"
  },
  "messages": [
    {
      "index": 1,
      "id": "cgpt-msg-1",
      "message_id": "（サイトの message-id があれば）",
      "role": "user | assistant",
      "text": "本文（整形前のテキスト）",
      "time": "ISO 8601 Timestamp"
    }
  ]
}
```

### Markdown
- ロール（User/AI）とタイムスタンプを付与し、上から順に出力
- コードブロック（```）はそのまま記録（スタイルやハイライトは閲覧側依存）

### HTML
- 画面と同じ **バブル型レイアウト + 右側インデックス**
- HTML 内右パネルから **Markdown / JSON へ再出力**が可能

---

## 保存データ（ブラウザ内）

本拡張はデータを外部送信しません。以下は **同一ドメインの `localStorage`** に保存されます。

- `cgpt-index-width`：サイドバー幅  
- `cgpt-index-visible`：表示状態  
- `cgpt-index-times:v1:{origin+path}`：メッセージごとのタイムスタンプ

**リセット方法**（会話ページの DevTools コンソールで）:
```js
Object.keys(localStorage)
  .filter(k => k.startsWith('cgpt-index-'))
  .forEach(k => localStorage.removeItem(k));
```

---

## トラブルシュート

- **サイドバーが出ない / 空のまま**  
  - 対象 URL（chat.openai.com / chatgpt.com）か確認  
  - ページを再読み込み  
  - DOM を大きく改変する他拡張を一時的に無効化して確認
- **FAB（右下ボタン）が邪魔**  
  - `Alt + I` で非表示にできます
- **HTML を開いても中身が出ない**  
  - ダウンロードファイルを別タブで開き直す  
  - 企業ポリシー等でローカル HTML のスクリプト実行が制限されていないか確認

---

## 開発メモ

- **Manifest V3**／コンテンツスクリプト構成
- 主なメッセージ検出セレクタ（DOM 変更に備え冗長化）
  - `[data-message-author-role][data-message-id]`
  - `div[data-testid^="conversation-turn-"]`
  - `main [role="listitem"]` など
- **1 行要約**：`headLine()`（最初の句読点または改行まで／最大 120 文字）
- **エクスポート HTML の安全策**
  - 内側 `<script>` は **バッククォート（`）不使用**（文字列は `'...'` 統一）
  - JSON 埋め込みは `& < >` のみ HTML エスケープ＋ `</script>` を `<\/script>` に分割

---

## バージョン

- **v1.0**（初回安定版）  
  - 会話インデックス（頭だけ 1 行表示）  
  - Alt+I / FAB / 幅ドラッグ保存  
  - MD / JSON / HTML エクスポート（HTML 内から再出力可）  
  - タイムスタンプ付与（`localStorage`）

---

## ライセンス

MIT License

---

## 謝辞 / 商標

- “ChatGPT” は OpenAI の商標です。本拡張は非公式のユーザー拡張であり、OpenAI とは関係ありません。
