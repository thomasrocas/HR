const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown) => typeof value === "string" && UUID_REGEX.test(value);

const isBlank = (value: unknown) => value === null || value === undefined || value === "";

const createValidationError = (code: string) => {
  const error: Error & { status?: number; code?: string } = new Error(code);
  error.status = 400;
  error.code = code;
  return error;
};

const toNullableInteger = (value: unknown) => {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) throw createValidationError("invalid_number");
  return Math.trunc(numeric);
};

const sanitizeProgramTotalWeeks = (value: unknown) => {
  const parsed = toNullableInteger(value);
  if (parsed === null || Number.isNaN(parsed) || parsed < 1) {
    throw createValidationError("invalid_total_weeks");
  }
  return parsed;
};

const toNullableBoolean = (value: unknown) => {
  if (isBlank(value)) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "yes", "y", "1", "required"].includes(normalized)) return true;
    if (["false", "f", "no", "n", "0", "optional"].includes(normalized)) return false;
  }
  throw createValidationError("invalid_boolean");
};

const toNullableString = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const str = String(value);
  const trimmed = str.trim();
  return trimmed === "" ? null : trimmed;
};

const toNullableDateString = (value: unknown) => {
  const str = toNullableString(value);
  if (str === null) return null;
  const normalized = str.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw createValidationError("invalid_date");
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw createValidationError("invalid_date");
  }
  return normalized;
};

const normalizeDateOutput = (value: unknown): string | null => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    const parsed = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
  }
  return normalizeDateOutput(String(value));
};

const isAccountDisabled = (status: unknown) =>
  typeof status === "string" && ["suspended", "archived"].includes(status.trim().toLowerCase());

export {
  UUID_REGEX,
  isValidUuid,
  isBlank,
  createValidationError,
  toNullableInteger,
  sanitizeProgramTotalWeeks,
  toNullableBoolean,
  toNullableString,
  toNullableDateString,
  normalizeDateOutput,
  isAccountDisabled,
};

export default {
  UUID_REGEX,
  isValidUuid,
  isBlank,
  createValidationError,
  toNullableInteger,
  sanitizeProgramTotalWeeks,
  toNullableBoolean,
  toNullableString,
  toNullableDateString,
  normalizeDateOutput,
  isAccountDisabled,
};
