import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';

type UserRow = {
  id: string;
  email: string;
  passwordHash: string;
  name: string | null;
  role: string;
  createdAt: Date;
  updatedAt: Date;
};

type SafeUser = Omit<UserRow, 'passwordHash' | 'updatedAt'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    this.validateRegisterDto(dto);

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.findUserByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date();

    const users = await this.prisma.$queryRaw<UserRow[]>`
      INSERT INTO "User" ("id", "email", "passwordHash", "name", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${email}, ${passwordHash}, ${dto.name?.trim() || null}, ${now}, ${now})
      RETURNING "id", "email", "passwordHash", "name", "role"::text AS "role", "createdAt", "updatedAt"
    `.catch((error: { code?: string }) => {
      if (error.code === '23505') {
        throw new ConflictException('Email is already registered');
      }

      throw error;
    });

    const user = this.toSafeUser(users[0]);

    return {
      user,
      accessToken: await this.signAccessToken(user),
    };
  }

  async login(dto: LoginDto) {
    this.validateLoginDto(dto);

    const user = await this.findUserByEmail(dto.email.trim().toLowerCase());

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const safeUser = this.toSafeUser(user);

    return {
      user: safeUser,
      accessToken: await this.signAccessToken(safeUser),
    };
  }

  async getProfile(userId: string) {
    const users = await this.prisma.$queryRaw<
      Omit<UserRow, 'passwordHash'>[]
    >`
      SELECT "id", "email", "name", "role"::text AS "role", "createdAt", "updatedAt"
      FROM "User"
      WHERE "id" = ${userId}
      LIMIT 1
    `;
    const user = users[0];

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    return user;
  }

  private async findUserByEmail(email: string): Promise<UserRow | undefined> {
    const users = await this.prisma.$queryRaw<UserRow[]>`
      SELECT "id", "email", "passwordHash", "name", "role"::text AS "role", "createdAt", "updatedAt"
      FROM "User"
      WHERE "email" = ${email}
      LIMIT 1
    `;

    return users[0];
  }

  private toSafeUser(user: UserRow): SafeUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  private async signAccessToken(user: { id: string; email: string; role: string }) {
    return this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
  }

  private validateRegisterDto(dto: RegisterDto) {
    this.validateLoginDto(dto);

    if (dto.name !== undefined && typeof dto.name !== 'string') {
      throw new BadRequestException('Name must be a string');
    }
  }

  private validateLoginDto(dto: LoginDto) {
    if (!dto.email || typeof dto.email !== 'string') {
      throw new BadRequestException('Email is required');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dto.email)) {
      throw new BadRequestException('Email must be valid');
    }

    if (!dto.password || typeof dto.password !== 'string') {
      throw new BadRequestException('Password is required');
    }

    if (dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters');
    }
  }
}
