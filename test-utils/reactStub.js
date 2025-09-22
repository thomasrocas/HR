const PENDING = Symbol('pending');

let currentInstance = null;

function createElement(type, props, ...children) {
  const normalizedChildren = [];
  const pushChild = child => {
    if (child === null || child === undefined || child === false) {
      return;
    }
    if (Array.isArray(child)) {
      child.forEach(pushChild);
    } else {
      normalizedChildren.push(child);
    }
  };
  children.forEach(pushChild);
  const nextProps = { ...(props || {}) };
  if (normalizedChildren.length === 1) {
    nextProps.children = normalizedChildren[0];
  } else if (normalizedChildren.length > 1) {
    nextProps.children = normalizedChildren;
  }
  return { type, props: nextProps };
}

function shallowEqualDeps(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

function renderInstance(instance) {
  currentInstance = instance;
  instance.hookIndex = 0;
  instance.pendingEffects = [];
  const output = instance.component(instance.props);
  currentInstance = null;
  instance.tree = output;
  flushEffects(instance);
  return output;
}

function flushEffects(instance) {
  const pending = instance.pendingEffects || [];
  instance.pendingEffects = [];
  for (const index of pending) {
    const record = instance.hooks[index];
    if (!record) continue;
    if (typeof record.cleanup === 'function') {
      try {
        record.cleanup();
      } catch (err) {
        // ignore cleanup errors in tests
      }
    }
    try {
      const cleanup = record.effect();
      record.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
    } catch (err) {
      // ignore effect errors for tests
    }
  }
}

function ensureInstance() {
  if (!currentInstance) {
    throw new Error('Hooks can only be called inside the component body.');
  }
  return currentInstance;
}

function useState(initial) {
  const instance = ensureInstance();
  const index = instance.hookIndex++;
  if (!(index in instance.hooks)) {
    instance.hooks[index] = typeof initial === 'function' ? initial() : initial;
  }
  const setState = value => {
    const nextValue = typeof value === 'function' ? value(instance.hooks[index]) : value;
    if (!Object.is(nextValue, instance.hooks[index])) {
      instance.hooks[index] = nextValue;
      instance.render();
    }
  };
  return [instance.hooks[index], setState];
}

function useMemo(factory, deps) {
  const instance = ensureInstance();
  const index = instance.hookIndex++;
  const record = instance.hooks[index];
  if (record && deps && shallowEqualDeps(deps, record.deps)) {
    return record.value;
  }
  const value = factory();
  instance.hooks[index] = { value, deps };
  return value;
}

function useCallback(fn, deps) {
  return useMemo(() => fn, deps);
}

function useEffect(effect, deps) {
  const instance = ensureInstance();
  const index = instance.hookIndex++;
  const prev = instance.hooks[index];
  const shouldRun = !prev || !deps || !shallowEqualDeps(deps, prev.deps);
  instance.hooks[index] = { effect, deps, cleanup: prev && prev.cleanup };
  if (shouldRun) {
    instance.pendingEffects.push(index);
  }
}

function useRef(initial) {
  const instance = ensureInstance();
  const index = instance.hookIndex++;
  if (!(index in instance.hooks)) {
    instance.hooks[index] = { current: initial };
  }
  return instance.hooks[index];
}

function createRoot(component, props) {
  const instance = {
    component,
    props,
    hooks: [],
    hookIndex: 0,
    tree: null,
    effects: [],
    pendingEffects: [],
    render: null,
  };
  instance.render = () => renderInstance(instance);
  instance.render();
  return instance;
}

const ReactStub = {
  createElement,
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
  Fragment: Symbol.for('fragment'),
  __createRoot: createRoot,
};

module.exports = ReactStub;
module.exports.default = ReactStub;
module.exports.createElement = createElement;
module.exports.useState = useState;
module.exports.useMemo = useMemo;
module.exports.useCallback = useCallback;
module.exports.useEffect = useEffect;
module.exports.useRef = useRef;
module.exports.__createRoot = createRoot;
