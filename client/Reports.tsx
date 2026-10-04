import type { Report } from '../src/types.ts';
import { money, number, exportCsv } from './utils.ts';
export function Reports({ report }: { report: Report }) {
  const maxCategory = Math.max(1, ...report.categories.map((category) => category.units));
  const maxSale = Math.max(1, ...report.daily_sales.map((sale) => sale.total_cents));
  return (
    <>
      <div className="report-overview">
        <article className="stat">
          <span>Pedidos confirmados</span>
          <strong>{number(report.orders)}</strong>
          <small>Los cancelados quedan excluidos</small>
        </article>
        <article className="stat">
          <span>Ventas registradas</span>
          <strong>{money(report.revenue_cents)}</strong>
          <small>Total de pedidos confirmados</small>
        </article>
      </div>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Unidades por categoría</h2>
              <p>Productos activos del catálogo.</p>
            </div>
          </div>
          <div className="charts">
            {report.categories.map((category) => (
              <div className="chart-row" key={category.category}>
                <div>
                  <span>{category.category}</span>
                  <strong>{number(category.units)}</strong>
                </div>
                <progress
                  value={category.units}
                  max={maxCategory}
                  aria-label={`Unidades de ${category.category}`}
                />
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Ventas de los últimos 30 días</h2>
              <p>Fechas agrupadas en UTC.</p>
            </div>
          </div>
          <div className="charts">
            {report.daily_sales.length ? (
              report.daily_sales.map((sale) => (
                <div className="chart-row" key={sale.day}>
                  <div>
                    <span>{sale.day}</span>
                    <strong>{money(sale.total_cents)}</strong>
                  </div>
                  <progress
                    value={sale.total_cents}
                    max={maxSale}
                    aria-label={`Ventas del ${sale.day}`}
                  />
                </div>
              ))
            ) : (
              <p className="empty">Registra un pedido para ver las ventas.</p>
            )}
          </div>
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Productos más vendidos</h2>
            <p>Hasta cinco productos de pedidos confirmados.</p>
          </div>
          <button
            className="button secondary"
            onClick={() =>
              exportCsv('reporte-ventas.csv', [
                ['Producto', 'Unidades vendidas', 'Total COP'],
                ...report.top_products.map((product) => [
                  product.name,
                  product.quantity,
                  product.total_cents / 100,
                ]),
              ])
            }
          >
            Exportar reporte
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th className="numeric">Unidades vendidas</th>
                <th className="numeric">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.top_products.map((product, index) => (
                <tr key={index}>
                  <td>{product.name}</td>
                  <td className="numeric">{number(product.quantity)}</td>
                  <td className="numeric">{money(product.total_cents)}</td>
                </tr>
              ))}
              {!report.top_products.length && (
                <tr>
                  <td colSpan={3} className="empty">
                    Todavía no hay ventas registradas.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
