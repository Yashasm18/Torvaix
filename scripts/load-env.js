/** Load the repository's .env (if any). Variables already set in the environment win. */
const fs = require('fs');
const path = require('path');

const envFile = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  process.loadEnvFile(envFile);
}
