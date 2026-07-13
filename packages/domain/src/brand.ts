export type Brand<TValue, TBrand extends string> = TValue & {
  readonly __brand: TBrand;
};

export const brand = <TValue, TBrand extends string>(
  value: TValue,
): Brand<TValue, TBrand> => value as Brand<TValue, TBrand>;
