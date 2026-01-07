const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, 'logs');
const FILES = {
  backend: path.join(LOG_DIR, 'backend.log'),
  security: path.join(LOG_DIR, 'security.log'),
  gameplay: path.join(LOG_DIR, 'gameplay.log'),
  client: path.join(LOG_DIR, 'frontend.log')
};

function ensureDirectory() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

ensureDirectory();

function formatEntry(level, scope, message, meta) {
  const timestamp = new Date().toISOString();
  const payload = meta && Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] [${scope}] ${message}${payload}\n`;
}

async function appendToFile(filePath, entry) {
  try {
    await fs.promises.appendFile(filePath, entry, 'utf8');
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Falha ao gravar log', error);
  }
}

function writeLog(fileKey, level, scope, message, meta = {}) {
  const targetFile = FILES[fileKey] || FILES.backend;
  const normalizedLevel = level.toUpperCase();
  const entry = formatEntry(normalizedLevel, scope, message, meta);
  appendToFile(targetFile, entry);
}

module.exports = {
  info(scope, message, meta) {
    writeLog('backend', 'INFO', scope, message, meta);
  },
  warn(scope, message, meta) {
    writeLog('backend', 'WARN', scope, message, meta);
  },
  error(scope, message, meta) {
    writeLog('backend', 'ERROR', scope, message, meta);
  },
  security(scope, message, meta) {
    writeLog('security', 'WARN', scope, message, meta);
  },
  gameplay(scope, message, meta) {
    writeLog('gameplay', 'INFO', scope, message, meta);
  },
  client(level, scope, message, meta) {
    const normalizedLevel = (level || 'INFO').toUpperCase();
    writeLog('client', normalizedLevel, scope, message, meta);
  }
};
