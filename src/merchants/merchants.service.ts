import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddPhoneWhitelistDto,
  CreateMerchantApplicationDto,
  LoginMerchantDto,
  MerchantMoneyDto,
  RegisterMerchantDto,
  UpdateMerchantApplicationDto,
  UpdateMerchantPermissionsDto,
  UpdateMerchantProfileDto,
} from './dto/merchant.dto';

type MerchantEnvironment = 'SANDBOX' | 'PRODUCTION';

type MerchantUserRow = {
  userId: string;
  email: string;
  passwordHash: string;
  name: string | null;
  role: string;
  merchantId: string;
  websiteUrl: string;
  callbackUrl: string;
  apiKey: string;
  allowDeposit: boolean;
  allowWithdrawal: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MerchantProfileRow = Omit<MerchantUserRow, 'passwordHash'>;

type PhoneWhitelistRow = {
  id: string;
  merchantId: string;
  phoneNumber: string;
  direction: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MerchantApplicationRow = {
  id: string;
  merchantId: string;
  environment: string;
  name: string;
  websiteUrl: string;
  callbackUrl: string;
  apiKey: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type MerchantAccountRow = {
  id: string;
  merchantId: string;
  environment: string;
  balance: string;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

type MerchantTransactionRow = {
  id: string;
  merchantId: string;
  environment: string;
  type: string;
  status: string;
  amount: string;
  currency: string;
  reference: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterMerchantDto) {
    this.validateRegisterDto(dto);

    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.findMerchantUserByEmail(email);

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const now = new Date();
    const userId = randomUUID();
    const merchantId = randomUUID();
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const apiKey = this.generateApiKey('production');
    const sandboxApiKey = this.generateApiKey('sandbox');
    const productionApiKey = this.generateApiKey('production');

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "User" ("id", "email", "passwordHash", "name", "role", "createdAt", "updatedAt")
        VALUES (${userId}, ${email}, ${passwordHash}, ${dto.name?.trim() || null}, 'MERCHANT'::"UserRole", ${now}, ${now})
      `;

      const merchants = await tx.$queryRaw<MerchantProfileRow[]>`
        INSERT INTO "Merchant" (
          "id", "userId", "websiteUrl", "callbackUrl", "apiKey",
          "allowDeposit", "allowWithdrawal", "createdAt", "updatedAt"
        )
        VALUES (
          ${merchantId}, ${userId}, ${dto.websiteUrl.trim()}, ${dto.callbackUrl.trim()}, ${apiKey},
          true, false, ${now}, ${now}
        )
        RETURNING
          ${userId} AS "userId",
          ${email} AS "email",
          ${dto.name?.trim() || null} AS "name",
          'MERCHANT' AS "role",
          "id" AS "merchantId",
          "websiteUrl",
          "callbackUrl",
          "apiKey",
          "allowDeposit",
          "allowWithdrawal",
          "createdAt",
          "updatedAt"
      `;

      await tx.$executeRaw`
        INSERT INTO "MerchantAccount" ("id", "merchantId", "environment", "balance", "currency", "createdAt", "updatedAt")
        VALUES
          (${randomUUID()}, ${merchantId}, 'SANDBOX'::"MerchantEnvironment", 0, 'XAF', ${now}, ${now}),
          (${randomUUID()}, ${merchantId}, 'PRODUCTION'::"MerchantEnvironment", 0, 'XAF', ${now}, ${now})
      `;

      await tx.$executeRaw`
        INSERT INTO "MerchantApplication" (
          "id", "merchantId", "environment", "name", "websiteUrl", "callbackUrl", "apiKey", "isActive", "createdAt", "updatedAt"
        )
        VALUES
          (
            ${randomUUID()}, ${merchantId}, 'SANDBOX'::"MerchantEnvironment", 'Default application',
            ${dto.websiteUrl.trim()}, ${dto.callbackUrl.trim()}, ${sandboxApiKey}, true, ${now}, ${now}
          ),
          (
            ${randomUUID()}, ${merchantId}, 'PRODUCTION'::"MerchantEnvironment", 'Default application',
            ${dto.websiteUrl.trim()}, ${dto.callbackUrl.trim()}, ${productionApiKey}, true, ${now}, ${now}
          )
      `;

      return {
        ...merchants[0],
        applications: {
          sandbox: { apiKey: sandboxApiKey },
          production: { apiKey: productionApiKey },
        },
      };
    }).catch((error: { code?: string }) => {
      if (error.code === '23505') {
        throw new ConflictException('Email or API key already exists');
      }

      throw error;
    });

    return this.withAccessToken(result);
  }

  async login(dto: LoginMerchantDto) {
    this.validateLoginDto(dto);

    const merchant = await this.findMerchantUserByEmail(dto.email.trim().toLowerCase());

    if (!merchant) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordMatches = await bcrypt.compare(dto.password, merchant.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.withAccessToken(this.toMerchantProfile(merchant));
  }

  async getProfile(userId: string) {
    const merchant = await this.findMerchantProfileByUserId(userId);

    if (!merchant) {
      throw new NotFoundException('Merchant profile not found');
    }

    return merchant;
  }

  async updateProfile(userId: string, dto: UpdateMerchantProfileDto) {
    if (dto.websiteUrl === undefined && dto.callbackUrl === undefined) {
      throw new BadRequestException('At least one URL must be provided');
    }

    if (dto.websiteUrl !== undefined) {
      this.validateUrl(dto.websiteUrl, 'websiteUrl');
    }

    if (dto.callbackUrl !== undefined) {
      this.validateUrl(dto.callbackUrl, 'callbackUrl');
    }

    const merchant = await this.getProfile(userId);
    const updated = await this.prisma.$queryRaw<MerchantProfileRow[]>`
      UPDATE "Merchant"
      SET
        "websiteUrl" = COALESCE(${dto.websiteUrl?.trim() ?? null}, "websiteUrl"),
        "callbackUrl" = COALESCE(${dto.callbackUrl?.trim() ?? null}, "callbackUrl"),
        "updatedAt" = ${new Date()}
      WHERE "id" = ${merchant.merchantId}
      RETURNING
        ${merchant.userId} AS "userId",
        ${merchant.email} AS "email",
        ${merchant.name} AS "name",
        ${merchant.role} AS "role",
        "id" AS "merchantId",
        "websiteUrl",
        "callbackUrl",
        "apiKey",
        "allowDeposit",
        "allowWithdrawal",
        "createdAt",
        "updatedAt"
    `;

    return updated[0];
  }

  async updatePermissions(userId: string, dto: UpdateMerchantPermissionsDto) {
    if (dto.allowDeposit === undefined && dto.allowWithdrawal === undefined) {
      throw new BadRequestException('At least one permission must be provided');
    }

    if (dto.allowDeposit !== undefined && typeof dto.allowDeposit !== 'boolean') {
      throw new BadRequestException('allowDeposit must be a boolean');
    }

    if (
      dto.allowWithdrawal !== undefined &&
      typeof dto.allowWithdrawal !== 'boolean'
    ) {
      throw new BadRequestException('allowWithdrawal must be a boolean');
    }

    const merchant = await this.getProfile(userId);
    const updated = await this.prisma.$queryRaw<MerchantProfileRow[]>`
      UPDATE "Merchant"
      SET
        "allowDeposit" = COALESCE(${dto.allowDeposit ?? null}, "allowDeposit"),
        "allowWithdrawal" = COALESCE(${dto.allowWithdrawal ?? null}, "allowWithdrawal"),
        "updatedAt" = ${new Date()}
      WHERE "id" = ${merchant.merchantId}
      RETURNING
        ${merchant.userId} AS "userId",
        ${merchant.email} AS "email",
        ${merchant.name} AS "name",
        ${merchant.role} AS "role",
        "id" AS "merchantId",
        "websiteUrl",
        "callbackUrl",
        "apiKey",
        "allowDeposit",
        "allowWithdrawal",
        "createdAt",
        "updatedAt"
    `;

    return updated[0];
  }

  async addPhoneWhitelist(userId: string, dto: AddPhoneWhitelistDto) {
    this.validatePhoneWhitelistDto(dto);

    const merchant = await this.getProfile(userId);
    const rows = await this.prisma.$queryRaw<PhoneWhitelistRow[]>`
      INSERT INTO "MerchantPhoneWhitelist" (
        "id", "merchantId", "phoneNumber", "direction", "isActive", "createdAt", "updatedAt"
      )
      VALUES (
        ${randomUUID()}, ${merchant.merchantId}, ${dto.phoneNumber.trim()}, ${dto.direction}::"MerchantPhoneDirection",
        true, ${new Date()}, ${new Date()}
      )
      ON CONFLICT ("merchantId", "phoneNumber", "direction")
      DO UPDATE SET "isActive" = true, "updatedAt" = EXCLUDED."updatedAt"
      RETURNING "id", "merchantId", "phoneNumber", "direction"::text AS "direction", "isActive", "createdAt", "updatedAt"
    `;

    return rows[0];
  }

  async listPhoneWhitelist(userId: string, direction?: string) {
    const merchant = await this.getProfile(userId);

    if (direction !== undefined && !this.isPhoneDirection(direction)) {
      throw new BadRequestException('direction must be DEPOSIT or WITHDRAW');
    }

    return this.prisma.$queryRaw<PhoneWhitelistRow[]>`
      SELECT "id", "merchantId", "phoneNumber", "direction"::text AS "direction", "isActive", "createdAt", "updatedAt"
      FROM "MerchantPhoneWhitelist"
      WHERE "merchantId" = ${merchant.merchantId}
        AND "isActive" = true
        AND (${direction ?? null}::text IS NULL OR "direction"::text = ${direction ?? null})
      ORDER BY "createdAt" DESC
    `;
  }

  async removePhoneWhitelist(userId: string, id: string) {
    const merchant = await this.getProfile(userId);
    const rows = await this.prisma.$queryRaw<PhoneWhitelistRow[]>`
      UPDATE "MerchantPhoneWhitelist"
      SET "isActive" = false, "updatedAt" = ${new Date()}
      WHERE "id" = ${id}
        AND "merchantId" = ${merchant.merchantId}
      RETURNING "id", "merchantId", "phoneNumber", "direction"::text AS "direction", "isActive", "createdAt", "updatedAt"
    `;

    if (!rows[0]) {
      throw new NotFoundException('Whitelisted phone number not found');
    }

    return rows[0];
  }

  private async findMerchantUserByEmail(
    email: string,
  ): Promise<MerchantUserRow | undefined> {
    const users = await this.prisma.$queryRaw<MerchantUserRow[]>`
      SELECT
        u."id" AS "userId",
        u."email",
        u."passwordHash",
        u."name",
        u."role"::text AS "role",
        m."id" AS "merchantId",
        m."websiteUrl",
        m."callbackUrl",
        m."apiKey",
        m."allowDeposit",
        m."allowWithdrawal",
        m."createdAt",
        m."updatedAt"
      FROM "User" u
      INNER JOIN "Merchant" m ON m."userId" = u."id"
      WHERE u."email" = ${email}
        AND u."role" = 'MERCHANT'::"UserRole"
      LIMIT 1
    `;

    return users[0];
  }

  private async findMerchantProfileByUserId(
    userId: string,
  ): Promise<MerchantProfileRow | undefined> {
    const merchants = await this.prisma.$queryRaw<MerchantProfileRow[]>`
      SELECT
        u."id" AS "userId",
        u."email",
        u."name",
        u."role"::text AS "role",
        m."id" AS "merchantId",
        m."websiteUrl",
        m."callbackUrl",
        m."apiKey",
        m."allowDeposit",
        m."allowWithdrawal",
        m."createdAt",
        m."updatedAt"
      FROM "User" u
      INNER JOIN "Merchant" m ON m."userId" = u."id"
      WHERE u."id" = ${userId}
        AND u."role" = 'MERCHANT'::"UserRole"
      LIMIT 1
    `;

    return merchants[0];
  }

  private toMerchantProfile(merchant: MerchantUserRow): MerchantProfileRow {
    return {
      userId: merchant.userId,
      email: merchant.email,
      name: merchant.name,
      role: merchant.role,
      merchantId: merchant.merchantId,
      websiteUrl: merchant.websiteUrl,
      callbackUrl: merchant.callbackUrl,
      apiKey: merchant.apiKey,
      allowDeposit: merchant.allowDeposit,
      allowWithdrawal: merchant.allowWithdrawal,
      createdAt: merchant.createdAt,
      updatedAt: merchant.updatedAt,
    };
  }

  private async withAccessToken(merchant: MerchantProfileRow) {
    return {
      merchant,
      apiKey: merchant.apiKey,
      accessToken: await this.jwtService.signAsync({
        sub: merchant.userId,
        email: merchant.email,
        role: merchant.role,
        merchantId: merchant.merchantId,
      }),
    };
  }

  private generateApiKey() {
    return `bf_live_${randomBytes(32).toString('hex')}`;
  }

  private validateRegisterDto(dto: RegisterMerchantDto) {
    this.validateLoginDto(dto);
    this.validateUrl(dto.websiteUrl, 'websiteUrl');
    this.validateUrl(dto.callbackUrl, 'callbackUrl');

    if (dto.name !== undefined && typeof dto.name !== 'string') {
      throw new BadRequestException('Name must be a string');
    }
  }

  private validateLoginDto(dto: LoginMerchantDto) {
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

  private validateUrl(value: string | undefined, fieldName: string) {
    if (!value || typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} is required`);
    }

    try {
      const url = new URL(value);

      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Unsupported protocol');
      }
    } catch {
      throw new BadRequestException(`${fieldName} must be a valid http or https URL`);
    }
  }

  private validatePhoneWhitelistDto(dto: AddPhoneWhitelistDto) {
    if (!dto.phoneNumber || typeof dto.phoneNumber !== 'string') {
      throw new BadRequestException('phoneNumber is required');
    }

    if (!/^\+?[0-9]{7,20}$/.test(dto.phoneNumber.trim())) {
      throw new BadRequestException('phoneNumber must be 7 to 20 digits');
    }

    if (!this.isPhoneDirection(dto.direction)) {
      throw new BadRequestException('direction must be DEPOSIT or WITHDRAW');
    }
  }

  private isPhoneDirection(value: string): value is 'DEPOSIT' | 'WITHDRAW' {
    return value === 'DEPOSIT' || value === 'WITHDRAW';
  }
}
