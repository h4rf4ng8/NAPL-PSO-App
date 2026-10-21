import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement, StrictMode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { useDialog } from '../src/components/Dialog';

class ElementStub {
  isConnected = true;
  visible = true;
  hidden = false;
  children: ElementStub[] = [];
  nested?: ElementStub;
  listeners = new Set<(event: KeyboardEvent) => void>();
  focus() { documentStub.activeElement = this; }
  getClientRects() { return this.visible ? [{}] : []; }
  getAttribute() { return this.hidden ? 'true' : null; }
  querySelectorAll(): ElementStub[] { return [...this.children, ...(this.nested?.querySelectorAll() ?? [])]; }
  contains(element: ElementStub) { return element === this || this.children.includes(element) || !!this.nested?.contains(element); }
  addEventListener(_name: string, listener: (event: KeyboardEvent) => void) { this.listeners.add(listener); }
  removeEventListener(_name: string, listener: (event: KeyboardEvent) => void) { this.listeners.delete(listener); }
  key(key: string, shiftKey = false) {
    const event = { key, shiftKey, prevented: false, stopped: false,
      preventDefault() { event.prevented = true; }, stopPropagation() { event.stopped = true; } };
    for (const listener of this.listeners) listener(event as unknown as KeyboardEvent);
    return event;
  }
}
const documentStub = { activeElement: null as ElementStub | null, body: { style: { overflow: 'auto' } } };
function Probe({ close }: { close?: () => void }) {
  return createElement('div', { ref: useDialog(close) });
}
function mount(element: ElementStub, close?: () => void, strict = false) {
  let renderer!: ReactTestRenderer;
  act(() => { renderer = create(strict ? createElement(StrictMode, null, createElement(Probe, { close })) : createElement(Probe, { close }), { createNodeMock: () => element }); });
  return { update(callback?: () => void) { act(() => renderer.update(createElement(Probe, { close: callback }))); },
    unmount() { act(() => renderer.unmount()); } };
}

test('dialog keyboard and lifecycle behavior', async t => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousHTMLElement = Object.getOwnPropertyDescriptor(globalThis, 'HTMLElement');
  Object.defineProperties(globalThis, {
    document: { value: documentStub, configurable: true },
    HTMLElement: { value: ElementStub, configurable: true },
  });
  t.after(() => {
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument); else Reflect.deleteProperty(globalThis, 'document');
    if (previousHTMLElement) Object.defineProperty(globalThis, 'HTMLElement', previousHTMLElement); else Reflect.deleteProperty(globalThis, 'HTMLElement');
  });
  await t.test('initial focus skips invisible controls, wraps Tab and Shift+Tab, uses latest close and restores opener', () => {
    const opener = new ElementStub(); opener.focus();
    const dialog = new ElementStub();
    const invisible = new ElementStub(); invisible.visible = false;
    const hidden = new ElementStub(); hidden.hidden = true;
    const first = new ElementStub(); const last = new ElementStub();
    dialog.children = [invisible, hidden, first, last];
    let oldCalls = 0; let latestCalls = 0;
    const view = mount(dialog, () => oldCalls++);
    assert.equal(documentStub.activeElement, first);
    assert.equal(documentStub.body.style.overflow, 'hidden');
    last.focus(); assert.equal(dialog.key('Tab').prevented, true);
    assert.equal(documentStub.activeElement, first);
    dialog.key('Tab', true); assert.equal(documentStub.activeElement, last);
    dialog.focus(); dialog.key('Tab', true); assert.equal(documentStub.activeElement, last);
    view.update(() => latestCalls++);
    const escape = dialog.key('Escape');
    assert.equal(escape.prevented, true); assert.equal(escape.stopped, true);
    assert.equal(oldCalls, 0); assert.equal(latestCalls, 1);
    view.unmount();
    assert.equal(documentStub.activeElement, opener);
    assert.equal(documentStub.body.style.overflow, 'auto');
    assert.equal(dialog.listeners.size, 0);
  });
  await t.test('mandatory empty dialog traps focus and ignores Escape; disconnected opener is ignored', () => {
    const opener = new ElementStub(); opener.focus();
    const dialog = new ElementStub(); const view = mount(dialog);
    assert.equal(documentStub.activeElement, dialog);
    assert.equal(dialog.key('Tab').prevented, true);
    assert.equal(dialog.key('Tab', true).prevented, true);
    assert.equal(dialog.key('Escape').prevented, false);
    opener.isConnected = false; view.unmount();
    assert.equal(documentStub.activeElement, dialog);
    assert.equal(documentStub.body.style.overflow, 'auto');
  });
  await t.test('nested dialog alone handles keys, returns to parent opener and retains scroll lock', () => {
    const opener = new ElementStub(); opener.focus();
    const parent = new ElementStub(); const pickerButton = new ElementStub(); parent.children = [pickerButton];
    let parentClose = 0; let childClose = 0;
    const outer = mount(parent, () => parentClose++);
    const child = new ElementStub(); const choice = new ElementStub(); child.children = [choice];
    const inner = mount(child, () => childClose++);
    parent.nested = child;
    parent.key('Tab'); assert.equal(documentStub.activeElement, choice);
    child.key('Escape'); parent.key('Escape');
    assert.equal(childClose, 1); assert.equal(parentClose, 0);
    inner.unmount();
    assert.equal(documentStub.activeElement, pickerButton);
    assert.equal(documentStub.body.style.overflow, 'hidden');
    outer.unmount(); assert.equal(documentStub.activeElement, opener);
    assert.equal(documentStub.body.style.overflow, 'auto');
  });
  await t.test('closing all dialogs parent first restores original focus and overflow', () => {
    const opener = new ElementStub(); opener.focus();
    const parent = new ElementStub(); const button = new ElementStub(); parent.children = [button];
    const outer = mount(parent); const child = new ElementStub(); const inner = mount(child);
    outer.unmount(); button.isConnected = false;
    assert.equal(documentStub.body.style.overflow, 'hidden');
    inner.unmount(); assert.equal(documentStub.body.style.overflow, 'auto');
    assert.equal(documentStub.activeElement, opener);
  });
  await t.test('StrictMode mount and effect replay leave no listeners or scroll lock', () => {
    const opener = new ElementStub(); opener.focus(); const dialog = new ElementStub();
    const first = mount(dialog, undefined, true);
    assert.equal(dialog.listeners.size, 1); first.unmount();
    assert.equal(dialog.listeners.size, 0); assert.equal(documentStub.body.style.overflow, 'auto');
    const replay = mount(dialog, undefined, true); replay.unmount();
    assert.equal(dialog.listeners.size, 0); assert.equal(documentStub.activeElement, opener);
  });
});
