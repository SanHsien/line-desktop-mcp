"""Single-request local LINE reader. JSON scope in stdin; scoped JSON out.

Only encrypted DB/WAL snapshot copies touch disk, and are removed after use.
Key extraction remains local and bounded. This command never operates LINE UI.
"""
import ctypes as ct
import datetime as dt
from ctypes import wintypes as wt
import importlib.util
import json
import os
from pathlib import Path
import sys
import time
import uuid

from line_scoped_core import ReaderError, read_scoped, validate_scope
from line_sqlite_engine import Connection
from line_encrypted_snapshot import capture_snapshot, SnapshotError
from line_media import inspect_attachment
from line_client_compatibility import ClientBuildError, verify_client_build
import line_session_locator as session_locator
from line_runtime_paths import RuntimePathError, application_runtime_dir


def serialize_result(result):
    data = json.dumps(result,ensure_ascii=False,separators=(',', ':'))
    if len(data.encode()) > 4*1024*1024:
        raise ReaderError('RESULT_TOO_LARGE')
    return data


def find_line_process():
    class ProcessEntry(ct.Structure):
        _fields_ = [('size',wt.DWORD),('usage',wt.DWORD),('pid',wt.DWORD),
                    ('heap',ct.c_size_t),('module',wt.DWORD),('threads',wt.DWORD),
                    ('parent',wt.DWORD),('priority',wt.LONG),('flags',wt.DWORD),
                    ('exe',wt.WCHAR*260)]
    kernel = ct.WinDLL('kernel32',use_last_error=True)
    kernel.CreateToolhelp32Snapshot.argtypes = [wt.DWORD,wt.DWORD]
    kernel.CreateToolhelp32Snapshot.restype = wt.HANDLE
    kernel.Process32FirstW.argtypes = [wt.HANDLE,ct.POINTER(ProcessEntry)]
    kernel.Process32NextW.argtypes = [wt.HANDLE,ct.POINTER(ProcessEntry)]
    kernel.CloseHandle.argtypes = [wt.HANDLE]
    handle = kernel.CreateToolhelp32Snapshot(2,0)
    if handle == ct.c_void_p(-1).value:
        raise ReaderError('LINE_PROCESS_UNAVAILABLE')
    try:
        entry = ProcessEntry()
        entry.size = ct.sizeof(entry)
        found = []
        ok = kernel.Process32FirstW(handle,ct.byref(entry))
        if not ok and ct.get_last_error() != 18:  # ERROR_NO_MORE_FILES
            raise ReaderError('LINE_PROCESS_UNAVAILABLE')
        while ok:
            if entry.exe.lower() == 'line.exe':
                found.append(entry.pid)
            ok = kernel.Process32NextW(handle,ct.byref(entry))
            if not ok and ct.get_last_error() != 18:
                raise ReaderError('LINE_PROCESS_UNAVAILABLE')
        if not found:
            raise ReaderError('LINE_PROCESS_UNAVAILABLE')
        if len(found) > 1:
            raise ReaderError('LINE_PROCESS_AMBIGUOUS')
        return found[0]
    finally:
        kernel.CloseHandle(handle)


def acquire_passphrase(first_page, base, db_path):
    try:
        return session_locator.acquire_passphrase(
            first_page,
            pid=find_line_process(),
            expected_exe=base/'bin/current/LINE.exe',
            db_path=db_path,
        )
    except session_locator.LocatorError as error:
        raise ReaderError(error.code) from error


def passphrase_matches(first_page, passphrase):
    spec = importlib.util.spec_from_file_location('line_probe', Path(__file__).with_name('line-schema-probe.py'))
    probe = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(probe)
    return probe.first_page_valid(first_page, probe.derive_key(passphrase))


def run(args):
    started_clock = time.perf_counter()
    timings = {}
    request_started_at = dt.datetime.now(dt.timezone.utc).isoformat()
    validate_scope(args)  # Required before any process/filesystem reads.
    base = Path(os.environ['LOCALAPPDATA'])/'LINE'
    phase = time.perf_counter()
    try:
        client_build = verify_client_build(base/'bin/current/LINE.exe')
    except ClientBuildError as error:
        raise ReaderError(error.code) from error
    timings['clientBuildVerificationMs'] = round((time.perf_counter() - phase) * 1000, 3)
    paths = list((base/'Data/db').glob('*.edb'))
    main = [p for p in paths if not p.name.startswith(('album','chatStats','keep'))]
    if len(main) != 1:
        raise ReaderError('MAIN_DATABASE_AMBIGUOUS')
    phase = time.perf_counter()
    raw, wal, snapshot = capture_snapshot(main[0])
    timings['initialSnapshotMs'] = round((time.perf_counter() - phase) * 1000, 3)
    phase = time.perf_counter()
    passphrase, key_metrics = acquire_passphrase(raw[:4096],base,main[0])
    timings['keyAcquisitionMs'] = round((time.perf_counter() - phase) * 1000, 3)
    # Initialization can be slow. Query a newly observed DB/WAL pair after it,
    # then revalidate the session key against that pair before opening SQLite.
    phase = time.perf_counter()
    raw, wal, snapshot = capture_snapshot(main[0])
    if not passphrase_matches(raw[:4096], passphrase):
        raise ReaderError('SESSION_KEY_CHANGED')
    timings['freshSnapshotAndValidationMs'] = round((time.perf_counter() - phase) * 1000, 3)
    phase = time.perf_counter()
    try:
        runtime_dir = application_runtime_dir(create=True)
    except RuntimePathError:
        raise ReaderError('RUNTIME_DIRECTORY_UNAVAILABLE') from None
    directory = runtime_dir / ('line-reader-'+uuid.uuid4().hex)
    directory.mkdir(mode=0o700)  # Only this request's transient private copy.
    path = directory/'snapshot.edb'
    try:
        with path.open('xb') as stream:
            stream.write(raw)
        raw = None
        if wal:
            with Path(str(path)+'-wal').open('xb') as stream:
                stream.write(wal)
        wal = None
        with Connection(path,passphrase) as db:
            passphrase = None
            db.execute('BEGIN')
            db.restrict_reads()
            result = read_scoped(db,args,{**snapshot,'engine':db.version,**key_metrics,
                                        'clientBuild':client_build,
                                        'readOnly':True,'sourceFilesOpenedByEngine':False},
                                  lambda kind,meta,info,ref,chat_id: inspect_attachment(kind,meta,info,ref,base/'Cache',chat_id))
        completed_at = dt.datetime.now(dt.timezone.utc)
        captured_at = dt.datetime.fromisoformat(snapshot['captureCompletedAt'])
        age_ms = (completed_at - captured_at).total_seconds() * 1000
        result['retrievedAt'] = completed_at.isoformat()
        result['freshness'] = {'requestStartedAt': request_started_at,
                               'snapshotCapturedAt': snapshot['captureCompletedAt'],
                               'queryCompletedAt': completed_at.isoformat(),
                               'snapshotAgeMs': round(age_ms, 3) if age_ms >= 0 else None,
                               'clockOrderValid': age_ms >= 0,
                               'recapturedAfterInitialization': True,
                               'sourceCurrentAtCompletionVerified': False}
        timings['snapshotFileAndQueryMs'] = round((time.perf_counter() - phase) * 1000, 3)
    finally:
        cleanup_started = time.perf_counter()
        passphrase = None
        # Only this request's known filenames, never a computed recursive deletion.
        for name in ('snapshot.edb-wal','snapshot.edb-shm','snapshot.edb-journal','snapshot.edb'):
            (directory/name).unlink(missing_ok=True)
        directory.rmdir()
        timings['snapshotCleanupMs'] = round((time.perf_counter() - cleanup_started) * 1000, 3)
    # A locator hint can only be stored after this new snapshot validated, the
    # scope-limited read and snapshot cleanup completed, and the final public
    # result fits the same 4 MiB transport limit used by main().
    phase = time.perf_counter()
    timings['resultValidationAndLocatorUpdateMs'] = 0
    timings['totalMs'] = round((time.perf_counter() - started_clock) * 1000, 3)
    result['readerTiming'] = timings
    serialized = serialize_result(result)
    # Very large valid responses can skip the optional hint update. Reserve a
    # small bound for the two final numeric timing replacements before commit.
    if len(serialized.encode('utf-8')) + 1024 > 4 * 1024 * 1024:
        return result
    session_locator.commit_after_success(getattr(key_metrics, 'cache_commit', None))
    timings['resultValidationAndLocatorUpdateMs'] = round((time.perf_counter() - phase) * 1000, 3)
    timings['totalMs'] = round((time.perf_counter() - started_clock) * 1000, 3)
    return result


def main():
    sys.stdout.reconfigure(encoding='utf-8')
    try:
        payload = sys.stdin.buffer.read(16385)
        if len(payload) > 16384:
            raise ReaderError('INVALID_SCOPE')
        result = run(json.loads(payload))
        data = serialize_result(result)
        print(data)
    except Exception as error:
        code = error.code if isinstance(error,(ReaderError,SnapshotError)) else 'LOCAL_READER_FAILED'
        print(json.dumps({'ok':False,'code':code,'message':'Local LINE read did not complete; no success claimed.'}))
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
