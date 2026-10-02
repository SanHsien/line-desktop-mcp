import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

/**
 * One stable, machine-local lock shared by all LINE MCP Node processes.
 * Callers may override this only for isolated tests.
 */
export const DEFAULT_LINE_OPERATION_LOCK_PATH =
  join(homedir(), '.line-desktop-mcp', 'operation.lock');

export const LINE_BUSY = 'LINE_BUSY';

const OPERATION_KIND_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;
const HELPER_READY = 'LINE_OPERATION_LOCK_READY';
const HELPER_BUSY_EXIT_CODE = 75;
const HELPER_STARTUP_TIMEOUT_MS = 5_000;
const HELPER_RELEASE_TIMEOUT_MS = 5_000;
const HELPER_PATH = fileURLToPath(
  new URL('./hold-line-operation-lock.ps1', import.meta.url),
);

export class LineOperationBusyError extends Error {
  constructor({ lockPath, operation }) {
    super(
      `LINE_BUSY: ${operation} did not start because another LINE operation owns the lock.`,
    );
    this.name = 'LineOperationBusyError';
    this.code = LINE_BUSY;
    this.lockPath = lockPath;
    this.operation = operation;
  }
}

export class LineOperationLockError extends Error {
  constructor(message, { code, lockPath, operation, cause, cleanupError } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'LineOperationLockError';
    this.code = code;
    this.lockPath = lockPath;
    this.operation = operation;
    if (cleanupError !== undefined) {
      this.cleanupError = cleanupError;
    }
  }
}

/**
 * A cleanup error means the callback returned, so an external LINE action may
 * already have completed. Callers must inspect the chat state before retrying.
 */
export class LineOperationCleanupError extends Error {
  constructor(reason, { lockPath, operation, cause } = {}) {
    super(
      `LINE_LOCK_CLEANUP_FAILED (${reason}): the LINE operation may already have completed; inspect state before retrying.`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'LineOperationCleanupError';
    this.code = 'LINE_LOCK_CLEANUP_FAILED';
    this.reason = reason;
    this.lockPath = lockPath;
    this.operation = operation;
    this.operationMayHaveCompleted = true;
  }
}

/**
 * Used whenever both the callback and lock cleanup fail. The original callback
 * failure remains available through both `cause` and `callbackError`.
 */
export class LineOperationCallbackAndCleanupError extends Error {
  constructor(callbackError, cleanupError) {
    super(
      'LINE_OPERATION_CALLBACK_AND_CLEANUP_FAILED: the callback failed and the lock could not be cleaned up; inspect LINE state before retrying.',
      { cause: callbackError },
    );
    this.name = 'LineOperationCallbackAndCleanupError';
    this.code = 'LINE_OPERATION_CALLBACK_AND_CLEANUP_FAILED';
    this.callbackError = callbackError;
    this.cleanupError = cleanupError;
    this.operationMayHaveCompleted = true;
  }
}

/**
 * Run one complete LINE operation while holding a cross-process filesystem
 * lock. There is intentionally no retry, stale-lock takeover, or replay.
 *
 * `operation` must be a stable kind such as `history-read` or `send-text`.
 * Never pass chat names, recipients, or message content.
 *
 * @template T
 * @param {string} operation
 * @param {() => T | Promise<T>} fn
 * @param {{lockPath?: string, testHooks?: {beforeRelease?: () => unknown | Promise<unknown>, afterAcquire?: ({ terminateHelper: () => Promise<unknown> }) => unknown | Promise<unknown>}}} [options]
 * @returns {Promise<T>}
 */
export async function withLineOperation(operation, fn, options = {}) {
  const operationKind = validateOperationKind(operation);
  if (typeof fn !== 'function') {
    throw new TypeError('fn must be a function.');
  }

  const { lockPath, beforeRelease, afterAcquire } = normalizeOptions(options);
  const lock = await acquireLock(lockPath, operationKind, afterAcquire);

  let callbackResult;
  let callbackError;
  let callbackThrew = false;

  try {
    callbackResult = await fn();
  } catch (error) {
    callbackError = error;
    callbackThrew = true;
  }

  let cleanupError;
  try {
    await releaseOwnedLock(lock, beforeRelease);
  } catch (error) {
    cleanupError = error;
  }

  if (callbackThrew) {
    if (cleanupError !== undefined) {
      throw new LineOperationCallbackAndCleanupError(callbackError, cleanupError);
    }
    throw callbackError;
  }

  if (cleanupError !== undefined) {
    throw cleanupError;
  }

  return callbackResult;
}

function validateOperationKind(operation) {
  if (typeof operation !== 'string' || !OPERATION_KIND_PATTERN.test(operation)) {
    throw new TypeError(
      'operation must be a short stable operation kind (for example, history-read or send-text), never a chat name or message content.',
    );
  }
  return operation;
}

function normalizeOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('options must be an object when provided.');
  }

  const lockPath = options.lockPath ?? DEFAULT_LINE_OPERATION_LOCK_PATH;
  if (typeof lockPath !== 'string' || !isAbsolute(lockPath)) {
    throw new TypeError('lockPath must be an absolute path.');
  }

  const testHooks = options.testHooks;
  if (
    testHooks !== undefined &&
    (testHooks === null || typeof testHooks !== 'object' || Array.isArray(testHooks))
  ) {
    throw new TypeError('testHooks must be an object when provided.');
  }

  const beforeRelease = testHooks?.beforeRelease;
  if (beforeRelease !== undefined && typeof beforeRelease !== 'function') {
    throw new TypeError('testHooks.beforeRelease must be a function when provided.');
  }

  const afterAcquire = testHooks?.afterAcquire;
  if (afterAcquire !== undefined && typeof afterAcquire !== 'function') {
    throw new TypeError('testHooks.afterAcquire must be a function when provided.');
  }

  return { lockPath, beforeRelease, afterAcquire };
}

async function acquireLock(lockPath, operation, afterAcquire) {
  try {
    await fs.mkdir(dirname(lockPath), { recursive: true });
  } catch (cause) {
    throw new LineOperationLockError(
      'LINE_LOCK_ACQUIRE_FAILED: could not prepare the lock directory.',
      {
        code: 'LINE_LOCK_ACQUIRE_FAILED',
        lockPath,
        operation,
        cause,
      },
    );
  }

  const metadataText = `${JSON.stringify({
    nonce: randomBytes(16).toString('hex'),
    pid: process.pid,
    createdAt: new Date().toISOString(),
    operation,
  })}\n`;

  let helper;
  let guard;
  try {
    helper = startLockHelper(lockPath, metadataText);
    await waitForReadiness(helper);
    guard = await openParentGuard(lockPath, metadataText);
    if (afterAcquire !== undefined) {
      await afterAcquire({
        terminateHelper: () => terminateHelper(helper),
      });
    }
  } catch (cause) {
    const helperCleanupError = helper === undefined ? undefined : await stopHelper(helper);
    const guardCleanupError = guard === undefined ? undefined : await closeParentGuard(guard);
    const cleanupError = helperCleanupError ?? guardCleanupError;
    if (cause?.kind === 'busy') {
      throw new LineOperationBusyError({ lockPath, operation });
    }
    throw new LineOperationLockError(
      'LINE_LOCK_ACQUIRE_FAILED: could not create the operation lock.',
      {
        code: 'LINE_LOCK_ACQUIRE_FAILED',
        lockPath,
        operation,
        cause,
        cleanupError,
      },
    );
  }

  return { helper, guard, lockPath, operation };
}

async function openParentGuard(lockPath, expectedMetadata) {
  let guard;
  try {
    guard = await fs.open(lockPath, 'r');
    const metadata = await guard.readFile('utf8');
    if (metadata !== expectedMetadata) {
      throw new Error('Lock metadata did not match the acquired lock.');
    }
    return guard;
  } catch (cause) {
    if (guard !== undefined) {
      await closeParentGuard(guard).catch(() => {});
    }
    throw cause;
  }
}

function startLockHelper(lockPath, metadataText) {
  const systemRoot = process.env.SystemRoot;
  if (typeof systemRoot !== 'string' || systemRoot.length === 0) {
    throw new Error('Windows PowerShell is unavailable.');
  }

  const powershellPath = join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  const child = spawn(
    powershellPath,
    [
      '-NoProfile',
      '-NonInteractive',
      '-NoLogo',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      HELPER_PATH,
      '-LockPath',
      lockPath,
      '-MetadataBase64',
      Buffer.from(metadataText, 'utf8').toString('base64'),
    ],
    {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  // Stderr is deliberately discarded: provider and path details must not be
  // reflected in public lock errors.
  child.stderr.resume();
  child.stdin.on('error', () => {});

  return {
    child,
    completion: observeHelper(child),
  };
}

function observeHelper(child) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (!settled) {
        settled = true;
        resolve(result);
      }
    };
    child.once('error', (error) => finish({ error }));
    child.once('exit', (code, signal) => finish({ code, signal }));
  });
}

function waitForReadiness(helper) {
  return new Promise((resolve, reject) => {
    let output = '';
    let settled = false;
    const timeout = setTimeout(
      () => finish(new Error('Lock helper readiness timed out.')),
      HELPER_STARTUP_TIMEOUT_MS,
    );

    const onData = (chunk) => {
      output += chunk.toString('utf8');
      const newlineIndex = output.indexOf('\n');
      if (newlineIndex === -1) {
        if (output.length > HELPER_READY.length + 1) {
          finish(new Error('Lock helper returned an invalid readiness token.'));
        }
        return;
      }

      const token = output.slice(0, newlineIndex).replace(/\r$/, '');
      const trailingOutput = output.slice(newlineIndex + 1);
      if (token !== HELPER_READY || trailingOutput.length !== 0) {
        finish(new Error('Lock helper returned an invalid readiness token.'));
        return;
      }
      finish(undefined);
    };

    const onCompletion = (result) => {
      if (result.code === HELPER_BUSY_EXIT_CODE) {
        const busy = new Error('Lock helper found an existing lock.');
        busy.kind = 'busy';
        finish(busy);
        return;
      }
      finish(new Error('Lock helper exited before readiness.'));
    };

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      helper.child.stdout.off('data', onData);
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    }

    helper.child.stdout.on('data', onData);
    void helper.completion.then(onCompletion);
  });
}

async function releaseOwnedLock(lock, beforeRelease) {
  let hookError;
  if (beforeRelease !== undefined) {
    try {
      await beforeRelease();
    } catch (cause) {
      hookError = createCleanupError('LINE_LOCK_TEST_HOOK_FAILED', lock, cause);
    }
  }

  let releaseError;
  try {
    await releaseHelper(lock.helper);
  } catch (cause) {
    releaseError = createCleanupError('LINE_LOCK_CLOSE_FAILED', lock, cause);
  }

  let guardError;
  try {
    await closeParentGuard(lock.guard);
  } catch (cause) {
    guardError = createCleanupError('LINE_LOCK_CLOSE_FAILED', lock, cause);
  }

  // The hook is the established test-facing cleanup failure. It takes
  // precedence after the helper has still been signalled and reaped.
  if (hookError !== undefined) throw hookError;
  if (releaseError !== undefined) throw releaseError;
  if (guardError !== undefined) throw guardError;
}

async function releaseHelper(helper) {
  endHelperInput(helper);
  const result = await waitForCompletion(helper.completion, HELPER_RELEASE_TIMEOUT_MS);
  if (result.timedOut) {
    await terminateHelper(helper);
    throw new Error('Lock helper release timed out.');
  }
  if (result.error !== undefined || result.code !== 0) {
    throw new Error('Lock helper could not release the lock.');
  }
}

async function stopHelper(helper) {
  endHelperInput(helper);
  const result = await waitForCompletion(helper.completion, HELPER_RELEASE_TIMEOUT_MS);
  if (!result.timedOut) return undefined;
  return terminateHelper(helper);
}

async function closeParentGuard(guard) {
  const result = await waitForPromise(guard.close(), HELPER_RELEASE_TIMEOUT_MS);
  if (result.timedOut) {
    throw new Error('Lock parent guard close timed out.');
  }
  if (result.error !== undefined) {
    throw new Error('Lock parent guard could not close.');
  }
}

function endHelperInput(helper) {
  try {
    if (!helper.child.stdin.destroyed) {
      helper.child.stdin.end();
    }
  } catch {
    // Completion is still observed below; no child text is exposed.
  }
}

function waitForCompletion(completion, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    void completion.then((result) => {
      clearTimeout(timeout);
      resolve({ timedOut: false, ...result });
    });
  });
}

function waitForPromise(promise, timeoutMs) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
    void Promise.resolve(promise).then(
      () => {
        clearTimeout(timeout);
        resolve({ timedOut: false });
      },
      (error) => {
        clearTimeout(timeout);
        resolve({ timedOut: false, error });
      },
    );
  });
}

async function terminateHelper(helper) {
  try {
    helper.child.kill();
  } catch (cause) {
    return cause;
  }

  const result = await waitForCompletion(helper.completion, HELPER_RELEASE_TIMEOUT_MS);
  if (result.timedOut) {
    return new Error('Lock helper did not exit after termination.');
  }
  return undefined;
}

function createCleanupError(reason, lock, cause) {
  return new LineOperationCleanupError(reason, {
    lockPath: lock.lockPath,
    operation: lock.operation,
    cause,
  });
}
