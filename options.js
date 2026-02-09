// オプション画面のロジック
// ステータスメッセージを表示
function showStatus(type, message) {
  const statusDiv = document.getElementById("status");
  statusDiv.className = `status ${type}`;
  statusDiv.textContent = message;
  statusDiv.style.display = "block";
}

// 保存ボタンのクリックイベント
document.getElementById("save").addEventListener("click", async () => {
  const tokenInput = document.getElementById("token");
  const token = tokenInput.value.trim();

  // 入力チェック
  if (!token) {
    showStatus("error", "Please enter a token.");
    return;
  }

  // トークンの形式チェック（github_pat_ のみ受付）
  if (!token.startsWith("github_pat_")) {
    showStatus(
      "error",
      "Invalid token format. Please enter a valid GitHub fine-grained Personal Access Token (starts with github_pat_).",
    );
    return;
  }

  try {
    // Chrome storageに保存
    await browser.storage.sync.set({ githubToken: token });
    showStatus(
      "success",
      "Token saved! Visit any GitHub Pull Request page to see reviewers.",
    );
  } catch (error) {
    console.error("Failed to save token:", error);
    showStatus("error", "Failed to save token: " + error.message);
  }
});
