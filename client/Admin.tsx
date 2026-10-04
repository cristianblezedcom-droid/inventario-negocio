import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { User } from '../src/types.ts';
import { api } from './api.ts';
import { Dialog } from './Dialog.tsx';
import { date } from './utils.ts';
export function Users({ current }: { current: User }) {
  const [users, setUsers] = useState<User[]>([]);
  const [editing, setEditing] = useState<User | 'new' | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => setUsers(await api<User[]>('/users'));
  useEffect(() => {
    load().catch((error) => setError(error.message));
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(
        editing === 'new' ? '/users' : `/users/${(editing as User).id}`,
        editing === 'new' ? 'POST' : 'PATCH',
        editing === 'new'
          ? {
              name: data.get('name'),
              email: data.get('email'),
              password: data.get('password'),
              role: data.get('role'),
            }
          : {
              role: data.get('role'),
              active: data.get('active') === 'on',
              password: data.get('password'),
            },
      );
      setEditing(null);
      await load();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const user = editing && editing !== 'new' ? editing : null;
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Usuarios y permisos</h2>
            <p>
              Administradores gestionan el catálogo y usuarios. Operadores registran movimientos y
              pedidos.
            </p>
          </div>
          <button
            className="button primary"
            onClick={() => {
              setError('');
              setEditing('new');
            }}
          >
            + Nuevo usuario
          </button>
        </div>
        {error && !editing && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    {user.name}
                    {user.id === current.id ? ' (tú)' : ''}
                  </td>
                  <td>{user.email}</td>
                  <td>{user.role === 'admin' ? 'Administrador' : 'Operador'}</td>
                  <td>{user.active ? 'Activo' : 'Desactivado'}</td>
                  <td>
                    <button
                      className="action-button"
                      onClick={() => {
                        setError('');
                        setEditing(user);
                      }}
                    >
                      Editar usuario {user.name}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {editing && (
        <Dialog
          title={editing === 'new' ? 'Nuevo usuario' : 'Editar usuario'}
          locked={busy}
          onClose={() => setEditing(null)}
        >
          <p className="dialog-description">
            Cambiar el rol, estado o contraseña cierra las sesiones del usuario.
          </p>
          <form onSubmit={submit}>
            {editing === 'new' && (
              <>
                <label>
                  Nombre del usuario
                  <input autoFocus name="name" required maxLength={80} />
                </label>
                <label>
                  Correo del usuario
                  <input name="email" type="email" required maxLength={254} />
                </label>
              </>
            )}
            <label>
              Rol
              <select name="role" defaultValue={user?.role ?? 'operator'}>
                <option value="operator">Operador</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            {user && (
              <label className="checkbox-label">
                <input type="checkbox" name="active" defaultChecked={user.active} /> Usuario activo
              </label>
            )}
            <label>
              {user ? 'Nueva contraseña (opcional)' : 'Contraseña'}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required={!user}
                autoComplete="new-password"
              />
            </label>
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <button
                type="button"
                disabled={busy}
                className="button secondary"
                onClick={() => setEditing(null)}
              >
                Cancelar
              </button>
              <button disabled={busy} className="button primary">
                {busy ? 'Guardando…' : 'Guardar usuario'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </>
  );
}
interface Audit {
  id: number;
  actor_name: string | null;
  action: string;
  entity: string;
  entity_id: number;
  created_at: string;
  details: unknown;
}
export function AuditLog() {
  const [entries, setEntries] = useState<Audit[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api<Audit[]>('/audit')
      .then(setEntries)
      .catch((error) => setError(error.message));
  }, []);
  const actions: Record<string, string> = {
    create: 'Creación',
    update: 'Edición',
    movement: 'Movimiento',
    archive: 'Archivado',
    restore: 'Restauración',
    cancel: 'Cancelación',
    import: 'Importación',
  };
  const entities: Record<string, string> = {
    product: 'Producto',
    order: 'Pedido',
    user: 'Usuario',
    database: 'Base de datos',
  };
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Registro de actividad</h2>
          <p>Últimas 200 operaciones, con su responsable.</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Acción</th>
              <th>Registro</th>
              <th>Responsable</th>
              <th>Fecha</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{actions[entry.action] ?? entry.action}</td>
                <td>
                  {entities[entry.entity] ?? entry.entity} #{entry.entity_id}
                </td>
                <td>{entry.actor_name ?? 'Sistema'}</td>
                <td>{date(entry.created_at)}</td>
                <td>
                  <details>
                    <summary>Ver datos</summary>
                    <pre>{JSON.stringify(entry.details, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
