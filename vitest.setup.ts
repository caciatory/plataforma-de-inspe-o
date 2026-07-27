import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// ponytail: jsdom (as of v25) doesn't implement HTMLDialogElement.showModal/close
// at all — calling them throws "not a function", not a friendly no-op. <dialog>
// is now a real pattern in this app (medição/família popovers), so polyfill once
// here rather than guarding every dialogRef.current?.showModal() call-site.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

afterEach(() => {
  cleanup();
});
