import { buildingsNear } from "@/lib/geo/osm";
import { prisma } from "@/lib/prisma";

const postcodes = process.argv.slice(2);
if (!postcodes.length) throw new Error("Usage: bun --conditions react-server scripts/prewarm-buildings.ts <postcode>...");

for (const [i, pc] of postcodes.entries()) {
  if (i > 0) await Bun.sleep(2000);
  const result = await buildingsNear(pc);
  console.log(`${pc}: ${result ? `${result.buildings.length} buildings` : "unknown postcode"}`);
}
await prisma.$disconnect();
