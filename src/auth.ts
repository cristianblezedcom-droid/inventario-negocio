import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import type { Database } from './database.ts';
import type { User, Role } from './types.ts';
import { AppError, object, text, email, integer } from './errors.ts';

const derive = promisify(scrypt);
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString('hex')}`;
}
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, digest] = hash.split(':');
  const expected = Buffer.from(digest, 'hex');
  const actual = (await derive(password, salt, 64)) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
function passwordValue(value: unknown): string {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128)
    throw new AppError('La contraseña debe tener entre 12 y 128 caracteres.');
  return value;
}
export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export interface Session {
  user: User;
  csrf: string;
  token: string;
}

export function createAuth(db: Database) {
  let dummyHash: string;
  return {
    async createUser(value: unknown, actor?: User): Promise<User> {
      const input = object(value);
      const name = text(input.name, 'Nombre');
      const mail = email(input.email);
      const password = passwordValue(input.password);
      const role = input.role as Role;
      if (!['admin', 'operator'].includes(role)) throw new AppError('El rol no es válido.');
      const hash = await hashPassword(password);
      return db.transaction(async (tx) => {
        const result = await tx.query<User>(
          'INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role,active',
          [name, mail, hash, role],
        );
        const user = result.rows[0];
        if (actor)
          await tx.query(
            'INSERT INTO audit_log (actor_id,action,entity,entity_id) VALUES ($1,$2,$3,$4)',
            [actor.id, 'create', 'user', user.id],
          );
        return user;
      });
    },
    async login(value: unknown): Promise<Session> {
      const input = object(value);
      const mail = email(input.email);
      const password =
        typeof input.password === 'string' && input.password.length <= 128 ? input.password : '';
      const found = (
        await db.query<User & { password_hash: string }>(
          'SELECT * FROM users WHERE email=$1 AND active=TRUE',
          [mail],
        )
      ).rows[0];
      dummyHash ??= await hashPassword('Contraseña ficticia para verificación');
      const matches = await verifyPassword(password, found?.password_hash ?? dummyHash);
      if (!found || !matches) throw new AppError('Correo o contraseña incorrectos.', 401);
      const token = randomBytes(32).toString('hex');
      const csrf = randomBytes(24).toString('hex');
      await db.query('DELETE FROM sessions WHERE expires_at < NOW()');
      await db.query(
        "INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,NOW()+INTERVAL '8 hours')",
        [tokenHash(token), found.id, csrf],
      );
      const { id, name, email: address, role, active } = found;
      return { user: { id, name, email: address, role, active }, csrf, token };
    },
    async session(token?: string): Promise<Omit<Session, 'token'>> {
      if (!token || !/^[a-f0-9]{64}$/.test(token))
        throw new AppError('Inicia sesión para continuar.', 401);
      const result = (
        await db.query<User & { csrf_token: string }>(
          `SELECT u.id,u.name,u.email,u.role,u.active,s.csrf_token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>NOW() AND u.active=TRUE`,
          [tokenHash(token)],
        )
      ).rows[0];
      if (!result) throw new AppError('La sesión ha caducado. Inicia sesión.', 401);
      const { csrf_token, ...user } = result;
      return { user, csrf: csrf_token };
    },
    async logout(token: string) {
      await db.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(token)]);
    },
    async listUsers(): Promise<User[]> {
      return (await db.query<User>('SELECT id,name,email,role,active FROM users ORDER BY id')).rows;
    },
    async updateUser(id: number, value: unknown, actor: User): Promise<User> {
      integer(id, 'Identificador', 1);
      const input = object(value);
      if (
        typeof input.active !== 'boolean' ||
        !['admin', 'operator'].includes(input.role as string)
      )
        throw new AppError('El estado o rol no es válido.');
      const newHash =
        input.password === undefined || input.password === ''
          ? null
          : await hashPassword(passwordValue(input.password));
      return db.transaction(async (tx) => {
        // Bloquea los usuarios para que dos cambios no puedan eliminar al último administrador.
        const admins = (
          await tx.query<User>(
            "SELECT id FROM users WHERE role='admin' AND active=TRUE ORDER BY id FOR UPDATE",
          )
        ).rows;
        const found = (
          await tx.query<User>(
            'SELECT id,name,email,role,active FROM users WHERE id=$1 FOR UPDATE',
            [id],
          )
        ).rows[0];
        if (!found) throw new AppError('El usuario no existe.', 404);
        if (
          found.role === 'admin' &&
          found.active &&
          (!input.active || input.role !== 'admin') &&
          admins.length <= 1
        )
          throw new AppError('Debe quedar al menos un administrador activo.', 409);
        const changed = (
          await tx.query<User>(
            'UPDATE users SET role=$2,active=$3,password_hash=COALESCE($4,password_hash) WHERE id=$1 RETURNING id,name,email,role,active',
            [id, input.role, input.active, newHash],
          )
        ).rows[0];
        await tx.query('DELETE FROM sessions WHERE user_id=$1', [id]);
        await tx.query(
          'INSERT INTO audit_log (actor_id,action,entity,entity_id,details) VALUES ($1,$2,$3,$4,$5)',
          [
            actor.id,
            'update',
            'user',
            id,
            JSON.stringify({
              role: input.role,
              active: input.active,
              password_changed: Boolean(newHash),
            }),
          ],
        );
        return changed;
      });
    },
  };
}
export function requireAdmin(user: User) {
  if (user.role !== 'admin')
    throw new AppError('Esta acción requiere permisos de administrador.', 403);
}
