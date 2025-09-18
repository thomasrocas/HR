export type SimpleEventHandler = (event: { type: string }) => void;

class SimpleNode {
  parent: SimpleElement | null = null;
}

export class SimpleText extends SimpleNode {
  private value: string;

  constructor(text: string) {
    super();
    this.value = text;
  }

  get textContent(): string {
    return this.value;
  }

  set textContent(value: string) {
    this.value = value;
  }
}

export class SimpleElement extends SimpleNode {
  readonly tagName: string;
  private attributes = new Map<string, string>();
  private childrenNodes: (SimpleElement | SimpleText)[] = [];
  private listeners = new Map<string, SimpleEventHandler[]>();

  constructor(tag: string) {
    super();
    this.tagName = tag.toLowerCase();
  }

  appendChild<T extends SimpleElement | SimpleText>(child: T): T {
    if (child.parent) {
      child.parent.removeChild(child);
    }
    child.parent = this;
    this.childrenNodes.push(child);
    return child;
  }

  removeChild(child: SimpleElement | SimpleText) {
    const index = this.childrenNodes.indexOf(child);
    if (index >= 0) {
      this.childrenNodes.splice(index, 1);
      child.parent = null;
    }
  }

  remove() {
    if (this.parent) {
      this.parent.removeChild(this);
    }
  }

  setAttribute(name: string, value: string) {
    const normalized = name.toLowerCase();
    this.attributes.set(normalized, String(value));
    if (normalized === 'class') {
      this.attributes.set('class', String(value));
    }
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name.toLowerCase());
  }

  removeAttribute(name: string) {
    this.attributes.delete(name.toLowerCase());
  }

  addEventListener(type: string, handler: SimpleEventHandler) {
    const normalized = type.toLowerCase();
    if (!this.listeners.has(normalized)) {
      this.listeners.set(normalized, []);
    }
    this.listeners.get(normalized)!.push(handler);
  }

  dispatchEvent(event: { type: string }) {
    const normalized = event.type.toLowerCase();
    const handlers = this.listeners.get(normalized) ?? [];
    handlers.forEach(handler => handler.call(this, event));
    return handlers.length > 0;
  }

  querySelectorAll(selector: string): SimpleElement[] {
    const results: SimpleElement[] = [];
    const normalized = selector.trim();
    const match = (element: SimpleElement) => {
      if (normalized.startsWith('[') && normalized.endsWith(']')) {
        const inner = normalized.slice(1, -1);
        const [attrName, rawValue] = inner.split('=');
        const attribute = attrName.trim();
        const expected = rawValue ? rawValue.replace(/^"|"$/g, '') : undefined;
        const actual = element.getAttribute(attribute);
        if (expected === undefined) {
          return actual !== undefined;
        }
        return actual === expected;
      }
      return element.tagName === normalized.toLowerCase();
    };

    const walk = (node: SimpleElement | SimpleText) => {
      if (node instanceof SimpleElement) {
        if (match(node)) {
          results.push(node);
        }
        node.childrenNodes.forEach(child => walk(child));
      }
    };

    this.childrenNodes.forEach(child => walk(child));
    return results;
  }

  querySelector(selector: string): SimpleElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  get className(): string {
    return this.getAttribute('class') ?? '';
  }

  set className(value: string) {
    this.setAttribute('class', value);
  }

  get value(): string {
    return this.getAttribute('value') ?? '';
  }

  set value(value: string) {
    this.setAttribute('value', value);
  }

  get disabled(): boolean {
    return this.attributes.has('disabled');
  }

  set disabled(value: boolean) {
    if (value) {
      this.attributes.set('disabled', '');
    } else {
      this.attributes.delete('disabled');
    }
  }

  get textContent(): string {
    return this.childrenNodes.map(child => child.textContent).join('');
  }

  set textContent(value: string) {
    this.childrenNodes = [new SimpleText(value)];
  }

  set innerHTML(value: string) {
    if (!value) {
      this.childrenNodes = [];
      return;
    }
    this.childrenNodes = [new SimpleText(value)];
  }

  get children(): (SimpleElement | SimpleText)[] {
    return this.childrenNodes.slice();
  }
}

export class SimpleDocument {
  readonly body: SimpleElement;

  constructor() {
    this.body = new SimpleElement('body');
  }

  createElement(tag: string): SimpleElement {
    return new SimpleElement(tag);
  }

  createTextNode(text: string): SimpleText {
    return new SimpleText(text);
  }
}

export const createSimpleDocument = () => new SimpleDocument();
