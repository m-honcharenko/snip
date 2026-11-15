import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthUser {
  id: number;
}

// The part of the HTTP request the guard touches. It is declared here so the
// auth code does not depend on the Express types.
export interface AuthenticatedRequest {
  headers: { authorization?: string };
  user?: AuthUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new UnauthorizedException('Missing or malformed bearer token');
    }

    let sub: unknown;
    try {
      ({ sub } = await this.jwt.verifyAsync<{ sub?: unknown }>(token));
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const id = typeof sub === 'string' ? Number(sub) : Number.NaN;
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    request.user = { id };
    return true;
  }
}
