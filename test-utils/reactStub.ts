import { createSimpleDocument, SimpleElement, SimpleText } from './simpleDom';

const Fragment = Symbol('Fragment');

type EffectEntry = { deps?: any[]; cleanup?: (() => void) | void };
type CallbackEntry = { deps?: any[]; value: any };

type TemplateChild = any;

type ElementType = string | typeof Fragment | ((props: any) => any);

type ElementNode = {
  type: ElementType;
  props: Record<string, any> | null;
};

let currentInstance: ComponentInstance | null = null;

const dom = createSimpleDocument();

let pendingTasks = 0;
const waiters: (() => void)[] = [];

const notifyWaiters = () => {
  if (pendingTasks === 0) {
    while (waiters.length) {
      const resolve = waiters.shift();
      if (resolve) resolve();
    }
  }
};

const scheduleTask = (fn: () => void) => {
  pendingTasks += 1;
  Promise.resolve()
    .then(fn)
    .catch(error => {
      setTimeout(() => {
        throw error;
      }, 0);
    })
    .finally(() => {
      pendingTasks -= 1;
      notifyWaiters();
    });
};

const waitForIdle = () => (pendingTasks === 0 ? Promise.resolve() : new Promise<void>(resolve => waiters.push(resolve)));

const flattenChildren = (children: TemplateChild[]): TemplateChild[] => {
  const result: TemplateChild[] = [];
  children.forEach(child => {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
    } else {
      result.push(child);
    }
  });
  return result;
};

const createElement = (type: ElementType, props: Record<string, any> | null, ...children: TemplateChild[]): ElementNode => {
  const normalizedProps = props ? { ...props } : {};
  if (children.length > 0) {
    const flatChildren = flattenChildren(children);
    normalizedProps.children = flatChildren.length === 1 ? flatChildren[0] : flatChildren;
  }
  return { type, props: normalizedProps };
};

const applyProps = (node: SimpleElement, props: Record<string, any>) => {
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children' || value === undefined || value === null) {
      return;
    }
    if (key === 'className') {
      node.className = String(value);
      return;
    }
    if (key === 'htmlFor') {
      node.setAttribute('for', String(value));
      return;
    }
    if (key === 'value') {
      node.value = String(value);
      return;
    }
    if (key === 'disabled') {
      node.disabled = Boolean(value);
      return;
    }
    if (key.startsWith('on') && typeof value === 'function') {
      const eventName = key.slice(2).toLowerCase();
      node.addEventListener(eventName, value as (event: { type: string }) => void);
      return;
    }
    if (key.startsWith('aria') || key.startsWith('data')) {
      node.setAttribute(key, String(value));
      return;
    }
    if (typeof value === 'boolean') {
      if (value) {
        node.setAttribute(key.toLowerCase(), '');
      } else {
        node.removeAttribute(key.toLowerCase());
      }
      return;
    }
    const attrName = key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
    node.setAttribute(attrName, String(value));
  });
};

const mountElement = (element: any, parent: SimpleElement) => {
  if (element === null || element === undefined || typeof element === 'boolean') {
    return;
  }
  if (Array.isArray(element)) {
    element.forEach(child => mountElement(child, parent));
    return;
  }
  if (typeof element === 'string' || typeof element === 'number') {
    parent.appendChild(dom.createTextNode(String(element)));
    return;
  }
  if (typeof element.type === 'function') {
    const rendered = element.type({ ...(element.props || {}), children: element.props?.children });
    mountElement(rendered, parent);
    return;
  }
  if (element.type === Fragment) {
    mountElement(element.props?.children, parent);
    return;
  }
  const node = dom.createElement(element.type as string);
  if (element.props) {
    applyProps(node, element.props);
  }
  const child = element.props?.children;
  if (child !== undefined) {
    mountElement(child, node);
  }
  parent.appendChild(node);
};

class ComponentInstance {
  component: (props: any) => any;
  props: any;
  container: SimpleElement;
  stateValues: any[] = [];
  callbackValues: CallbackEntry[] = [];
  memoValues: CallbackEntry[] = [];
  effectEntries: EffectEntry[] = [];
  stateIndex = 0;
  callbackIndex = 0;
  memoIndex = 0;
  effectIndex = 0;
  pendingRender = false;
  pendingEffects: { index: number; effect: () => void }[] = [];
  isMounted = true;

  constructor(component: (props: any) => any, props: any, container: SimpleElement) {
    this.component = component;
    this.props = props;
    this.container = container;
  }

  render() {
    if (!this.isMounted) return;
    this.pendingRender = false;
    this.stateIndex = 0;
    this.callbackIndex = 0;
    this.memoIndex = 0;
    this.effectIndex = 0;
    this.pendingEffects = [];
    currentInstance = this;
    const output = this.component(this.props);
    currentInstance = null;
    this.container.innerHTML = '';
    mountElement(output, this.container);
    this.flushEffects();
  }

  scheduleRender() {
    if (!this.isMounted || this.pendingRender) {
      return;
    }
    this.pendingRender = true;
    scheduleTask(() => {
      if (!this.isMounted) {
        return;
      }
      this.render();
    });
  }

  registerEffect(effect: () => void, deps?: any[]) {
    const index = this.effectIndex++;
    const previous = this.effectEntries[index];
    let shouldRun = false;
    if (!previous) {
      shouldRun = true;
    } else if (!deps) {
      shouldRun = true;
    } else if (!previous.deps) {
      shouldRun = true;
    } else if (previous.deps.length !== deps.length) {
      shouldRun = true;
    } else {
      shouldRun = deps.some((dep, depIndex) => !Object.is(dep, previous.deps?.[depIndex]));
    }
    this.effectEntries[index] = { deps };
    if (shouldRun) {
      if (previous?.cleanup) {
        previous.cleanup();
      }
      this.pendingEffects.push({ index, effect });
    }
  }

  flushEffects() {
    if (this.pendingEffects.length === 0) {
      return;
    }
    const effects = this.pendingEffects.splice(0);
    effects.forEach(({ index, effect }) => {
      scheduleTask(() => {
        if (!this.isMounted) {
          return;
        }
        const cleanup = effect();
        this.effectEntries[index] = {
          deps: this.effectEntries[index]?.deps,
          cleanup: typeof cleanup === 'function' ? cleanup : undefined,
        };
      });
    });
  }

  unmount() {
    if (!this.isMounted) return;
    this.isMounted = false;
    this.effectEntries.forEach(entry => {
      if (entry?.cleanup) {
        entry.cleanup();
      }
    });
    this.container.remove();
  }
}

const assertInstance = () => {
  if (!currentInstance) {
    throw new Error('Hooks can only be called inside a component.');
  }
  return currentInstance;
};

const useState = <T,>(initial: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void] => {
  const instance = assertInstance();
  const index = instance.stateIndex++;
  if (instance.stateValues[index] === undefined) {
    instance.stateValues[index] = typeof initial === 'function' ? (initial as () => T)() : initial;
  }
  const setState = (value: T | ((prev: T) => T)) => {
    const current = instance.stateValues[index];
    const next = typeof value === 'function' ? (value as (prev: T) => T)(current) : value;
    if (!Object.is(current, next)) {
      instance.stateValues[index] = next;
      instance.scheduleRender();
    }
  };
  return [instance.stateValues[index] as T, setState];
};

const useCallback = <T extends (...args: any[]) => any>(callback: T, deps?: any[]): T => {
  const instance = assertInstance();
  const index = instance.callbackIndex++;
  const previous = instance.callbackValues[index];
  let shouldStore = true;
  if (previous && deps && previous.deps && previous.deps.length === deps.length) {
    shouldStore = deps.some((dep, depIndex) => !Object.is(dep, previous.deps?.[depIndex]));
  }
  if (!previous) {
    shouldStore = true;
  }
  if (!deps) {
    shouldStore = true;
  }
  if (shouldStore) {
    instance.callbackValues[index] = { deps, value: callback };
  }
  return (instance.callbackValues[index]?.value ?? callback) as T;
};

const useMemo = <T,>(factory: () => T, deps?: any[]): T => {
  const instance = assertInstance();
  const index = instance.memoIndex++;
  const previous = instance.memoValues[index];
  if (!previous) {
    const initialValue = factory();
    instance.memoValues[index] = { deps, value: initialValue };
    return initialValue;
  }
  let shouldRecompute = false;
  if (!deps) {
    shouldRecompute = true;
  } else if (!previous.deps) {
    shouldRecompute = true;
  } else if (previous.deps.length !== deps.length) {
    shouldRecompute = true;
  } else {
    shouldRecompute = deps.some((dep, depIndex) => !Object.is(dep, previous.deps?.[depIndex]));
  }
  if (shouldRecompute) {
    const value = factory();
    instance.memoValues[index] = { deps, value };
    return value;
  }
  return previous.value;
};

const useEffect = (effect: () => void | (() => void), deps?: any[]) => {
  const instance = assertInstance();
  instance.registerEffect(effect, deps);
};

const instances = new Set<ComponentInstance>();

const renderComponent = (component: (props: any) => any, props: any = {}) => {
  const container = dom.createElement('div');
  dom.body.appendChild(container);
  const instance = new ComponentInstance(component, props, container);
  instances.add(instance);
  instance.render();
  return {
    container,
    rerender(nextProps: Record<string, any> = {}) {
      instance.props = { ...instance.props, ...nextProps };
      instance.scheduleRender();
    },
    unmount() {
      instance.unmount();
      instances.delete(instance);
    },
  };
};

const cleanup = () => {
  instances.forEach(instance => instance.unmount());
  instances.clear();
  dom.body.innerHTML = '';
};

const defaultExport = Object.assign(
  { createElement, Fragment },
  {
    useState,
    useEffect,
    useCallback,
    useMemo,
    __render: renderComponent,
    __waitForIdle: waitForIdle,
    __cleanup: cleanup,
  },
);

export type ReactStubExports = typeof defaultExport;

export { Fragment, createElement, useState, useEffect, useCallback, useMemo, renderComponent as __render, waitForIdle as __waitForIdle, cleanup as __cleanup };

export default defaultExport;
