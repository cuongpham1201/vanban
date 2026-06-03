// Small, dependency-free presentation helpers.

/** "2026-05-20" -> "20/05/2026". Returns '' for empty/invalid input. */
export function formatDate(iso: string | undefined): string {
  if (!iso) {
    return '';
  }
  const parts: string[] = iso.split('-');
  if (parts.length !== 3) {
    return iso;
  }
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/** 1248 -> "1.248" (Vietnamese thousands separator). */
export function formatNumber(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Whole days from today until the given ISO date.
 * Negative => already expired. Undefined date => undefined.
 */
export function daysUntil(iso: string | undefined): number | undefined {
  if (!iso) {
    return undefined;
  }
  const target: number = new Date(`${iso}T00:00:00`).getTime();
  if (isNaN(target)) {
    return undefined;
  }
  const now: Date = new Date();
  const today: number = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}

/** Human caption for remaining validity, e.g. "còn 10 ngày" / "đã hết hạn". */
export function remainingLabel(iso: string | undefined): string {
  const days: number | undefined = daysUntil(iso);
  if (days === undefined) {
    return '';
  }
  if (days < 0) {
    return 'đã hết hạn';
  }
  if (days === 0) {
    return 'hết hạn hôm nay';
  }
  return `còn ${days} ngày`;
}
