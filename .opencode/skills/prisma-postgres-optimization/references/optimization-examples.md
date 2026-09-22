# Optimization Examples

## Example 1: Add Composite Index for Common Query

**Scenario:** API endpoint filtering orders by userId and status, sorted by date

**Current Schema:**

```prisma
model Order {
  id        Int      @id @default(autoincrement())
  userId    Int
  status    String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

**Query:**

```typescript
await prisma.order.findMany({
  where: {
    userId: req.user.id,
    status: 'pending'
  },
  orderBy: { createdAt: 'desc' }
})
```

**Optimization - Add Composite Index:**

```prisma
model Order {
  id        Int      @id @default(autoincrement())
  userId    Int
  status    String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])

  @@index([userId, status, createdAt])
}
```

Index covers filter AND sort, enabling index-only scan.

## Example 2: Optimize Bulk Insert

**Scenario:** Import 10,000 products from CSV

**SLOW Approach:**

```typescript
for (const row of csvData) {
  await prisma.product.create({
    data: {
      name: row.name,
      sku: row.sku,
      price: parseFloat(row.price)
    }
  })
}
```

10,000 database round-trips = 60+ seconds

**FAST Approach:**

```typescript
const products = csvData.map(row => ({
  name: row.name,
  sku: row.sku,
  price: parseFloat(row.price)
}))

await prisma.product.createMany({
  data: products,
  skipDuplicates: true
})
```

1 database round-trip = <1 second

**Even Better - Chunked Batches:**

```typescript
const BATCH_SIZE = 1000

for (let i = 0; i < products.length; i += BATCH_SIZE) {
  const batch = products.slice(i, i + BATCH_SIZE)

  await prisma.product.createMany({
    data: batch,
    skipDuplicates: true
  })
}
```

Progress tracking + failure isolation.

## Example 3: Identify and Fix Slow Query

**Enable Logging:**

```typescript
const prisma = new PrismaClient({
  log: [{ emit: 'event', level: 'query' }]
})

prisma.$on('query', (e) => {
  if (e.duration > 500) {
    console.log(`SLOW QUERY (${e.duration}ms): ${e.query}`)
  }
})
```

**Detected Slow Query:**

```
SLOW QUERY (3421ms): SELECT * FROM "Post" WHERE "published" = true ORDER BY "views" DESC LIMIT 10
```

**Analyze with EXPLAIN:**

```typescript
await prisma.$queryRaw`
  EXPLAIN ANALYZE
  SELECT * FROM "Post"
  WHERE "published" = true
  ORDER BY "views" DESC
  LIMIT 10
`
```

**Output shows:** Seq Scan (full table scan)

**Solution - Add Index:**

```prisma
model Post {
  id        Int     @id @default(autoincrement())
  published Boolean @default(false)
  views     Int     @default(0)

  @@index([published, views])
}
```

**Verify Improvement:**

After migration, same query executes in ~15ms (228x faster).
