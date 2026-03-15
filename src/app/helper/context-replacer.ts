export function replaceContext<
  TSource extends object,
  TKey extends keyof TSource,
>(object: TSource, targets: TKey[], contextSubKey?: TKey): TSource {
  const copy = { ...object };
  const context = { ...(contextSubKey ? copy[contextSubKey] : copy) } as object;

  for (const key of Object.keys(context)) {
    for (const target of targets) {
      if (typeof copy[target] !== 'string') {
        continue;
      }
      copy[target] = (copy[target] as string).replaceAll(
        `{${key}}`,
        context[key as keyof typeof context] as string,
      ) as TSource[TKey];
    }
  }

  return copy;
}
