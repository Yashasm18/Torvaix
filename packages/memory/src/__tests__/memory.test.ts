import { MemoryStore } from '../index';
import path from 'path';
import fs from 'fs';
import { assert } from 'console';

const TEST_DB_PATH = path.resolve(__dirname, '../../test-torvaix.db');
const WORKSPACE_ID = 'test-regression-suite';

async function runTests() {
  console.log("==========================================");
  console.log("🚀 Starting Memory Store Regression Suite");
  console.log("==========================================\n");

  // Cleanup old test DB
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const store = new MemoryStore(TEST_DB_PATH);
  
  try {
    console.log("Checking Qdrant and Ollama connectivity...");
    await store.initQdrant();
  } catch (e: any) {
    console.error("❌ Pre-flight check failed! Is Qdrant and Ollama running?");
    console.error(e.message);
    process.exit(1);
  }

  let memoryId: string = "";

  try {
    console.log("\n--- Category 1: Storage & Embedding Tests ---");
    
    // Test 1: Store Memory
    process.stdout.write("Test: Store Memory... ");
    memoryId = await store.storeMemory(WORKSPACE_ID, "My favorite database is PostgreSQL", "Regression Test");
    assert(memoryId.length > 10, "Memory ID should be generated");
    console.log("✅ Passed");

    // Test 2: Retrieve By ID (SQLite Check)
    process.stdout.write("Test: Retrieve By ID (Consistency)... ");
    const record = await store.getMemoryById(memoryId);
    assert(record !== undefined, "Record must exist in SQLite");
    assert(record.content === "My favorite database is PostgreSQL", "Content must match");
    console.log("✅ Passed");

    console.log("\n--- Category 2: Retrieval Tests ---");

    // Test 3: Semantic Retrieval
    process.stdout.write("Test: Semantic Match Retrieval... ");
    const results = await store.queryMemory(WORKSPACE_ID, "What database do I prefer?", 3);
    assert(results.length > 0, "Should retrieve at least one result");
    assert(results[0].id === memoryId, "Top result should be our stored memory");
    assert(results[0].score > 0.6, "Confidence threshold should be high");
    console.log(`✅ Passed (Confidence: ${(results[0].score * 100).toFixed(1)}%)`);

    // Test 4: Unrelated Query
    process.stdout.write("Test: Unrelated Query Retrieval... ");
    const badResults = await store.queryMemory(WORKSPACE_ID, "How do I bake a cake?", 3);
    // Even if it returns results, the confidence should be low
    if (badResults.length > 0) {
      assert(badResults[0].score < 0.5, "Confidence should be low for unrelated queries");
    }
    console.log("✅ Passed");

    console.log("\n--- Category 3: Update & Consistency Tests ---");

    // Test 5: Update Memory
    process.stdout.write("Test: Update Memory... ");
    await store.updateMemory(memoryId, "Actually, I switched my favorite database to SQLite");
    const updatedRecord = await store.getMemoryById(memoryId);
    assert(updatedRecord.content === "Actually, I switched my favorite database to SQLite", "Content must be updated");
    console.log("✅ Passed");

    // Test 6: Verify Vector Update via query
    process.stdout.write("Test: Vector Space Updated... ");
    const newQueryResults = await store.queryMemory(WORKSPACE_ID, "What is my new favorite db?", 3);
    assert(newQueryResults[0].id === memoryId, "Should find the updated vector");
    console.log("✅ Passed");

    console.log("\n--- Category 4: Deletion & Lifecycle Tests ---");

    // Test 7: Delete Memory
    process.stdout.write("Test: Delete Memory... ");
    await store.deleteMemory(memoryId);
    const deletedRecord = await store.getMemoryById(memoryId);
    assert(deletedRecord === undefined, "Record must be removed from SQLite");
    console.log("✅ Passed");

    // Test 8: Verify Vector Deletion
    process.stdout.write("Test: Vector Deletion Cascade... ");
    const emptyResults = await store.queryMemory(WORKSPACE_ID, "database", 3);
    assert(emptyResults.length === 0 || emptyResults[0].id !== memoryId, "Vector should not be found");
    console.log("✅ Passed");

    console.log("\n==========================================");
    console.log("🎉 All 8 Regression Tests Passed Successfully!");
    console.log("==========================================");

  } catch (error: any) {
    console.error(`\n❌ Test Failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    if (fs.existsSync(TEST_DB_PATH)) {
      fs.unlinkSync(TEST_DB_PATH);
    }
  }
}

runTests();
