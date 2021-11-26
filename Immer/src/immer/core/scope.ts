import {
  Patch,
  PatchListener,
  Drafted,
  Immer,
  DRAFT_STATE,
  ImmerState,
  ProxyType,
  getPlugin,
} from '../internal';
import { die } from '../utils/errors';

/** Each scope represents a `produce` call. */

export interface ImmerScope {
  // 历史快照，保存的是操作的顺序
  patches_?: Patch[];
  // 历史快照反向，保存的是反解顺序，执行这个会恢复
  inversePatches_?: Patch[];
  // 是否自动冻结 都是自动冻结
  canAutoFreeze_: boolean;
  // proxy 队列
  drafts_: any[];
  // 父级scope
  parent_?: ImmerScope;
  patchListener_?: PatchListener;
  // immer实例
  immer_: Immer;
  // 没有标记为true的proxy
  unfinalizedDrafts_: number;
}

let currentScope: ImmerScope | undefined;

export function getCurrentScope() {
  if (__DEV__ && !currentScope) die(0);
  return currentScope!;
}

type FunctionPropertyNames<T, C extends IHttp> = {
  [K in keyof Part]: Part[K][C] extends Function ? K : never;
};

interface Part {
  // id: number;
  // name: string;
  // subparts: Part[];
  // updatePart(newName: string): void;
  adfzxcv: {
    aa: 1;
    GET: 4;
    POST: 333;
  };
}
declare global {
  interface M {}
}
type c = {
  [p in keyof M]: M[p];
};

interface IApi {
  age: {
    GET: never;
    POST: 333;
  };
}

type T40 = FunctionPropertyNames<IApi, IHttp>;

interface IApi {
  age: {
    GET: never;
    POST: 333;
  };
}
type IHttp = 'GET' | 'POST';
type IUrl<T extends IHttp> = {
  [p in keyof IApi]: IApi[p][T] extends never ? never : p;
}[keyof IApi];

// type c = IUrl<IHttp>;

function createScope(
  parent_: ImmerScope | undefined,
  immer_: Immer,
): ImmerScope {
  return {
    drafts_: [],
    parent_,
    immer_,
    // Whenever the modified draft contains a draft from another scope, we
    // need to prevent auto-freezing so the unowned draft can be finalized.
    canAutoFreeze_: true,
    unfinalizedDrafts_: 0,
  };
}

export function usePatchesInScope(
  scope: ImmerScope,
  patchListener?: PatchListener,
) {
  if (patchListener) {
    // 如果外面每调用enablePatches 注册Patches这个plugin，直接报错
    getPlugin('Patches'); // assert we have the plugin
    scope.patches_ = [];
    scope.inversePatches_ = [];
    scope.patchListener_ = patchListener;
  }
}

// recipe调用结束后，如果调用报错，将所有的proxy代理对象撤销后置空，停止后续流程
export function revokeScope(scope: ImmerScope) {
  // 清除当前scope
  leaveScope(scope);
  scope.drafts_.forEach(revokeDraft);
  // @ts-ignore
  scope.drafts_ = null;
}

// 没撤销代理对象
export function leaveScope(scope: ImmerScope) {
  if (scope === currentScope) {
    currentScope = scope.parent_;
  }
}

export function enterScope(immer: Immer) {
  console.log('currentScope', currentScope);
  return (currentScope = createScope(currentScope, immer));
}

function revokeDraft(draft: Drafted) {
  const state: ImmerState = draft[DRAFT_STATE];
  if (
    state.type_ === ProxyType.ProxyObject ||
    state.type_ === ProxyType.ProxyArray
  )
    state.revoke_();
  else state.revoked_ = true;
}
