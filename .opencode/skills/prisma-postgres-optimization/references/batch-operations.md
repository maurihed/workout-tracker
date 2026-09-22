# Batch Operations Guide

## createMany vs Loop

**SLOW (N database round-trips):**

```typescript
for (const userData of users) {
  await prisma.user.create({ data: userData })
}
```

**FAST (1 database round-trip):**

```typescript
await prisma.user.createMany({
  data: users,
  skipDuplicates: true
})
```

**Performance Gain:** 50-100x faster for 1000+ records.

**Limitations:**

- createMany does NOT return created records
- Does NOT trigger middleware or relation cascades
- skipDuplicates skips on unique constraint violations (no error)

## Batch Updates

**SLOW:**

```typescript
for (const id of orderIds) {
  await prisma.order.update({
    where: { id },
    data: { status: 'shipped' }
  })
}
```

**FAST:**

```typescript
await prisma.order.updateMany({
  where: { id: { in: orderIds } },
  data: { status: 'shipped' }
})
```

**Note:** updateMany returns count, not records.

## Batch with Transactions

When you need returned records or relation handling:

```typescript
await prisma.$transaction(
  users.map(userData =>
    prisma.user.create({ data: userData })
  )
)
```

**Use Case:** Creating related records where you need IDs for subsequent operations.

**Trade-off:** Slower than createMany but supports relations and returns records.

## Batch Size Considerations

For very large datasets (100k+ records), chunk into batches:

```typescript
const BATCH_SIZE = 1000

for (let i = 0; i < records.length; i += BATCH_SIZE) {
  const batch = records.slice(i, i + BATCH_SIZE)

  await prisma.record.createMany({
    data: batch,
    skipDuplicates: true
  })

  console.log(`Processed ${Math.min(i + BATCH_SIZE, records.length)}/${records.length}`)
}
```

**Benefits:**

- Progress visibility
- Memory efficiency
- Failure isolation (one batch fails, others succeed)
