import { setupTestDatabase } from "../../scripts/db-test-setup";

export default async function globalSetup() {
  await setupTestDatabase();
}
