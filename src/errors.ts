export class AppError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new AppError('Envía un objeto con los datos.');
  return value as Record<string, unknown>;
}
export function text(value: unknown, label: string, max = 80): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new AppError(`${label}: escribe entre 1 y ${max} caracteres.`);
  return value.trim();
}
export function integer(value: unknown, label: string, min = 0, max = 1_000_000): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new AppError(`${label}: debe ser un entero entre ${min} y ${max}.`);
  return value;
}
export function email(value: unknown): string {
  const result = text(value, 'Correo', 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new AppError('Escribe un correo válido.');
  return result;
}
