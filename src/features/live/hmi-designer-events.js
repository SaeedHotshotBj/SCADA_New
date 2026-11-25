import {
  handleHmiDesignerPointerDown,
  handleHmiDesignerPointerMove,
  handleHmiDesignerPointerUp,
  handleHmiDesignerMouseDown,
  handleHmiDesignerMouseMove,
  handleHmiDesignerMouseUp,
} from "./hmi-designer.js";

export function bindHmiDesignerGestureEvents(target = document) {
  target.addEventListener("dragstart", event => {
    if (event.target?.closest?.(".hmi-layout-preview-window")) event.preventDefault();
  }, true);

  target.addEventListener("pointerdown", event => {
    handleHmiDesignerPointerDown(event);
  }, true);
  target.addEventListener("pointermove", event => {
    handleHmiDesignerPointerMove(event);
  }, true);
  target.addEventListener("pointerup", event => {
    handleHmiDesignerPointerUp(event);
  }, true);
  target.addEventListener("pointercancel", event => {
    handleHmiDesignerPointerUp(event);
  }, true);

  // Keep a desktop mouse fallback. In browsers that emit both pointer and
  // compatibility mouse events, the active pointer gesture prevents duplicate
  // gesture initialization; the mouse path only starts if pointerdown did not.
  target.addEventListener("mousedown", event => {
    handleHmiDesignerMouseDown(event);
  }, true);
  target.addEventListener("mousemove", event => {
    handleHmiDesignerMouseMove(event);
  }, true);
  target.addEventListener("mouseup", () => {
    handleHmiDesignerMouseUp();
  }, true);
}
