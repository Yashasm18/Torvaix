/**
 * Load the repository's .env before anything reads process.env. Imported first by server.ts,
 * because several modules read their settings at import time. Variables already set in the
 * environment take precedence over the file.
 */
import fs from 'fs';
import path from 'path';

const envFile = path.resolve(__dirname, '../../../.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
