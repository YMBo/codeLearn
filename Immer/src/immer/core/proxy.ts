import {
  each,
  has,
  is,
  isDraftable,
  shallowCopy,
  latest,
  ImmerBaseState,
  ImmerState,
  Drafted,
  AnyObject,
  AnyArray,
  Objectish,
  getCurrentScope,
  DRAFT_STATE,
  die,
  createProxy,
  ProxyType,
} from '../internal';

interface ProxyBaseState extends ImmerBaseState {
  assigned_: {
    [property: string]: boolean;
  };
  parent_?: ImmerState;
  revoke_(): void;
}

export interface ProxyObjectState extends ProxyBaseState {
  type_: ProxyType.ProxyObject;
  base_: any;
  copy_: any;
  draft_: Drafted<AnyObject, ProxyObjectState>;
}

export interface ProxyArrayState extends ProxyBaseState {
  type_: ProxyType.ProxyArray;
  base_: AnyArray;
  copy_: AnyArray | null;
  draft_: Drafted<AnyArray, ProxyArrayState>;
}

type ProxyState = ProxyObjectState | ProxyArrayState;

/**
 * Returns a new draft of the `base` object.
 *
 * The second argument is the parent draft-state (used internally).
 */
export function createProxyProxy<T extends Objectish>(
  base: T,
  parent?: ImmerState,
): Drafted<T, ProxyState> {
  const isArray = Array.isArray(base);

  // 对这个东西做了代理
  const state: ProxyState = {
    type_: isArray ? ProxyType.ProxyArray : (ProxyType.ProxyObject as any),
    // Track which produce call this is associated with.
    scope_: parent ? parent.scope_ : getCurrentScope()!,
    // True for both shallow and deep changes.
    modified_: false,
    // Used during finalization.
    finalized_: false,
    // Track which properties have been assigned (true) or deleted (false).
    // 表示已被分配（就是被修改过）
    assigned_: {},
    // The parent draft state.
    parent_: parent,
    // The base state.
    base_: base,
    // The base proxy.
    draft_: null as any, // set below
    // 会将每一层的base浅拷贝到copy上
    copy_: null,
    // Called by the `produce` function.
    revoke_: null as any,
    isManual_: false,
  };

  // the traps must target something, a bit like the 'real' base.
  // but also, we need to be able to determine from the target what the relevant state is
  // (to avoid creating traps per instance to capture the state in closure,
  // and to avoid creating weird hidden properties as well)
  // So the trick is to use 'state' as the actual 'target'! (and make sure we intercept everything)
  // Note that in the case of an array, we put the state in an array to have better Reflect defaults ootb
  let target: T = state as any;
  let traps: ProxyHandler<object | Array<any>> = objectTraps;
  if (isArray) {
    target = [state] as any;
    traps = arrayTraps;
  }

  const { revoke, proxy } = Proxy.revocable(target, traps);
  state.draft_ = proxy as any;
  state.revoke_ = revoke;
  return proxy as any;
}

/**
 * Object drafts
 */
export const objectTraps: ProxyHandler<ProxyState> = {
  get(state, prop) {
    if (prop === DRAFT_STATE) return state;
    console.log('state', state, prop);
    const source = latest(state);
    // 如果取原型上属性的时候就会走到这个方法
    if (!has(source, prop)) {
      // non-existing or non-own property...
      // 明明可以直接source[prop]这样读取，为什么要手动去原型链上找？
      return readPropFromProto(state, source, prop);
    }
    const value = source[prop];
    // 如果已修改过或非proxy，则直接返回值
    // !isDraftable(value)很重要，{name:{age:1}} ,这种结构修改时draft.name.age，这个age是个number，不会被代理
    if (state.finalized_ || !isDraftable(value)) {
      return value;
    }
    // Check for existing draft in modified state.
    // Assigned values are never drafted. This catches any drafts we created, too.
    // 这里比的是可能修改过得值value和原始值peek value是否相等。如果相等表示没有修改过，返回proxy
    // 如果不相等说明改动过，返回代理proxy

    // peek直接取得是原始值，这里做的判断，如果相等那就proxy一下，否则不重复代理
    console.log('ooooooo', value);
    if (value === peek(state.base_, prop)) {
      console.log('代理get', state.copy_, prop);
      // 浅拷贝base到copy
      prepareCopy(state);
      // 针对具体的属性做代理
      state.copy_![prop as any] = createProxy(
        state.scope_.immer_,
        value,
        state,
      );
      console.log('zzzzz', state.copy_![prop as any]);
      return state.copy_![prop as any];
    }

    return value;
  },

  has(state, prop) {
    return prop in latest(state);
  },
  ownKeys(state) {
    return Reflect.ownKeys(latest(state));
  },
  set(
    state: ProxyObjectState,
    prop: string /* strictly not, but helps TS */,
    value,
  ) {
    console.log('设置set', state, prop, value);
    // 第一次进来的时候copy还没有值，所以这里取的是base
    // getDescriptorFromProto从原型链上找对应的prop描述器

    const desc = getDescriptorFromProto(latest(state), prop);
    console.log('desc', desc);

    // ？？？？ 原型上的属性set调用， 前面的isPlainObject已经限制了只有一层原型的继承，这里是干嘛？
    // 原型上的修改不做代理
    if (desc?.set) {
      // special case: if this write is captured by a setter, we have
      // to trigger it with the correct context

      // 执行对应属性的setter
      console.log('state.draft_,', state.draft_);
      desc.set.call(state.draft_, value);
      return true;
    }
    // modified_ 表示是否修改过，第一次进来是false
    if (!state.modified_) {
      // the last check is because we need to be able to distinguish setting a non-existing to undefined (which is a change)
      // from setting an existing property with value undefined to undefined (which is not a change)

      // 获取prop对应的value
      const current = peek(latest(state), prop);

      // special case, if we assigning the original value to a draft, we can ignore the assignment

      // 这个是为了取原数据，而不参与get的计算，针对的是如果current是proxy的情况
      const currentState: ProxyObjectState = current?.[DRAFT_STATE];
      // 如果currentState 值存在 说明 current已经被代理过了
      // 如果新值和旧值相等，则赋值返回
      // draft.name = a.name;像这种给数据赋值但其实没变化的操作就会进这里，但是modified不会变，
      // 也就意味着finalize.ts 81行，就是不会触发patchListener_
      if (currentState && currentState.base_ === value) {
        // 像这种整体赋值的，并不会标记modified=true
        state.copy_![prop] = value;
        // 而且会认为这种操作相当于一个remove操作
        state.assigned_[prop] = false;
        return true;
      }
      if (is(value, current) && (value !== undefined || has(state.base_, prop)))
        return true;
      // 拷贝state到copy属性
      prepareCopy(state);
      // 修改modified_状态
      markChanged(state);
    }

    if (
      state.copy_![prop] === value &&
      // special case: NaN
      typeof value !== 'number' &&
      // special case: handle new props with value 'undefined'
      (value !== undefined || prop in state.copy_)
    )
      return true;

    // @ts-ignore
    state.copy_![prop] = value;
    console.log('mmmmmmm', state, prop);
    state.assigned_[prop] = true;
    return true;
  },
  deleteProperty(state, prop: string) {
    // The `undefined` check is a fast path for pre-existing keys.
    if (peek(state.base_, prop) !== undefined || prop in state.base_) {
      state.assigned_[prop] = false;
      prepareCopy(state);
      markChanged(state);
    } else {
      // if an originally not assigned property was deleted
      delete state.assigned_[prop];
    }
    // @ts-ignore
    if (state.copy_) delete state.copy_[prop];
    return true;
  },
  // Note: We never coerce `desc.value` into an Immer draft, because we can't make
  // the same guarantee in ES5 mode.
  getOwnPropertyDescriptor(state, prop) {
    const owner = latest(state);
    const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
    if (!desc) return desc;
    return {
      writable: true,
      configurable: state.type_ !== ProxyType.ProxyArray || prop !== 'length',
      enumerable: desc.enumerable,
      value: owner[prop],
    };
  },
  defineProperty() {
    die(11);
  },
  getPrototypeOf(state) {
    return Object.getPrototypeOf(state.base_);
  },
  setPrototypeOf() {
    die(12);
  },
};

/**
 * Array drafts
 */

const arrayTraps: ProxyHandler<[ProxyArrayState]> = {};
each(objectTraps, (key, fn) => {
  // @ts-ignore
  arrayTraps[key] = function () {
    arguments[0] = arguments[0][0];
    return fn.apply(this, arguments);
  };
});
arrayTraps.deleteProperty = function (state, prop) {
  if (__DEV__ && isNaN(parseInt(prop as any))) die(13);
  return objectTraps.deleteProperty!.call(this, state[0], prop);
};
arrayTraps.set = function (state, prop, value) {
  if (__DEV__ && prop !== 'length' && isNaN(parseInt(prop as any))) die(14);
  return objectTraps.set!.call(this, state[0], prop, value, state[0]);
};

// Access a property without creating an Immer draft.
function peek(draft: Drafted, prop: PropertyKey) {
  // get里做的判断，这里取得是state本身
  const state = draft[DRAFT_STATE];
  const source = state ? latest(state) : draft;
  return source[prop];
}

function readPropFromProto(state: ImmerState, source: any, prop: PropertyKey) {
  const desc = getDescriptorFromProto(source, prop);
  return desc
    ? `value` in desc
      ? desc.value
      : // This is a very special case, if the prop is a getter defined by the
        // prototype, we should invoke it with the draft as context!
        // 如果没有value则直接调用getter
        desc.get?.call(state.draft_)
    : undefined;
}

function getDescriptorFromProto(
  source: any,
  prop: PropertyKey,
): PropertyDescriptor | undefined {
  // 'in' checks proto!
  if (!(prop in source)) return undefined;
  // 获取source原型
  let proto = Object.getPrototypeOf(source);
  while (proto) {
    // 从原型上找key的描述器
    const desc = Object.getOwnPropertyDescriptor(proto, prop);
    if (desc) return desc;
    proto = Object.getPrototypeOf(proto);
  }
  return undefined;
}

export function markChanged(state: ImmerState) {
  if (!state.modified_) {
    state.modified_ = true;
    if (state.parent_) {
      markChanged(state.parent_);
    }
  }
}

// 浅拷贝，只拷贝一层
export function prepareCopy(state: { base_: any; copy_: any }) {
  if (!state.copy_) {
    state.copy_ = shallowCopy(state.base_);
  }
}
