/** Format counted UI nouns, including phrases such as "secondary pair". */
export function countText(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}
