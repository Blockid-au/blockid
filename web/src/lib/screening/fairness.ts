// FTV fairness guard terms (G34 §4.2, RQ18): Founder Traction Velocity never
// scores age, education prestige or gender. Shared by the registry and
// rubric@v1 guard tests so both scan with one list.

export const FTV_FORBIDDEN_EN = /\b(age|aged|ages|young|younger|youth|old|older|elderly|school|schools|university|universities|college|degree|degrees|education|educated|alma|ivy|elite|prestige|prestigious|gender|male|female|man|men|woman|women|sex|mother|father|married)\b/i;

export const FTV_FORBIDDEN_VI = /(tuổi|trẻ tuổi|giới tính|nam giới|nữ giới|phụ nữ|đàn ông|học vấn|bằng cấp|trường học|trường đại học|đại học|danh tiếng)/i;

/** Every string inside a value (objects and arrays walked recursively). */
export function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}
