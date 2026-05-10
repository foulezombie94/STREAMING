const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Basic health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Mount routes
app.use('/api/movix', require('./routes/movix'));
app.use('/api/proxy', require('./routes/proxy'));
app.use('/api/coflix', require('./routes/coflix'));

module.exports = app;
