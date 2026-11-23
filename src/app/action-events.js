export function resolveActionElementFromClick(target) {
  if (!target || typeof target.closest !== "function") return null;

  // Inside a modal, only an action explicitly declared inside that modal is actionable.
  // This prevents ordinary form clicks from inheriting the backdrop's close action.
  if (target.closest(".modal")) {
    return target.closest(".modal [data-action]");
  }

  // A click on the backdrop itself still resolves to its close action.
  return target.closest("[data-action]");
}
