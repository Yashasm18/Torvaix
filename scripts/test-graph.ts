/**
 * Manual verification script for Phase 2.7 Knowledge Graph.
 * Run from TORVAIX root: npx tsx scripts/test-graph.ts
 */
import { ingestKnowledgeGraph, MLIntelligencePayload } from '../packages/graph/src/graph-ingestion';
import { getNeighbors, findPath, queryGraph, getAllNodesAndEdges } from '../packages/graph/src/graph-query';
import { db } from '../packages/graph/src/graph-store';

// Clean slate for testing
db.exec('DELETE FROM edges');
db.exec('DELETE FROM nodes');

console.log('\n=== TEST 1: Store memories and check graph ===\n');

// Simulate: "TORVAIX uses Qdrant"
const payload1: MLIntelligencePayload = {
  category: 'Technical',
  importance: 8.5,
  entities: [
    { text: 'TORVAIX', type: 'PROJECT' },
    { text: 'Qdrant', type: 'TECHNOLOGY' }
  ],
  tags: ['project', 'database', 'vector'],
  relationships: [
    { source: 'TORVAIX', relation: 'USES', target: 'Qdrant', confidence: 0.95 }
  ]
};
ingestKnowledgeGraph(payload1);
console.log('✓ Ingested: "TORVAIX uses Qdrant"');

// Simulate: "TORVAIX uses Ollama"
const payload2: MLIntelligencePayload = {
  category: 'Technical',
  importance: 8.5,
  entities: [
    { text: 'TORVAIX', type: 'PROJECT' },
    { text: 'Ollama', type: 'TECHNOLOGY' }
  ],
  tags: ['project', 'llm', 'local'],
  relationships: [
    { source: 'TORVAIX', relation: 'USES', target: 'Ollama', confidence: 0.93 }
  ]
};
ingestKnowledgeGraph(payload2);
console.log('✓ Ingested: "TORVAIX uses Ollama"');

// Verify: TORVAIX neighbors
const torvaixNeighbors = getNeighbors('TORVAIX');
console.log('\nTORVAIX neighbors:');
for (const n of torvaixNeighbors) {
  console.log(`  ${n.direction === 'OUT' ? '├─' : '└─'} ${n.relation} → ${n.node.name} (${n.node.type})`);
}

const hasQdrant = torvaixNeighbors.some(n => n.node.name === 'Qdrant' && n.relation === 'USES');
const hasOllama = torvaixNeighbors.some(n => n.node.name === 'Ollama' && n.relation === 'USES');
console.log(`\n  TORVAIX → USES → Qdrant: ${hasQdrant ? '✅ PASS' : '❌ FAIL'}`);
console.log(`  TORVAIX → USES → Ollama: ${hasOllama ? '✅ PASS' : '❌ FAIL'}`);


console.log('\n=== TEST 2: query_graph finds entities ===\n');

const techResults = queryGraph('TORVAIX');
console.log(`query_graph("TORVAIX") returned ${techResults.length} result(s):`);
for (const r of techResults) {
  console.log(`  [${r.type}] ${r.name} (importance: ${r.importance})`);
}
console.log(`  Graph query works: ${techResults.length > 0 ? '✅ PASS' : '❌ FAIL'}`);


console.log('\n=== TEST 3: find_path between Yashas and Qdrant ===\n');

// Simulate: "Yashas is building TORVAIX"
const payload3: MLIntelligencePayload = {
  category: 'Personal',
  importance: 9.0,
  entities: [
    { text: 'Yashas', type: 'PERSON' },
    { text: 'TORVAIX', type: 'PROJECT' }
  ],
  tags: ['founder', 'building'],
  relationships: [
    { source: 'Yashas', relation: 'BUILDING', target: 'TORVAIX', confidence: 0.98 }
  ]
};
ingestKnowledgeGraph(payload3);
console.log('✓ Ingested: "Yashas is building TORVAIX"');

const pathResult = findPath('Yashas', 'Qdrant');
if (pathResult && pathResult.length > 0) {
  console.log(`\nfind_path(Yashas, Qdrant):`);
  console.log(pathResult.map(n => `  ${n.name} (${n.type})`).join('\n  ↓\n'));
  console.log(`\n  Path found: ✅ PASS`);
} else {
  console.log('  Path found: ❌ FAIL — returned null or empty');
}


console.log('\n=== FULL GRAPH STATE ===\n');
const all = getAllNodesAndEdges();
console.log(`Nodes (${all.nodes.length}):`);
for (const n of all.nodes) {
  console.log(`  [${n.type}] ${n.name} — importance: ${n.importance}`);
}
console.log(`\nEdges (${all.edges.length}):`);
for (const e of all.edges) {
  console.log(`  ${e.source_id} —[${e.relation} (${e.confidence})]→ ${e.target_id}`);
}

console.log('\n=== ALL TESTS COMPLETE ===\n');

// Close db
db.close();
