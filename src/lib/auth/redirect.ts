import { z } from 'zod';

export const AccountRoleSchema = z.enum(['ADMIN', 'PRODUCTION', 'REGISTRATION', 'EXHIBITOR']);
export type AccountRole = z.infer<typeof AccountRoleSchema>;

const ROLE_HOME: Record<AccountRole, string> = {
  ADMIN: '/admin',
  PRODUCTION: '/production',
  REGISTRATION: '/registration',
  EXHIBITOR: '/exhibitor',
};

export function getLoginDestination(role: AccountRole, requested: string | null): string {

  // Only permit mapped local portals; never follow an arbitrary login return URL.
  if (!requested?.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return ROLE_HOME[role];
  }

  const destination = new URL(requested, 'https://local.invalid');
  const pathname = destination.pathname;
  const allowed = Object.entries(ROLE_HOME).some(([requiredRole, home]) =>
    (role === requiredRole || role === 'ADMIN') && (pathname === home || pathname.startsWith(`${home}/`))
  );

  return allowed ? `${pathname}${destination.search}${destination.hash}` : ROLE_HOME[role];
}
