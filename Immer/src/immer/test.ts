window.__DEV__ = true;
import produce, { enablePatches, applyPatches } from './immer';
enablePatches();

// var a = Object.create({ name: { age: 333 }, fan: { zz: 333 } });
var a = { name: { age: 333 }, fan: { zz: 333 } };
// Object.defineProperty(Object.getPrototypeOf(a), 'toString', {
//   set() {
//     console.log('TTTest toString');
//   },
// });
let obj = a.name;
// var c = [{ name: 333 }];
function run() {
  let stash = [];
  let inverseStash = [];
  console.log('执行前');
  var b = produce(
    a,
    (draft) => {
      draft.name.gg = '1000';
      draft.name.age = 1000;
      delete draft.fan.zz;
    },
    (patches, inversePatches) => {
      stash = stash.concat(patches);
      inverseStash = inversePatches.concat(inversePatches);
      console.log('patches', patches);
      console.log('inversePatches', inversePatches);
    },
  );
  console.log('执行后', b, a);
  console.log('stash', stash);
  // console.log('历史回溯', applyPatches(b, inverseStash));
}
run();
