# Query Monitoring Guide

## Enable Query Logging

**Development:**

```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' }
  ]
})

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query)
  console.log('Duration: ' + e.duration + 'ms')
})
```

**Production (structured logging):**

```typescript
const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }]
})

prisma.$on('query', (e) => {
  if (e.duration > 1000) {
    logger.warn('Slow query detected', {
      query: e.query,
      duration: e.duration,
      params: e.params
    })
  }
})
```

## Analyzing Slow Queries

**Identify Patterns:**

1. Queries without WHERE clause on large tables (full table scans)
2. Complex JOINs without indexes on foreign keys
3. ORDER BY on unindexed fields
4. Missing LIMIT on large result sets

**Use Database EXPLAIN:**

```typescript
await prisma.$queryRaw`EXPLAIN ANALYZE
  SELECT * FROM "User"
  WHERE status = 'active'
  ORDER BY "createdAt" DESC
  LIMIT 20
`
```

Look for:

- "Seq Scan" (sequential scan) - needs index
- "Index Scan" - good
- High execution time relative to query complexity

## Common Query Anti-Patterns

**N+1 Problem:**

```typescript
const users = await prisma.user.findMany()

for (const user of users) {
  const orders = await prisma.order.findMany({
    where: { userId: user.id }
  })
}
```

**Solution - Use include:**

```typescript
const users = await prisma.user.findMany({
  include: {
    orders: true
  }
})
```

**Over-fetching:**

```typescript
const users = await prisma.user.findMany()
```

Fetches ALL fields for ALL users.

**Solution - Select needed fields:**

```typescript
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    name: true
  }
})
```

**Offset Pagination on Large Datasets:**

```typescript
await prisma.user.findMany({
  skip: 50000,
  take: 20
})
```

Database must scan and skip 50,000 rows.

**Solution - Cursor pagination:**

```typescript
await prisma.user.findMany({
  take: 20,
  cursor: { id: lastSeenId },
  skip: 1
})
```

Constant time regardless of page depth.
