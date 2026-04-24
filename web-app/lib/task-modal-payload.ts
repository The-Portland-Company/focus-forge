export function nullableEditFieldValue(
  value: string,
  isEditMode: boolean,
): string | null | undefined {
  return value || (isEditMode ? null : undefined);
}
