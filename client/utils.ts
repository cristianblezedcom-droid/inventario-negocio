import type { Product } from '../src/types.ts';
export const money = (cents: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const number = (value: number) => new Intl.NumberFormat('es-CO').format(value);
export const date = (value: string) => new Date(value).toLocaleString('es-CO');
export function status(product: Product): [string, string] {
  if (!product.active) return ['Archivado', 'status-empty'];
  if (product.stock === 0) return ['Agotado', 'status-empty'];
  if (product.stock <= product.min_stock) return ['Por reponer', 'status-low'];
  return ['Disponible', 'status-ok'];
}
export function filterProducts(
  products: Product[],
  filters: {
    search: string;
    category: string;
    stock: string;
    minimum: string;
    maximum: string;
    archived: boolean;
  },
) {
  const search = filters.search.trim().toLocaleLowerCase('es');
  return products.filter((product) => {
    return (
      product.active !== filters.archived &&
      `${product.name} ${product.sku}`.toLocaleLowerCase('es').includes(search) &&
      (!filters.category || product.category === filters.category) &&
      (!filters.stock ||
        (filters.stock === 'empty' ? product.stock === 0 : product.stock <= product.min_stock)) &&
      (filters.minimum === '' || product.price_cents >= Number(filters.minimum) * 100) &&
      (filters.maximum === '' || product.price_cents <= Number(filters.maximum) * 100)
    );
  });
}
export function exportCsv(filename: string, rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    let valueText = String(value);
    if (/^[\s]*[=+\-@]/.test(valueText)) valueText = `'${valueText}`;
    return `"${valueText.replaceAll('"', '""')}"`;
  };
  const url = URL.createObjectURL(
    new Blob(['\uFEFF', rows.map((row) => row.map(cell).join(';')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
