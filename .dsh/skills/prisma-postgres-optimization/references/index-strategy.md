# Index Strategy Guide

## When to Add Indexes

Add `@@index` for fields that are:

- Frequently used in where clauses
- Used for sorting (orderBy)
- Foreign keys with frequent joins
- Composite conditions used together

## Single-Field Indexes

```prisma
model User {
  id        Int      @id @default(autoincrement())
  email     String   @unique
  createdAt DateTime @default(now())
  status    String

  @@index([createdAt])
  @@index([status])
}
```

**Use Case:**

```typescript
await prisma.user.findMany({
  where: { status: 'active' },
  orderBy: { createdAt: 'desc' },
  take: 20
})
```

Both status filter and createdAt sort benefit from indexes.

## Composite Indexes

```prisma
model Order {
  id         Int      @id @default(autoincrement())
  userId     Int
  status     String
  createdAt  DateTime @default(now())
  totalCents Int

  user User @relation(fields: [userId], references: [id])

  @@index([userId, status])
  @@index([status, createdAt])
}
```

**Composite Index Rules:**

1. Order matters: [userId, status] helps queries filtering by userId, or userId + status
2. Does NOT help queries filtering only by status
3. Most selective field should come first
4. Match your most common query patterns

**Use Case:**

```typescript
await prisma.order.findMany({
  where: {
    userId: 123,
    status: 'pending'
  },
  orderBy: { createdAt: 'desc' }
})
```

First index [userId, status] optimizes the where clause.
Second index [status, createdAt] would help if querying by status alone with date sorting.

## Index Trade-offs

**Benefits:**

- Faster read queries (10-100x improvement on large tables)
- Required for efficient sorting and filtering
- Essential for foreign key performance

**Costs:**

- Slower writes (insert/update/delete must update indexes)
- Storage overhead (5-20% per index)
- Diminishing returns beyond 5-7 indexes per table

**Rule:** Only index fields actually used in queries. Remove unused indexes.
