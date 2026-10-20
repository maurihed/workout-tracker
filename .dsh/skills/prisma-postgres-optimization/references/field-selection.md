# Field Selection Guide

## Select vs Include

**select:** Choose specific fields (excludes all others)

```typescript
const user = await prisma.user.findUnique({
  where: { id: 1 },
  select: {
    id: true,
    email: true
  }
})
```

**include:** Add relations to default fields

```typescript
const user = await prisma.user.findUnique({
  where: { id: 1 },
  include: {
    orders: true
  }
})
```

**Cannot use both select and include in same query.**

## Nested Selection

```typescript
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    orders: {
      select: {
        id: true,
        total: true,
        createdAt: true
      },
      where: { status: 'completed' },
      orderBy: { createdAt: 'desc' },
      take: 5
    }
  }
})
```

Only fetches recent completed orders, not all orders.

## Counting Relations Without Loading

```typescript
const users = await prisma.user.findMany({
  select: {
    id: true,
    email: true,
    _count: {
      select: {
        orders: true,
        posts: true
      }
    }
  }
})
```

Returns counts without loading actual relation records.
