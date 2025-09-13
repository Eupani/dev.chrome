# ChatGPT Conversation Index (Chrome Extension) · v1.0

ChatGPT の会話画面（chat.openai.com / chatgpt.com）に **「会話インデックス」サイドバー**を追加する Chrome 拡張です。  
右側に各メッセージの **先頭文（頭）だけを 1 行**で一覧表示し、クリックで該当メッセージへジャンプできます。  
**Markdown / JSON / HTML** へのエクスポートにも対応（HTML は同レイアウト＋右パネル付き。HTML 内から MD/JSON に再出力可）。

---

## 特長

- **会話インデックス（右サイドバー）**
  - 先頭文のみ 1 行で省略表示（ブラウザの会話インデックス風）
  - クリックで該当メッセージへスムーズスクロール＆ハイライト
  - フィルタ（キーワード）／ **User** / **AI** の表示切替
- **表示切替ショートカット**：`Alt + I`（右下のフローティングボタンでも可）
- **幅のドラッグ変更**（保存され、次回以降も維持）
- **ダーク/ライト**自動追従
- **エクスポート**
  - Markdown（.md）
  - JSON（.json）
  - **インタラクティブ HTML**（同レイアウト＋右パネル／HTML 内から再エクスポート可）
- **時刻記録**：各メッセージに ISO 8601 のタイムスタンプを付与（`localStorage`、ページ単位）

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

- **表示/非表示**：`Alt + I` または画面右下の丸いボタン（FAB）
- **幅変更**：サイドバー左端をドラッグ（値は保存されます）
- **フィルタ**：検索ボックスに入力＋ **User/AI** のチェック切替
- **更新**：サイドバー右上の **更新** ボタン（通常は DOM 変化を自動追従）
- **エクスポート**：サイドバー下部の **Markdown / JSON / HTML** ボタン  
  - **HTML** エクスポートは本拡張と同じ UI のビューワを生成します  
  - 生成した **HTML** を開いた状態で、右パネルから **MD/JSON** に再出力可能です

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
