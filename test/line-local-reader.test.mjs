import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readLocalLineMessages, readLocalLineChatIdentity, readLocalLineGuiChatIdentity,
  runReaderProcess, validateLocalScope } from '../src/extensions/line-local-reader.mjs';
const args = { chatName: '測試群組', dateFrom: '2026-09-05', dateTo: '2026-09-11' };
const response = () => ({ ok: true, chatName: args.chatName, chatIdentity: { kind: 'group', displayName: args.chatName, uiIdentityVerified: false }, count: 1, messages: [{ sourceRef: 'message:test', date: '2026-09-05', sourceTimestamp: Date.parse('2026-09-05T00:00:00+08:00'), text: '多行\n😀' }], scope: { kind: 'local_database', truncated: false, requested: { ...args, messageLimit: 200, mediaMode: 'metadata' } }, pagination: { hasMore: false, nextCursor: null } });
const run = result => async () => ({ code: 0, stdout: JSON.stringify(result) });

test('portable reader refuses implicit Python lookup and preserves fixed setup diagnostics', async () => {
  for (const pythonPath of [null, '', 'python', 'python.exe', './python.exe']) {
    await assert.rejects(runReaderProcess(args, { pythonPath }), { code: 'LOCAL_READER_UNAVAILABLE' });
  }
  for (const code of ['ENGINE_DLL_UNCONFIGURED', 'ENGINE_DLL_INVALID_PATH', 'ENGINE_DLL_UNAVAILABLE', 'RUNTIME_DIRECTORY_UNAVAILABLE']) {
    await assert.rejects(readLocalLineMessages(args, { runProcess: async () => ({ code: 2,
      stdout: JSON.stringify({ ok: false, code, message: 'private diagnostic must not escape' }) }) }),
    error => error.code === code && !error.message.includes('private diagnostic'));
  }
});

test('private chat identity lookup excludes history and is not a public message option', async () => {
  let calls = 0;
  await assert.rejects(readLocalLineMessages({ ...args, identityOnly: true }, { runProcess: async () => { calls++; } }));
  assert.equal(calls, 0);
  const runProcess = async scope => ({ code: 0, stdout: JSON.stringify({ ...response(),
    chatRef: 'chat:' + 'a'.repeat(24), count: 0, messages: [],
    scope: { kind: 'local_chat_identity', truncated: false, requested: scope } }) });
  const result = await readLocalLineChatIdentity(args, { runProcess });
  assert.equal(result.scope.requested.identityOnly, true);
  assert.deepEqual(result.messages, []);
  await assert.rejects(readLocalLineChatIdentity(args, { runProcess: run(response()) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
});

test('GUI chat identity wrapper creates a private one-day Taipei scope and requires uniqueness proof', async () => {
  const now = () => new Date('2026-09-11T16:30:00.000Z');
  const chatRef = 'chat:' + 'b'.repeat(24);
  const runProcess = async scope => {
    assert.deepEqual(scope, {
      chatName: args.chatName,
      dateFrom: '2026-09-12',
      dateTo: '2026-09-12',
      identityOnly: true,
      guiIdentityOnly: true,
      messageLimit: 200,
      mediaMode: 'metadata',
    });
    return { code: 0, stdout: JSON.stringify({
      ok: true, chatName: scope.chatName, chatRef,
      chatIdentity: { kind: 'group', displayName: scope.chatName,
        uiIdentityVerified: false, guiDisplayNameUnique: true },
      count: 0, messages: [], pagination: { hasMore: false, nextCursor: null },
      scope: { kind: 'local_gui_chat_identity', truncated: false, requested: scope },
    }) };
  };
  const result = await readLocalLineGuiChatIdentity({ chatName: args.chatName }, { now, runProcess });
  assert.equal(result.chatRef, chatRef);
  assert.equal(result.chatIdentity.guiDisplayNameUnique, true);
  assert.equal(result.scope.kind, 'local_gui_chat_identity');

  for (const mutate of [
    result => { delete result.chatIdentity.guiDisplayNameUnique; },
    result => { result.chatIdentity.guiDisplayNameUnique = false; },
    result => { result.scope.kind = 'local_chat_identity'; },
    result => { result.scope.requested.guiIdentityOnly = undefined; },
    result => { result.scope.requested.unrelatedName = 'must not escape'; },
    result => { result.chatIdentity.unrelatedId = 'must not escape'; },
    result => { result.count = 1; },
    result => { result.messages = [{ sourceRef: 'message:private' }]; },
  ]) {
    await assert.rejects(readLocalLineGuiChatIdentity({ chatName: args.chatName }, { now,
      runProcess: async requested => {
        const output = await runProcess(requested);
        const value = JSON.parse(output.stdout);
        mutate(value);
        return { code: 0, stdout: JSON.stringify(value) };
      } }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  }
});

test('GUI-only flag is rejected by public readers and malformed wrapper input never launches', async () => {
  const internal = { ...args, identityOnly: true, guiIdentityOnly: true };
  assert.throws(() => validateLocalScope(internal), { code: 'LINE_INVALID_ARGUMENT' });
  let calls = 0;
  await assert.rejects(readLocalLineMessages(internal, { runProcess: async () => { calls++; } }),
    { code: 'LINE_INVALID_ARGUMENT' });
  for (const input of [args, { chatName: args.chatName, chatType: 'group' }, { chatName: ' x' }, null]) {
    await assert.rejects(readLocalLineGuiChatIdentity(input, { runProcess: async () => { calls++; } }),
      { code: 'LINE_INVALID_ARGUMENT' });
  }
  assert.equal(calls, 0);
});

test('GUI identity unavailable is a safe propagated child code', async () => {
  await assert.rejects(readLocalLineGuiChatIdentity({ chatName: args.chatName }, {
    now: () => new Date('2026-09-12T00:00:00Z'),
    runProcess: async () => ({ code: 2, stdout: JSON.stringify({
      ok: false, code: 'GUI_IDENTITY_UNAVAILABLE', message: 'private inventory detail',
    }) }),
  }), error => error.code === 'GUI_IDENTITY_UNAVAILABLE'
    && !error.message.includes('inventory detail'));
});

test('bad scope is rejected before starting a subprocess', async () => {
  let calls = 0;
  for (const changed of [{ dateFrom: '2026-02-30' }, { dateTo: '2026-10-06' }, { chatName: ' x' }, { messageLimit: 0 }, { allChats: true }, { dateFrom: undefined }, { query: '\0' }]) {
    await assert.rejects(readLocalLineMessages({ ...args, ...changed }, { runProcess: async () => { calls++; } }));
  }
  assert.equal(calls, 0);
});

test('scoped Unicode results pass intact; identity/date/count mismatch refuses', async () => {
  const result = await readLocalLineMessages(args, { runProcess: run(response()) });
  assert.equal(result.messages[0].text, '多行\n😀');
  for (const result of [{ ...response(), chatName: '其他群組' }, { ...response(), count: 0 }, { ...response(), messages: [{ sourceRef: 'id', date: '2026-09-12' }] }]) {
    await assert.rejects(readLocalLineMessages(args, { runProcess: run(result) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  }
});

test('child exceptions and malicious error strings never leak', async () => {
  const secret = 'do-not-print-key';
  for (const runProcess of [async () => { throw new Error(secret); }, async () => ({ code: 2, stdout: JSON.stringify({ ok: false, code: secret, message: secret }) }), async () => ({ code: 0, stdout: secret })]) {
    try { await readLocalLineMessages(args, { runProcess }); assert.fail('should refuse'); }
    catch (error) { assert.ok(!error.message.includes(secret)); assert.ok(!error.code.includes(secret)); }
  }
});

test('null/numeric dates, timestamp mismatch and query-echo mismatch are refused', async () => {
  for (const date of [null, 20260905, '2026-02-30']) {
    const result = response(); result.messages[0].date = date;
    await assert.rejects(readLocalLineMessages(args, { runProcess: run(result) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  }
  const shifted = response(); shifted.messages[0].sourceTimestamp += 86400000;
  await assert.rejects(readLocalLineMessages(args, { runProcess: run(shifted) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  const wrong = response(); wrong.scope.requested.query = 'needle';
  await assert.rejects(readLocalLineMessages({ ...args, query: 'needle' }, { runProcess: run(wrong) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  const echo = response(); echo.scope.requested.messageLimit = 100;
  await assert.rejects(readLocalLineMessages(args, { runProcess: run(echo) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
});

test('new media options default to metadata and invalid selectors fail before process launch', async () => {
  let calls = 0;
  for (const changed of [{ mediaMode: null }, { mediaMode: 'all' }, { mediaSourceRefs: [] },
    { mediaMode: 'preview', mediaSourceRefs: ['message:bad'] }, { cursor: 'bad!' }]) {
    await assert.rejects(readLocalLineMessages({ ...args, ...changed }, { runProcess: async () => { calls++; } }));
  }
  assert.equal(calls, 0);
  const refs = ['message:' + 'a'.repeat(24)];
  await readLocalLineMessages({ ...args, mediaMode: 'preview', mediaSourceRefs: refs }, { runProcess: async scope => {
    assert.equal(scope.mediaMode, 'preview');
    assert.deepEqual(scope.mediaSourceRefs, refs);
    return { code: 0, stdout: JSON.stringify({ ...response(), scope: { kind: 'local_database', truncated: false, requested: scope } }) };
  } });
});

test('cursor scope is checked before launch and response cursor must identify oldest returned row', async () => {
  const chat = 'chat:' + 'a'.repeat(24);
  const token = { v: 1, scope: createHash('sha256').update(JSON.stringify([args.chatName, args.dateFrom, args.dateTo, null])).digest('hex'),
    chat, time: response().messages[0].sourceTimestamp, id: 'fixture-id' };
  const cursor = Buffer.from(JSON.stringify(token)).toString('base64url');
  let calls = 0;
  await assert.rejects(readLocalLineMessages({ ...args, query: 'other', cursor }, { runProcess: async () => { calls++; } }), { code: 'CURSOR_SCOPE_MISMATCH' });
  assert.equal(calls, 0);
  const result = response();
  result.chatRef = chat;
  result.messages[0].sourceMessageId = token.id;
  result.scope.truncated = true;
  result.pagination = { hasMore: true, nextCursor: cursor };
  await readLocalLineMessages(args, { runProcess: run(result) });
  result.messages[0].sourceMessageId = 'different';
  await assert.rejects(readLocalLineMessages(args, { runProcess: run(result) }), { code: 'LOCAL_READER_INVALID_RESULT' });
});

test('safe diagnostic codes survive child failures without exception text or keys', async () => {
  for (const code of ['RESULT_TOO_LARGE', 'MAIN_DATABASE_AMBIGUOUS', 'LINE_PROCESS_AMBIGUOUS', 'ENGINE_INTEGRITY_FAILED', 'SESSION_KEY_CHANGED', 'INVALID_CURSOR']) {
    await assert.rejects(readLocalLineMessages(args, { runProcess: async () => ({ code: 2, stdout: JSON.stringify({ ok: false, code, message: 'secret path/key' }) }) }), error => {
      assert.equal(error.code, code);
      assert.equal(error.message.includes('secret'), false);
      return true;
    });
  }
});

test('successful reader results must include complete pagination even on the final page', async () => {
  for (const pagination of [undefined, null, false, [], {}, { hasMore: false }, { hasMore: true, nextCursor: null }]) {
    await assert.rejects(readLocalLineMessages(args, { runProcess: run({ ...response(), pagination }) }), { code: 'LOCAL_READER_INVALID_RESULT' });
  }
});

test('direct kind is scope-bound and reader identity must agree before accepting rows', async () => {
  const requested = { ...args, chatType: 'direct' };
  let calls = 0;
  await assert.rejects(readLocalLineMessages({ ...args, chatType: 'all' }, { runProcess: async () => { calls++; } }));
  assert.equal(calls, 0);
  const result = response();
  result.scope.requested.chatType = 'direct';
  await assert.rejects(readLocalLineMessages(requested, { runProcess: run(result) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  result.chatIdentity.kind = 'direct';
  await readLocalLineMessages(requested, { runProcess: run(result) });
  result.chatIdentity.displayName = 'other';
  await assert.rejects(readLocalLineMessages(requested, { runProcess: run(result) }), { code: 'LOCAL_READER_SCOPE_MISMATCH' });
  const token = { v: 1, scope: createHash('sha256').update(JSON.stringify([args.chatName, args.dateFrom, args.dateTo, null, 'direct'])).digest('hex'),
    chat: 'chat:' + 'a'.repeat(24), time: result.messages[0].sourceTimestamp, id: 'fixture' };
  const cursor = Buffer.from(JSON.stringify(token)).toString('base64url');
  for (const chatType of ['group', 'auto', undefined]) {
    await assert.rejects(readLocalLineMessages({ ...args, chatType, cursor }, { runProcess: async () => { calls++; } }), { code: 'CURSOR_SCOPE_MISMATCH' });
  }
  assert.equal(calls, 0);
});
