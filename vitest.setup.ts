import { beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";

beforeEach(() => {
  localStorage.clear();
});

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
      addListener: () => {},
      removeListener: () => {},
    }),
  });
}

Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
  configurable: true,
  value: function showModal(this: HTMLDialogElement) {
    if (this.open) {
      throw new DOMException("The dialog is already open.", "InvalidStateError");
    }
    this.open = true;
  },
});

Object.defineProperty(HTMLDialogElement.prototype, "close", {
  configurable: true,
  value: function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event("close"));
  },
});
