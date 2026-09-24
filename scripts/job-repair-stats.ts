import "dotenv/config"
import { repairAllStats } from "../src/server/services/stats.service"
import { prisma } from "../src/lib/prisma"

repairAllStats()
  .then((result) => console.log(`repair-stats: users=${result.repaired}`))
  .catch((error) => { console.error(error); process.exit(1) })
  .finally(() => prisma.$disconnect())
