function showStatus(type, message) {
  const statusDiv = document.getElementById("status");
  statusDiv.className = `status ${type}`;
  statusDiv.textContent = message;
  statusDiv.style.display = "block";
}

document.getElementById("save").addEventListener("click", async () => {
  const tokenInput = document.getElementById("token");
  const token = tokenInput.value.trim();

  if (!token) {
    showStatus("error", "Please enter a token.");
    return;
  }

  if (!token.startsWith("github_pat_")) {
    showStatus(
      "error",
      "Invalid token format. Please enter a valid GitHub fine-grained Personal Access Token (starts with github_pat_).",
    );
    return;
  }

  try {
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
