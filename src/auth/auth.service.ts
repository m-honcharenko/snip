import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isUniqueViolation } from '../common/is-unique-violation.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Credentials } from './auth.schemas.js';
import { hashPassword, verifyPassword } from './password.js';

@Injectable()
export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register({ email, password }: Credentials) {
    // The lookup gives the common case a clean 409 before the slow hash. The
    // unique index stays the source of truth for two simultaneous sign-ups.
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await hashPassword(password);
    try {
      const user = await this.prisma.user.create({
        data: { email, passwordHash },
      });
      return await this.issueToken(user.id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email is already registered');
      }
      throw error;
    }
  }

  async login({ email, password }: Credentials) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // An unknown email costs the same time as a wrong password, so the
    // response time does not reveal which emails are registered.
    const passwordHash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await verifyPassword(password, passwordHash);
    if (!user || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.issueToken(user.id);
  }

  private async issueToken(userId: number) {
    return { accessToken: await this.jwt.signAsync({ sub: String(userId) }) };
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hashPassword('password-for-unknown-emails');
    return this.dummyHash;
  }
}
