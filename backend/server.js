const cluster = require('cluster');
const os = require('os');
require('dotenv').config();

// Optimize for low memory usage (limit to 2 workers by default for local dev)
const NUM_WORKERS = parseInt(process.env.NUM_WORKERS) || 2;

if (cluster.isPrimary || cluster.isMaster) {
  console.log(`🚀 Movieverse Master ${process.pid} started`);
  console.log(`📊 Spawning ${NUM_WORKERS} workers (Memory Optimized)...`);

  for (let i = 0; i < NUM_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`🔄 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
} else {
  const app = require('./app');
  const PORT = process.env.PORT || 25566;

  app.listen(PORT, () => {
    console.log(`✅ Worker ${process.pid} listening on port ${PORT}`);
  });
}
