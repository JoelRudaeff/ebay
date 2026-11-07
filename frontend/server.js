const express = require('express');
const helmet = require('helmet');
const path = require('path');

const app = express();
app.use(helmet({ contentSecurityPolicy: false })); // CSP is set at the nginx edge
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Storefront listening on :${PORT}`));
