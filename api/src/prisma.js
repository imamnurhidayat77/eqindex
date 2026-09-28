// Prisma client singleton. Raw SQL in src/index.js keeps working;
// adopt these models gradually for new code. Views/triggers stay in SQL.
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma = globalForPrisma.__eqindexPrisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.__eqindexPrisma = prisma;

module.exports = prisma;
