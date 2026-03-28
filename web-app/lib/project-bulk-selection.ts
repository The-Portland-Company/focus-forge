export function setBulkSelectionForTaskIds(
  currentSelection: Set<string>,
  taskIds: string[],
  shouldSelect: boolean,
): Set<string> {
  const nextSelection = new Set(currentSelection);

  for (const taskId of taskIds) {
    if (shouldSelect) {
      nextSelection.add(taskId);
    } else {
      nextSelection.delete(taskId);
    }
  }

  return nextSelection;
}

export function getBulkSelectionState(
  visibleTaskIds: string[],
  selectedTaskIds: Set<string>,
) {
  const visibleSelectedCount = visibleTaskIds.filter((taskId) =>
    selectedTaskIds.has(taskId),
  ).length;

  return {
    visibleSelectedCount,
    hasVisibleSelection: visibleSelectedCount > 0,
    allVisibleSelected:
      visibleTaskIds.length > 0 && visibleSelectedCount === visibleTaskIds.length,
  };
}
