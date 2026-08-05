// Fixed palette characters are auto-assigned from, in order, per manuscript.
// Cycles if a manuscript somehow has more named characters than colors.
export const CHARACTER_COLOR_PALETTE = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#469990", "#9a6324",
  "#800000", "#000075", "#fabed4", "#aaffc3", "#dcbeff", "#a9a9a9",
] as const;

export function nextCharacterColor(existingCount: number): string {
  return CHARACTER_COLOR_PALETTE[existingCount % CHARACTER_COLOR_PALETTE.length];
}
