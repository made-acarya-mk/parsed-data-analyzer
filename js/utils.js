function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error("Failed to copy to clipboard:", error);
    return false;
  }
}

function showError(message) {
  const errorMessage = document.getElementById("errorMessage");

  if (!errorMessage) {
    return;
  }

  errorMessage.textContent = message;
  errorMessage.style.display = "block";
}

function hideError() {
  const errorMessage = document.getElementById("errorMessage");

  if (!errorMessage) {
    return;
  }

  errorMessage.textContent = "";
  errorMessage.style.display = "none";
}