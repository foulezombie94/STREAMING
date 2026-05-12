const cluster = require('cluster');
const os = require('os');
require('dotenv').config();

const NUM_WORKERS = parseInt(process.env.NUM_WORKERS) || Math.min(os.cpus().length, 6);

if (cluster.isPrimary || cluster.isMaster) {
  console.log(`🚀 Movieverse Master ${process.pid} started`);
  console.log(`📊 Spawning ${NUM_WORKERS} workers...`);

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
