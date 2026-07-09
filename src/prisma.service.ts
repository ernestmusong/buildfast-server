
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private pool: Pool;

  constructor() {
    // 1. Establish a native PostgreSQL connection pool
    const pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
      max: 20, // 👈 Maximum number of concurrent connections allowed in this pool
      idleTimeoutMillis: 30000, // Optional: Close idle connections after 30 seconds
      connectionTimeoutMillis: 2000, // Optional: Time out if a connection takes over 2 seconds
    });

    // 2. Wrap the pool with Prisma's driver adapter
    const adapter = new PrismaPg(pool);

    // 3. Inject the adapter cleanly into the PrismaClient super-constructor
    super({ adapter });
    
    this.pool = pool;
  }

  async onModuleInit() {
    // Prisma manages internal connection handshakes automatically through the adapter,
    // but calling $connect ensures database readiness on startup.
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    // Safely drain and terminate the native PG connection pool on app shutdown
    await this.pool.end();
  }
}

