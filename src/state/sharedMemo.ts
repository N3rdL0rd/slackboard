/**
 * Remembers the last result of `f`, keyed on its arguments by identity. Hooks that every screen calls over the same store data
 * (the activity list, the overview) use it so a change to the log is computed once, not once per mounted component.
 */
export function memoLast<A extends unknown[], R>(f: (...args: A) => R): (...args: A) => R {
  let last: { args: A; value: R } | null = null;
  return (...args: A): R => {
    if (last && last.args.length === args.length && last.args.every((a, i) => Object.is(a, args[i]))) return last.value;
    const value = f(...args);
    last = { args, value };
    return value;
  };
}
