import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { LineToolError, requireChat, configuredPythonPath } from './line-runtime.mjs';

const SCRIPT = fileURLToPath(new URL('./python/line-reader.py', import.meta.url));
const MAX_OUTPUT = 4 * 1024 * 1024;
const fail = code => new LineToolError(code, 'Local LINE read did not complete. No GUI fallback or send was attempted.');

export function validateLocalScope(args, { allowIdentityOnly = false } = {}) {
  if (!args || typeof args !== 'object' || Array.isArray(args)
      || Object.keys(args).some(key => !['chatName', 'chatType', 'dateFrom', 'dateTo', 'messageLimit', 'query', 'cursor', 'mediaMode', 'mediaSourceRefs', ...(allowIdentityOnly ? ['identityOnly'] : [])].includes(key))) throw fail('LINE_INVALID_ARGUMENT');
  requireChat(args.chatName);
  if (args.chatType !== undefined && !['auto', 'group', 'direct'].includes(args.chatType)) throw fail('LINE_INVALID_ARGUMENT');
  if (/[\x00-\x1f]/u.test(args.chatName)) throw fail('LINE_INVALID_ARGUMENT');
  for (const field of ['dateFrom', 'dateTo']) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(args[field] ?? '') || args[field].startsWith('0000')) throw fail('LINE_INVALID_ARGUMENT');
    const date = new Date(`${args[field]}T00:00:00Z`);
    if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== args[field]) throw fail('LINE_INVALID_ARGUMENT');
  }
  const days = (Date.parse(args.dateTo) - Date.parse(args.dateFrom)) / 86400000;
  const messageLimit = args.messageLimit ?? 200;
  if (days < 0 || days > 30 || !Number.isInteger(messageLimit) || messageLimit < 1 || messageLimit > 1000
      || (args.query !== undefined && (typeof args.query !== 'string' || !args.query.length || args.query.length > 1000 || args.query.includes('\0')))) throw fail('LINE_INVALID_ARGUMENT');
  const mediaMode = args.mediaMode ?? 'metadata';
  if (args.identityOnly !== undefined && (args.identityOnly !== true || mediaMode !== 'metadata'
      || ['query', 'cursor', 'mediaSourceRefs'].some(key => key in args))) throw fail('LINE_INVALID_ARGUMENT');
  if ((args.mediaMode !== undefined && !['metadata', 'preview'].includes(args.mediaMode))
      || (args.mediaSourceRefs !== undefined && (mediaMode !== 'preview' || !Array.isArray(args.mediaSourceRefs)
        || args.mediaSourceRefs.length < 1 || args.mediaSourceRefs.length > 20
        || args.mediaSourceRefs.some(ref => typeof ref !== 'string' || !/^message:[0-9a-f]{24}$/u.test(ref))
        || new Set(args.mediaSourceRefs).size !== args.mediaSourceRefs.length))) throw fail('LINE_INVALID_ARGUMENT');
  if (args.cursor !== undefined) validateCursor(args.cursor, args);
  return { ...args, messageLimit, mediaMode };
}

function validateCursor(value, scope) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2048 || !/^[A-Za-z0-9_-]+$/u.test(value)) throw fail('INVALID_CURSOR');
  let token;
  try { token = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw fail('INVALID_CURSOR'); }
  if (!token || typeof token !== 'object' || Array.isArray(token)
      || Object.keys(token).sort().join(',') !== 'chat,id,scope,time,v' || token.v !== 1
      || typeof token.scope !== 'string' || !/^[0-9a-f]{64}$/u.test(token.scope)
      || typeof token.chat !== 'string' || !/^chat:[0-9a-f]{24}$/u.test(token.chat)
      || !Number.isSafeInteger(token.time)
      || !((typeof token.id === 'string' && token.id.length > 0 && [...token.id].length <= 200 && !token.id.includes('\0'))
        || Number.isSafeInteger(token.id))) throw fail('INVALID_CURSOR');
  const fields = [scope.chatName, scope.dateFrom, scope.dateTo, scope.query ?? null];
  if (scope.chatType && scope.chatType !== 'auto') fields.push(scope.chatType);
  const expected = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  if (token.scope !== expected) throw fail('CURSOR_SCOPE_MISMATCH');
  const instant = new Date(token.time + 28800000);
  if (!Number.isFinite(instant.valueOf())) throw fail('INVALID_CURSOR');
  const date = instant.toISOString().slice(0, 10);
  if (date < scope.dateFrom || date > scope.dateTo) throw fail('INVALID_CURSOR');
  return token;
}

export function runReaderProcess(payload, { pythonPath = configuredPythonPath(), timeoutMs = 120000 } = {}) {
  if (!configuredPythonPath(pythonPath)) return Promise.reject(fail('LOCAL_READER_UNAVAILABLE'));
  return new Promise((resolve, reject) => {
    const child = spawn(pythonPath, ['-B', SCRIPT], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = [];
    let bytes = 0, settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) { child.kill(); reject(error); } else resolve(value);
    };
    const timer = setTimeout(() => finish(fail('LOCAL_READER_TIMEOUT')), timeoutMs);
    child.on('error', () => finish(fail('LOCAL_READER_UNAVAILABLE')));
    child.stdin.on('error', () => finish(fail('LOCAL_READER_UNAVAILABLE')));
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT) finish(fail('LOCAL_READER_RESULT_TOO_LARGE'));
      else chunks.push(chunk);
    });
    child.stderr.on('data', () => {}); // Never forward process/key/SQLite exception text.
    child.on('close', code => finish(null, { code, stdout: Buffer.concat(chunks).toString('utf8') }));
    child.stdin.end(JSON.stringify(payload));
  });
}

export async function readLocalLineChatIdentity(args, options = {}) {
  validateLocalScope(args);
  return readLocalLineMessages({ ...args, identityOnly: true }, { ...options, allowIdentityOnly: true });
}

export async function readLocalLineMessages(args, { runProcess = runReaderProcess, allowIdentityOnly = false } = {}) {
  const scope = validateLocalScope(args, { allowIdentityOnly });
  let output;
  try { output = await runProcess(scope); }
  catch (error) { throw error instanceof LineToolError ? error : fail('LOCAL_READER_UNAVAILABLE'); }
  if (typeof output?.stdout !== 'string' || Buffer.byteLength(output.stdout) > MAX_OUTPUT) throw fail('LOCAL_READER_INVALID_RESULT');
  let result;
  try { result = JSON.parse(output.stdout); } catch { throw fail('LOCAL_READER_INVALID_RESULT'); }
  const allowedErrors = new Set(['CHAT_NOT_FOUND', 'CHAT_AMBIGUOUS', 'SOURCE_BUSY', 'SESSION_KEY_UNAVAILABLE',
    'LINE_BUILD_UNVERIFIED',
    'SESSION_KEY_CHANGED', 'DATABASE_READ_FAILED', 'RESULT_TOO_LARGE', 'INVALID_CURSOR', 'CURSOR_SCOPE_MISMATCH',
    'MAIN_DATABASE_AMBIGUOUS', 'LINE_PROCESS_UNAVAILABLE', 'LINE_PROCESS_AMBIGUOUS', 'ENGINE_INTEGRITY_FAILED',
    'ENGINE_CIPHER_UNAVAILABLE', 'ENGINE_DLL_UNCONFIGURED', 'ENGINE_DLL_INVALID_PATH', 'ENGINE_DLL_UNAVAILABLE',
    'RUNTIME_DIRECTORY_UNAVAILABLE',
    'SOURCE_IO_ERROR', 'SOURCE_NOT_READONLY', 'INVALID_SOURCE_TIME', 'INVALID_SOURCE_ID',
    'SOURCE_ACCESS_DENIED', 'SOURCE_NOT_FOUND', 'SOURCE_REPARSE', 'SOURCE_NOT_FILE', 'SOURCE_TOO_LARGE',
    'DATABASE_HEADER_INVALID', 'DATABASE_SIZE_INVALID', 'WAL_HEADER_INVALID', 'WAL_PAGE_SIZE_MISMATCH', 'WAL_NO_VALID_COMMIT']);
  if (!result || typeof result !== 'object' || output.code !== 0 || result.ok !== true) throw fail(allowedErrors.has(result?.code) ? result.code : 'LOCAL_READER_FAILED');
  if (result.chatName !== scope.chatName || result.scope?.kind !== (scope.identityOnly ? 'local_chat_identity' : 'local_database')
      || result.scope?.requested?.identityOnly !== scope.identityOnly
      || (scope.identityOnly && (result.count !== 0 || result.scope.truncated !== false || !/^chat:[0-9a-f]{24}$/u.test(result.chatRef ?? '')))
      || !['direct', 'group'].includes(result.chatIdentity?.kind)
      || result.chatIdentity?.displayName !== scope.chatName || result.chatIdentity?.uiIdentityVerified !== false
      || (scope.chatType && scope.chatType !== 'auto' && result.chatIdentity.kind !== scope.chatType)
      || result.scope?.requested?.chatName !== scope.chatName
      || result.scope?.requested?.chatType !== scope.chatType
      || result.scope?.requested?.dateFrom !== scope.dateFrom || result.scope?.requested?.dateTo !== scope.dateTo
       || result.scope?.requested?.messageLimit !== scope.messageLimit || result.scope?.requested?.query !== scope.query
       || result.scope?.requested?.cursor !== scope.cursor || result.scope?.requested?.mediaMode !== scope.mediaMode
       || JSON.stringify(result.scope?.requested?.mediaSourceRefs) !== JSON.stringify(scope.mediaSourceRefs)
      || !Array.isArray(result.messages) || !Number.isInteger(result.count) || result.count < 0
      || result.count !== result.messages.length || result.count > scope.messageLimit
      || result.messages.some(message => !message || typeof message !== 'object'
        || typeof message.sourceRef !== 'string' || typeof message.date !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/u.test(message.date) || message.date < scope.dateFrom || message.date > scope.dateTo
        || !Number.isSafeInteger(message.sourceTimestamp)
        || new Date(message.sourceTimestamp + 28800000).toISOString().slice(0, 10) !== message.date
       || (scope.query !== undefined && (typeof message.text !== 'string' || !message.text.includes(scope.query))))) throw fail('LOCAL_READER_SCOPE_MISMATCH');
  if (!result.pagination || typeof result.pagination !== 'object' || Array.isArray(result.pagination)) throw fail('LOCAL_READER_INVALID_RESULT');
  {
    if (typeof result.pagination.hasMore !== 'boolean' || result.pagination.hasMore !== result.scope.truncated
        || (result.pagination.hasMore && (!result.messages.length || typeof result.pagination.nextCursor !== 'string'))
        || (!result.pagination.hasMore && result.pagination.nextCursor !== null)) throw fail('LOCAL_READER_INVALID_RESULT');
    if (result.pagination.nextCursor !== null) {
      const next = validateCursor(result.pagination.nextCursor, scope);
      const oldest = result.messages[0];
      if (next.chat !== result.chatRef || next.time !== oldest.sourceTimestamp || String(next.id) !== oldest.sourceMessageId) throw fail('LOCAL_READER_INVALID_RESULT');
    }
  }
  return result;
}
