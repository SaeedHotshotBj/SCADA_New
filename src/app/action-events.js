export function resolveActionElementFromClick(target) {
  if (!target || typeof target.closest !== "function") return null;

  const modal = target.closest(".modal");
  if (modal) {
    // A form field (or its label) must never activate an action on a wrapping
    // container. This matters when a dialog contains action-marked wrappers.
    const formField = target.closest("input, select, textarea, option, label.field, [contenteditable='true']");
    if (formField && modal.contains(formField)) return null;

    // In dialogs, only explicit interactive controls may execute actions.
    const control = target.closest("button[data-action], a[data-action], [role='button'][data-action]");
    return control && modal.contains(control) ? control : null;
  }

  // Preserve the existing delegated action behavior outside dialogs.
  return target.closest("[data-action]");
}
