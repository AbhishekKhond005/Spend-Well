// Set the theme before the stylesheet loads so the first paint uses the right palette.
(() => {
  const key = "spendwell:theme:" + new URL(".", location.href).pathname;
  const device = window.matchMedia("(prefers-color-scheme: dark)");
  const root = document.documentElement;
  const themeColor = document.querySelector('meta[name="theme-color"]');
  let choice;

  function apply(value) {
    choice = ["light", "dark"].includes(value) ? value : "system";
    const theme =
      choice === "system" ? (device.matches ? "dark" : "light") : choice;
    root.dataset.theme = theme;
    root.dataset.themePreference = choice;
    themeColor?.setAttribute(
      "content",
      theme === "dark" ? "#16131f" : "#f8f9fc",
    );
    for (const select of document.querySelectorAll("[data-theme-choice]")) {
      select.value = choice;
    }
  }

  try {
    apply(localStorage.getItem(key));
  } catch {
    apply("system");
  }
  device.addEventListener("change", () => {
    if (choice === "system") apply(choice);
  });
  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
  document.addEventListener("change", (event) => {
    if (!event.target.matches("select[data-theme-choice]")) return;
    apply(event.target.value);
    try {
      localStorage.setItem(key, choice);
    } catch {
      // Apply the theme for this visit when storage is unavailable.
    }
  });
})();
