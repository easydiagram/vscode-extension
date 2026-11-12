/** Narrows a string to one of a literal union's options without a type assertion. */
export function oneOf<T extends string>(options: readonly T[], value: string): T | undefined {
  return options.find((option) => option === value);
}
